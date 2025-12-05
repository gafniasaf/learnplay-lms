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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleOptions(req, "save-record");
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
    const { entity, values } = await req.json();

    if (!entity || typeof entity !== "string") {
      return new Response(
        JSON.stringify({ error: "entity is required" }),
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    if (!values || typeof values !== "object") {
      return new Response(
        JSON.stringify({ error: "values is required" }),
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const organizationId = requireOrganizationId(auth);
    const normalizedEntity = entity.trim().toLowerCase();

    const existingId = typeof (values as Record<string, unknown>).id === "string"
      ? (values as Record<string, unknown>).id as string
      : null;
    const id = existingId ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = {
      ...(values as Record<string, unknown>),
      id,
    };

    const record: Record<string, unknown> = {
      id,
      organization_id: organizationId,
      entity: normalizedEntity,
      title: (values as Record<string, unknown>).title || (values as Record<string, unknown>).name || entity,
      data: payload,
      updated_at: now,
    };

    if (!existingId) {
      record.created_at = now;
    }

    const { error: dbError } = await supabase
      .from("entity_records")
      .upsert(record, { onConflict: "id" });

    if (dbError) {
      console.error("entity_records upsert error:", dbError);
      return new Response(
        JSON.stringify({ error: `Failed to save record: ${dbError.message}` }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id, organization_id: organizationId }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (error) {
    console.error("save-record error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});
