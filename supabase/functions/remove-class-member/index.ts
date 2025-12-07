import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface RemoveClassMemberBody {
  classId: string;
  studentId: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "remove-class-member");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: stdHeaders(req) });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return new Response(JSON.stringify({ error: message }), {
      status: message === "Missing organization_id" ? 400 : 401,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  let body: RemoveClassMemberBody;
  try {
    body = await req.json() as RemoveClassMemberBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.classId || !body?.studentId) {
    return new Response(JSON.stringify({ error: "classId and studentId are required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  requireOrganizationId(auth);

  try {
    const { error } = await adminSupabase
      .from("class_members")
      .delete()
      .eq("class_id", body.classId)
      .eq("user_id", body.studentId);

    if (error) {
      console.error("[remove-class-member] Error:", error);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (error) {
    console.error("remove-class-member error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

