import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "save-plan");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
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
    const { id, data } = await req.json();
    if (!id || typeof id !== "string") {
      return new Response(
        JSON.stringify({ error: "id is required" }),
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    if (!data || typeof data !== "object") {
      return new Response(
        JSON.stringify({ error: "data payload is required" }),
        { status: 400, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const organizationId = requireOrganizationId(auth);
    const now = new Date().toISOString();
    const path = `planblueprints/${organizationId}/${id}.json`;
    const payload = {
      ...(data as Record<string, unknown>),
      id,
      organization_id: organizationId,
      updated_at: now,
    };

    const { error } = await adminClient.storage
      .from("content")
      .upload(path, JSON.stringify(payload), {
        upsert: true,
        contentType: "application/json",
      });

    if (error) {
      console.error("save-plan upload failed:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const { error: upsertError } = await adminClient
      .from("planblueprints")
      .upsert({
        id,
        organization_id: organizationId,
        storage_path: path,
        updated_at: now,
      } as any, { onConflict: "id" });

    if (upsertError) {
      console.error("save-plan metadata failed:", upsertError);
      return new Response(
        JSON.stringify({ error: upsertError.message }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, organization_id: organizationId }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("save-plan error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

