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

interface JoinClassBody {
  code: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "join-class");
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

  let body: JoinClassBody;
  try {
    body = await req.json() as JoinClassBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.code) {
    return new Response(JSON.stringify({ error: "code is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const organizationId = requireOrganizationId(auth);
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: "User ID is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    // Find class by code
    const { data: classData, error: classError } = await adminSupabase
      .from("classes")
      .select("id")
      .eq("join_code", body.code.toUpperCase())
      .single();

    if (classError || !classData) {
      return new Response(JSON.stringify({ error: "Invalid class code" }), {
        status: 404,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Add user to class
    const { error: memberError } = await adminSupabase
      .from("class_members")
      .insert({
        class_id: classData.id,
        user_id: userId,
        role: "student",
        organization_id: organizationId,
      });

    if (memberError) {
      console.error("[join-class] Error adding member:", memberError);
      // If already a member, return success
      if (memberError.code === '23505') {
        return new Response(
          JSON.stringify({ success: true, classId: classData.id }),
          { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, classId: classData.id }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (error) {
    console.error("join-class error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});


