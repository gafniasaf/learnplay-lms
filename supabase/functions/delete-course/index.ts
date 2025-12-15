import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { Errors } from "../_shared/error.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

interface DeletePayload {
  courseId: string;
  confirm: string;
}

async function getUserRoles(supabase: any, userId: string): Promise<{ role: string; organization_id: string | null }[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, organization_id")
    .eq("user_id", userId);
  if (error) {
    console.warn("[delete-course] roles fetch error:", error);
    return [];
  }
  return data || [];
}

Deno.serve(withCors(async (req) => {
  const reqId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed", requestId: reqId }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const originCheck = checkOrigin(req);
  if (originCheck) return originCheck;

  const rl = rateLimit(req);
  if (rl) return rl;

  try {
    const authHeader = req.headers.get("Authorization") || "";

    // Use service role but forward user JWT for RLS context
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    // Get user
    const token = authHeader?.replace(/^Bearer\s+/i, "") || "";
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return Errors.invalidAuth(reqId, req);
    }
    const userId = userData.user.id as string;
    const userEmail = userData.user.email || userId;

    // Admin check: superadmin or org_admin
    const roles = await getUserRoles(supabase, userId);
    const isAdmin = roles.some(r => r.role === "superadmin" || r.role === "org_admin");
    if (!isAdmin) {
      return Errors.forbidden("forbidden", reqId, req);
    }

    // Parse body
    const body = (await req.json()) as DeletePayload;
    if (!body?.courseId || typeof body.courseId !== "string") {
      return new Response(JSON.stringify({ error: "invalid_request", message: "courseId required", requestId: reqId }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!body?.confirm || body.confirm.trim() !== body.courseId.trim()) {
      return new Response(JSON.stringify({ error: "invalid_request", message: "confirm must equal courseId", requestId: reqId }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const courseId = body.courseId.trim();

    // Backup path
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupBase = `_deleted/${courseId}/${ts}`;
    const srcPath = `${courseId}/course.json`;
    const backupPath = `${backupBase}/course.json`;

    // Attempt to copy course.json to backup
    const { error: copyErr } = await supabase.storage
      .from("courses")
      // @ts-ignore: supabase-js Storage has copy in runtime
      .copy(srcPath, backupPath);

    if (copyErr) {
      console.warn("[delete-course] backup copy warning:", copyErr);
    }

    // Attempt to remove course.json (best-effort)
    const { error: rmErr } = await supabase.storage
      .from("courses")
      .remove([srcPath]);
    if (rmErr) {
      console.warn("[delete-course] remove warning:", rmErr);
    }

    // Mark deleted in metadata
    const { error: upErr } = await supabase
      .from("course_metadata")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", courseId);

    if (upErr) {
      console.error("[delete-course] update error:", upErr);
      return new Response(JSON.stringify({ error: "update_failed", details: upErr.message, requestId: reqId }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Audit
    await supabase.from("agent_audit").insert({
      method: "delete_course",
      actor: userEmail,
      args: { courseId, backupPath },
      success: true,
    });

    return new Response(JSON.stringify({ ok: true, backupPath }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[delete-course] error:", msg);
    return new Response(JSON.stringify({ error: "internal_error", message: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}));


