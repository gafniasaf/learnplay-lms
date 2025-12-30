/**
 * book-claim-job (AGENT ONLY)
 *
 * Claims the next pending/failed book render job using the DB helper:
 * - public.get_next_pending_book_job()
 *
 * Returns:
 * { ok: true, job: book_render_jobs row | null }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method not allowed" }, httpStatus: 405, requestId }, 200);
  }

  try {
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, httpStatus: 401, requestId }, 200);
    }

    if (auth.type !== "agent") {
      return json({ ok: false, error: { code: "unauthorized", message: "Agent token required" }, httpStatus: 401, requestId }, 200);
    }

    const { data, error } = await adminSupabase.rpc("get_next_pending_book_job");
    if (error) {
      console.error("[book-claim-job] RPC error:", error);
      return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
    }

    const rows = Array.isArray(data) ? data : [];
    const job = rows.length > 0 ? rows[0] : null;
    if (!job) {
      return json({ ok: true, job: null, requestId }, 200);
    }

    // Best-effort: mark run as running when first job is claimed.
    // (Job row is already marked "processing" by the RPC.)
    const now = new Date().toISOString();
    const { error: runErr } = await adminSupabase
      .from("book_runs")
      .update({ status: "running", started_at: now })
      .eq("id", (job as any).run_id)
      .eq("status", "queued");

    if (runErr) {
      console.error("[book-claim-job] Failed to update run status:", runErr);
      return json({ ok: false, error: { code: "db_error", message: runErr.message }, httpStatus: 500, requestId }, 200);
    }

    return json({ ok: true, job, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-claim-job] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


