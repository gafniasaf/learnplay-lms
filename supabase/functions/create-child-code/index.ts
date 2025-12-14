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

interface CreateChildCodeBody {
  studentId: string;
}

function generateCode(): string {
  // 6-char code to match UI + DB expectations (uppercase, no confusing chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "create-child-code");
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

  let body: CreateChildCodeBody;
  try {
    body = await req.json() as CreateChildCodeBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.studentId) {
    return new Response(JSON.stringify({ error: "studentId is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  // Keep org requirement explicit (system invariant)
  requireOrganizationId(auth);

  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Authorization: for now, only the student can generate their own code.
    // (Teacher tooling can be added later once org teacher roles are fully wired.)
    if (auth.type === "user" && auth.userId && auth.userId !== body.studentId) {
      return new Response(JSON.stringify({ error: "Forbidden: can only generate code for your own student account" }), {
        status: 403,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Insert into the real table used by RLS + parent linking.
    // Bounded retries to avoid infinite loops on collisions.
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = generateCode();
      const { error } = await adminSupabase.from("child_codes").insert({
        student_id: body.studentId,
        code,
        expires_at: expiresAt,
        used: false,
      });

      if (!error) {
        return new Response(JSON.stringify({ code, expiresAt }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json" }),
        });
      }

      // Unique violation -> retry; otherwise fail loudly
      const errCode = (error as any)?.code;
      if (errCode === "23505") continue;

      console.error("[create-child-code] insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    return new Response(JSON.stringify({ error: "Failed to generate unique code after retries" }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (error) {
    console.error("create-child-code error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});


