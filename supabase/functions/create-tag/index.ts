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

interface CreateTagRequest {
  typeKey: string;
  value: string;
  slug?: string;
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }

  try {
    // Auth: allow dev-agent auth (preview) or real user session.
    // In preview/dev-agent mode, we treat agent token as org-admin for the provided org.
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unauthorized";
      // IMPORTANT: avoid non-200 to prevent Lovable blank screens.
      return new Response(
        JSON.stringify({ ok: false, error: { code: "unauthorized", message: msg }, httpStatus: 401 }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const body = await req.json() as CreateTagRequest;
    const { typeKey, value, slug: providedSlug } = body;

    if (!typeKey || !value) {
      return new Response(
        JSON.stringify({ error: "typeKey and value are required" }),
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const slug = providedSlug || value.toLowerCase().replace(/\s+/g, '-');

    // In agent mode, scope tags to the org (unless caller provided organizationId explicitly in future).
    // This keeps preview isolated per-org and avoids polluting global tags.
    const organizationId = auth.type === "agent" ? (auth.organizationId ?? null) : null;

    const { data, error } = await supabase
      .from('tags')
      .insert({
        organization_id: organizationId,
        type_key: typeKey,
        value,
        slug,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error("[create-tag] Error:", error);
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, tag: data }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[create-tag] Error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

