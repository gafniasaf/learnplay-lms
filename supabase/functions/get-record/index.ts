import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "get-record");
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return new Response(
      JSON.stringify({ error: message }),
      { status: message === "Missing organization_id" ? 400 : 401, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }

  try {
    let entity: string | null = null;
    let id: string | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        entity = body.entity;
        id = body.id;
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }), 
          { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
        );
      }
    } else {
      const url = new URL(req.url);
      entity = url.searchParams.get("entity");
      id = url.searchParams.get("id");
    }

    if (!entity || !id) {
      return new Response(
        JSON.stringify({ error: "Missing entity or id params" }), 
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const organizationId = requireOrganizationId(auth);
    const normalizedEntity = entity.trim().toLowerCase();

    const { data, error: dbError } = await supabase
      .from("entity_records")
      .select("id, data, organization_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("entity", normalizedEntity)
      .eq("id", id)
      .maybeSingle();

    if (dbError) {
      console.error(`get-record query failed for ${normalizedEntity}#${id}:`, dbError);
      return new Response(
        JSON.stringify({ error: dbError.message }), 
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ error: "Record not found or access denied" }), 
        { status: 404, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const payload = {
      ...(data.data as Record<string, unknown>),
      id: data.id,
      organization_id: data.organization_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return new Response(JSON.stringify(payload), { 
      headers: stdHeaders(req, { "Content-Type": "application/json" }) 
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), 
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});
