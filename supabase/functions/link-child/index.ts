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

interface LinkChildBody {
  code: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "link-child");
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

  let body: LinkChildBody;
  try {
    body = await req.json() as LinkChildBody;
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

  // Keep org requirement explicit (system invariant)
  requireOrganizationId(auth);
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: "User ID is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const code = body.code.trim().toUpperCase();
    if (code.length !== 6) {
      return new Response(JSON.stringify({ error: "Invalid code: must be 6 characters" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { data: codeRow, error: codeErr } = await adminSupabase
      .from("child_codes")
      .select("id, student_id, expires_at, used")
      .eq("code", code)
      .maybeSingle();

    if (codeErr) {
      console.error("[link-child] lookup error:", codeErr);
      return new Response(JSON.stringify({ error: codeErr.message }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    if (!codeRow) {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    if (codeRow.used) {
      return new Response(JSON.stringify({ error: "This code has already been used" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const expiresAt = new Date(codeRow.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "This code has expired" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const studentId = String(codeRow.student_id);

    // Create parent-child link (idempotent)
    const { error: linkErr } = await adminSupabase.from("parent_children").insert({
      parent_id: userId,
      child_id: studentId,
    });

    if (linkErr) {
      const errCode = (linkErr as any)?.code;
      if (errCode !== "23505") {
        console.error("[link-child] insert error:", linkErr);
        return new Response(JSON.stringify({ error: linkErr.message }), {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json" }),
        });
      }
    }

    // Mark code as used (best-effort, but should succeed)
    const { error: usedErr } = await adminSupabase
      .from("child_codes")
      .update({ used: true })
      .eq("id", codeRow.id);

    if (usedErr) {
      console.error("[link-child] failed to mark code used:", usedErr);
    }

    const alreadyLinked = (linkErr as any)?.code === "23505";
    return new Response(JSON.stringify({
      success: true,
      childId: studentId,
      alreadyLinked,
      message: alreadyLinked ? "Child already linked" : "Child linked successfully",
    }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (error) {
    console.error("link-child error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});


