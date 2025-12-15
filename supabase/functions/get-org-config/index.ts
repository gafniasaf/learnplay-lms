import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DEFAULT_ORG_ID = Deno.env.get("ORGANIZATION_ID") || null;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(req: Request, status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: stdHeaders(req, {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    }),
  });
}

function jsonOk(req: Request, body: unknown, requestId: string): Response {
  return json(req, 200, body, requestId);
}

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    // Authenticate request
    const auth = await authenticateRequest(req);
    
    // Get organization ID from auth context or query params
    const url = new URL(req.url);
    const requestedOrgId = url.searchParams.get("organizationId");
    const organizationId =
      (isUuid(requestedOrgId) ? requestedOrgId : null) ||
      (isUuid(auth.organizationId) ? auth.organizationId : null) ||
      // In dev-agent mode, prefer the Edge secret as a stable default (avoids "first org" ambiguity).
      (auth.type === "agent" && isUuid(DEFAULT_ORG_ID) ? DEFAULT_ORG_ID : null) ||
      null;
    const slug = url.searchParams.get("slug");

    if (!organizationId && !slug) {
      // IMPORTANT: Lovable preview can blank-screen on non-200 responses.
      // Return a structured failure (still "fails loud" via payload).
      return jsonOk(req, { ok: false, error: { code: "invalid_request", message: "Organization ID or slug required" }, requestId }, requestId);
    }

    // Fetch organization
    // NOTE: organizations table has `settings` (json) not `branding`.
    // Branding lives under settings.branding (if present).
    let query = supabase.from("organizations").select("id, name, slug, settings");
    if (organizationId) {
      query = query.eq("id", organizationId);
    } else if (slug) {
      query = query.eq("slug", slug);
    }
    
    let { data: org, error: orgError } = await query.single();

    // If not found and we're in agent mode, fall back to DEFAULT_ORG_ID (Edge secret).
    if ((orgError || !org) && auth.type === "agent" && isUuid(DEFAULT_ORG_ID) && DEFAULT_ORG_ID !== organizationId) {
      const retry = await supabase
        .from("organizations")
        .select("id, name, slug, settings")
        .eq("id", DEFAULT_ORG_ID)
        .single();
      org = retry.data as any;
      orgError = retry.error as any;
    }

    if (orgError || !org) {
      // IMPORTANT: avoid non-200 to prevent Lovable blank screens.
      return jsonOk(
        req,
        {
          ok: false,
          error: {
            code: "org_not_found",
            message: "Organization not found",
            organizationId,
            slug: slug || null,
          },
          requestId,
        },
        requestId
      );
    }

    // Fetch tag types for this org
    const { data: tagTypes } = await supabase
      .from("tag_types")
      .select("key, label, is_enabled, display_order")
      .eq("org_id", org.id)
      .order("display_order");

    // Fetch tags for each tag type
    const tagTypesWithTags = await Promise.all(
      (tagTypes || []).map(async (tt) => {
        const { data: tags } = await supabase
          .from("tags")
          .select("id, value, slug")
          .eq("org_id", org.id)
          .eq("type_key", tt.key);
        
        return {
          key: tt.key,
          label: tt.label,
          isEnabled: tt.is_enabled,
          displayOrder: tt.display_order,
          tags: tags || [],
        };
      })
    );

    // Build response
    const config = {
      ok: true,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        branding: (org.settings && typeof org.settings === "object" ? (org.settings as any).branding : null) || {},
      },
      tagTypes: tagTypesWithTags,
      variantConfig: {
        difficulty: {
          levels: [
            { id: "easy", label: "Easy", order: 1 },
            { id: "medium", label: "Medium", order: 2 },
            { id: "hard", label: "Hard", order: 3 },
          ],
          default: "medium",
          exposeToUsers: true,
        },
      },
    };

    return jsonOk(req, config, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (message === "Unauthorized" || message.includes("Unauthorized")) {
      // IMPORTANT: avoid non-200 to prevent Lovable blank screens.
      return jsonOk(req, { ok: false, error: { code: "unauthorized", message: "Unauthorized" }, requestId }, requestId);
    }

    return jsonOk(req, { ok: false, error: { code: "internal_error", message }, requestId }, requestId);
  }
});

