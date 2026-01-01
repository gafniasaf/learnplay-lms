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
  const reqId = req.headers.get("x-request-id") || crypto.randomUUID();
  if (req.method === "OPTIONS") return handleOptions(req, reqId);
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const url = new URL(req.url);

    // Hybrid auth (agent token OR user session). For user session calls, we default to the
    // authenticated user as teacherId (no query param required).
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unauthorized";
      return new Response(JSON.stringify({ error: message }), {
        status: message.includes("organization_id") ? 400 : 401,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const organizationId = requireOrganizationId(auth);
    const teacherId =
      auth.userId ||
      url.searchParams.get("teacherId") ||
      url.searchParams.get("userId") ||
      null;

    if (!teacherId) {
      return new Response(JSON.stringify({ error: "teacherId required (missing user identity)" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Prevent user-session requests from enumerating other teachers' classes via query params.
    if (auth.type === "user" && auth.userId && teacherId !== auth.userId) {
      return new Response(JSON.stringify({ error: "Forbidden: teacherId must match authenticated user" }), {
        status: 403,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { data: classes, error } = await supabase
      .from("classes")
      .select("id, name, description, owner, org_id, created_at")
      .eq("org_id", organizationId)
      .eq("owner", teacherId)
      .order("name", { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    return new Response(JSON.stringify({ classes: classes || [] }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
