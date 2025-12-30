/**
 * book-job-heartbeat (AGENT ONLY)
 *
 * Updates last_heartbeat for a book_render_jobs row via:
 * - public.update_job_heartbeat(job_id uuid, job_table text)
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

interface Body {
  jobId: string;
}

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

    let body: Body;
    try {
      body = await req.json() as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!body?.jobId || typeof body.jobId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "jobId is required" }, httpStatus: 400, requestId }, 200);
    }

    const { error } = await adminSupabase.rpc("update_job_heartbeat", { job_id: body.jobId, job_table: "book_render_jobs" });
    if (error) {
      console.error("[book-job-heartbeat] RPC error:", error);
      return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
    }

    return json({ ok: true, jobId: body.jobId, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-job-heartbeat] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


