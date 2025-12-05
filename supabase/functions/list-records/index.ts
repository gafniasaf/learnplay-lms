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
    return handleOptions(req, "list-records");
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
    let limit = 20;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        entity = body.entity;
        limit = body.limit || 20;
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }), 
          { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
        );
      }
    } else {
      const url = new URL(req.url);
      entity = url.searchParams.get("entity");
      const limitParam = url.searchParams.get("limit");
      if (limitParam) {
        const parsed = Number(limitParam);
        if (!Number.isNaN(parsed)) {
          limit = parsed;
        }
      }
    }

    if (!entity) {
      return new Response(
        JSON.stringify({ error: "Missing entity param" }), 
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const organizationId = requireOrganizationId(auth);
    const normalizedEntity = entity.trim().toLowerCase();
    const safeLimit = Math.min(100, Math.max(1, limit));

    const { data, error: dbError } = await supabase
      .from("entity_records")
      .select("id, data, organization_id, title, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("entity", normalizedEntity)
      .order("updated_at", { ascending: false })
      .limit(safeLimit);

    if (dbError) {
      console.error(`list-records query failed for entity ${normalizedEntity}:`, dbError);
      return new Response(
        JSON.stringify({ error: dbError.message }), 
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const records = (data || []).map((row) => ({
      ...(row.data as Record<string, unknown>),
      id: row.id,
      organization_id: row.organization_id,
      title: row.title ?? (row.data as Record<string, unknown>)?.["title"] ?? (row.data as Record<string, unknown>)?.["name"] ?? entity,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return new Response(
      JSON.stringify({ ok: true, records }), 
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), 
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});
