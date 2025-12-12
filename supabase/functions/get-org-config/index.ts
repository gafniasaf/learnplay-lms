import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
    const organizationId = url.searchParams.get("organizationId") || auth.organizationId;
    const slug = url.searchParams.get("slug");

    if (!organizationId && !slug) {
      return new Response(JSON.stringify({ error: "Organization ID or slug required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Fetch organization
    let query = supabase.from("organizations").select("id, name, slug, branding");
    if (organizationId) {
      query = query.eq("id", organizationId);
    } else if (slug) {
      query = query.eq("slug", slug);
    }
    
    const { data: org, error: orgError } = await query.single();

    if (orgError || !org) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
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
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        branding: org.branding || {},
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

    return new Response(JSON.stringify(config), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (message === "Unauthorized" || message.includes("Unauthorized")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

