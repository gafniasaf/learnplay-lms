/**
 * book-job-progress (AGENT ONLY)
 *
 * Updates progress fields for an in-flight book_render_jobs row:
 * - progress_stage
 * - progress_percent
 * - progress_message
 *
 * Also mirrors progress onto:
 * - public.book_runs (best-effort, keeps the run page "live")
 * - public.book_run_chapters (when the job targets a specific chapter)
 *
 * Request (POST):
 * {
 *   jobId: string,
 *   progressStage?: string,
 *   progressPercent?: number, // 0..100
 *   progressMessage?: string
 * }
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
  progressStage?: string;
  progressPercent?: number;
  progressMessage?: string;
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
    if (body.progressPercent !== undefined) {
      if (typeof body.progressPercent !== "number" || body.progressPercent < 0 || body.progressPercent > 100) {
        return json({ ok: false, error: { code: "invalid_request", message: "progressPercent must be a number between 0 and 100" }, httpStatus: 400, requestId }, 200);
      }
    }

    const { data: job, error: jobErr } = await adminSupabase
      .from("book_render_jobs")
      .select("id, run_id, target, chapter_index, status")
      .eq("id", body.jobId)
      .single();

    if (jobErr || !job) {
      return json({ ok: false, error: { code: "not_found", message: "Job not found" }, httpStatus: 404, requestId }, 200);
    }

    const status = String((job as any).status || "");
    if (status !== "processing") {
      return json({
        ok: false,
        error: { code: "invalid_state", message: `Job is not processing (status=${status})` },
        httpStatus: 409,
        requestId,
      }, 200);
    }

    const jobUpdate: Record<string, unknown> = {};
    if (typeof body.progressStage === "string") jobUpdate.progress_stage = body.progressStage;
    if (typeof body.progressMessage === "string") jobUpdate.progress_message = body.progressMessage;
    if (typeof body.progressPercent === "number") jobUpdate.progress_percent = body.progressPercent;

    if (Object.keys(jobUpdate).length) {
      const { error: updErr } = await adminSupabase
        .from("book_render_jobs")
        .update(jobUpdate)
        .eq("id", body.jobId);

      if (updErr) {
        console.error("[book-job-progress] Failed to update job:", updErr);
        return json({ ok: false, error: { code: "db_error", message: updErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    // Mirror progress onto the run (best-effort, but must not silently fail)
    const runUpdate: Record<string, unknown> = {};
    if (typeof body.progressStage === "string") runUpdate.progress_stage = body.progressStage;
    if (typeof body.progressMessage === "string") runUpdate.progress_message = body.progressMessage;
    if (typeof body.progressPercent === "number") runUpdate.progress_percent = body.progressPercent;
    if (Object.keys(runUpdate).length) {
      const { error: runErr } = await adminSupabase
        .from("book_runs")
        .update(runUpdate)
        .eq("id", (job as any).run_id);
      if (runErr) {
        console.error("[book-job-progress] Failed to update run:", runErr);
        return json({ ok: false, error: { code: "db_error", message: runErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    // Mirror progress onto the chapter row when applicable.
    if ((job as any).target === "chapter" && typeof (job as any).chapter_index === "number") {
      const chUpdate: Record<string, unknown> = {
        run_id: (job as any).run_id,
        chapter_index: (job as any).chapter_index,
      };
      if (typeof body.progressStage === "string") chUpdate.progress_stage = body.progressStage;
      if (typeof body.progressMessage === "string") chUpdate.progress_message = body.progressMessage;
      if (typeof body.progressPercent === "number") chUpdate.progress_percent = body.progressPercent;

      // Keep chapter state "running" if it was queued.
      chUpdate.status = "running";

      const { error: chErr } = await adminSupabase
        .from("book_run_chapters")
        .upsert(chUpdate, { onConflict: "run_id,chapter_index" });
      if (chErr) {
        console.error("[book-job-progress] Failed to upsert book_run_chapters:", chErr);
        return json({ ok: false, error: { code: "db_error", message: chErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    return json({ ok: true, jobId: body.jobId, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-job-progress] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


