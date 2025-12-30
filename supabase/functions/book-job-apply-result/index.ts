/**
 * book-job-apply-result (AGENT ONLY)
 *
 * Marks a book_render_jobs row as done/failed and optionally records artifacts.
 * Also updates book_runs and (for chapter jobs) book_run_chapters.
 *
 * Request (POST):
 * {
 *   jobId: string,
 *   status: "done" | "failed",
 *   error?: string,                     // required when status="failed"
 *   progressStage?: string,
 *   progressPercent?: number,           // 0..100
 *   progressMessage?: string,
 *   resultPath?: string,
 *   processingDurationMs?: number,
 *   artifacts?: Array<{
 *     kind: "canonical" | "overlay" | "assembled" | "html" | "pdf" | "layout_report" | "prince_log" | "debug",
 *     path: string,
 *     sha256?: string,
 *     bytes?: number,
 *     contentType?: string,
 *     chapterIndex?: number | null
 *   }>
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

type ArtifactKind =
  | "canonical"
  | "overlay"
  | "assembled"
  | "html"
  | "pdf"
  | "layout_report"
  | "prince_log"
  | "debug";

const ALLOWED_ARTIFACT_KINDS: readonly ArtifactKind[] = [
  "canonical",
  "overlay",
  "assembled",
  "html",
  "pdf",
  "layout_report",
  "prince_log",
  "debug",
] as const;

interface ArtifactInput {
  kind: ArtifactKind;
  path: string;
  sha256?: string;
  bytes?: number;
  contentType?: string;
  chapterIndex?: number | null;
}

interface Body {
  jobId: string;
  status: "done" | "failed";
  error?: string;
  progressStage?: string;
  progressPercent?: number;
  progressMessage?: string;
  resultPath?: string;
  processingDurationMs?: number;
  artifacts?: ArtifactInput[];
}

function isSafeStoragePath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (path.includes("..")) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  return true;
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
    if (!body?.status || !["done", "failed"].includes(body.status)) {
      return json({ ok: false, error: { code: "invalid_request", message: "status must be done or failed" }, httpStatus: 400, requestId }, 200);
    }
    if (body.status === "failed") {
      if (!body.error || typeof body.error !== "string" || !body.error.trim()) {
        return json({ ok: false, error: { code: "invalid_request", message: "error is required when status=failed" }, httpStatus: 400, requestId }, 200);
      }
    }
    if (body.progressPercent !== undefined) {
      if (typeof body.progressPercent !== "number" || body.progressPercent < 0 || body.progressPercent > 100) {
        return json({ ok: false, error: { code: "invalid_request", message: "progressPercent must be a number between 0 and 100" }, httpStatus: 400, requestId }, 200);
      }
    }

    const now = new Date().toISOString();

    const { data: job, error: jobErr } = await adminSupabase
      .from("book_render_jobs")
      .select("id, run_id, book_id, book_version_id, target, chapter_index")
      .eq("id", body.jobId)
      .single();

    if (jobErr || !job) {
      return json({ ok: false, error: { code: "not_found", message: "Job not found" }, httpStatus: 404, requestId }, 200);
    }

    const jobUpdate: Record<string, unknown> = {
      status: body.status,
      completed_at: now,
      error: body.status === "failed" ? body.error : null,
    };
    if (typeof body.progressStage === "string") jobUpdate.progress_stage = body.progressStage;
    if (typeof body.progressMessage === "string") jobUpdate.progress_message = body.progressMessage;
    if (typeof body.resultPath === "string") jobUpdate.result_path = body.resultPath;
    if (typeof body.processingDurationMs === "number") jobUpdate.processing_duration_ms = body.processingDurationMs;
    if (typeof body.progressPercent === "number") {
      jobUpdate.progress_percent = body.progressPercent;
    } else if (body.status === "done") {
      jobUpdate.progress_percent = 100;
    }

    const { error: updErr } = await adminSupabase
      .from("book_render_jobs")
      .update(jobUpdate)
      .eq("id", body.jobId);

    if (updErr) {
      console.error("[book-job-apply-result] Failed to update job:", updErr);
      return json({ ok: false, error: { code: "db_error", message: updErr.message }, httpStatus: 500, requestId }, 200);
    }

    // Update chapter status when applicable
    if (job.target === "chapter" && typeof job.chapter_index === "number") {
      const chapterStatus = body.status === "done" ? "completed" : "failed";
      const chRow: Record<string, unknown> = {
        run_id: job.run_id,
        chapter_index: job.chapter_index,
        status: chapterStatus,
        completed_at: now,
        error: body.status === "failed" ? body.error : null,
        progress_percent: body.status === "done" ? 100 : 0,
        progress_stage: typeof body.progressStage === "string" ? body.progressStage : null,
        progress_message: typeof body.progressMessage === "string" ? body.progressMessage : null,
      };

      const { error: chErr } = await adminSupabase
        .from("book_run_chapters")
        .upsert(chRow, { onConflict: "run_id,chapter_index" });

      if (chErr) {
        console.error("[book-job-apply-result] Failed to upsert book_run_chapters:", chErr);
        return json({ ok: false, error: { code: "db_error", message: chErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    // Insert artifacts (optional)
    const artifacts = Array.isArray(body.artifacts) ? body.artifacts : [];
    if (artifacts.length > 0) {
      const expectedPrefix = `${job.book_id}/${job.book_version_id}/runs/${job.run_id}/`;

      const rows: Record<string, unknown>[] = [];
      for (const a of artifacts) {
        if (!a || typeof a !== "object") continue;
        if (!ALLOWED_ARTIFACT_KINDS.includes(a.kind)) {
          return json({ ok: false, error: { code: "invalid_request", message: `Invalid artifact kind: ${String((a as any).kind)}` }, httpStatus: 400, requestId }, 200);
        }
        if (!a.path || typeof a.path !== "string" || !isSafeStoragePath(a.path)) {
          return json({ ok: false, error: { code: "invalid_request", message: "Each artifact.path must be a safe storage path" }, httpStatus: 400, requestId }, 200);
        }
        if (!a.path.startsWith(expectedPrefix)) {
          return json({ ok: false, error: { code: "invalid_request", message: "artifact.path must be within this run prefix" }, httpStatus: 400, requestId }, 200);
        }

        const chapterIndex =
          typeof a.chapterIndex === "number"
            ? a.chapterIndex
            : (typeof job.chapter_index === "number" ? job.chapter_index : null);

        rows.push({
          run_id: job.run_id,
          chapter_index: chapterIndex,
          kind: a.kind,
          path: a.path,
          sha256: typeof a.sha256 === "string" ? a.sha256 : null,
          bytes: typeof a.bytes === "number" ? a.bytes : null,
          content_type: typeof a.contentType === "string" ? a.contentType : null,
        });
      }

      if (rows.length > 0) {
        const { error: artErr } = await adminSupabase.from("book_artifacts").insert(rows);
        if (artErr) {
          console.error("[book-job-apply-result] Failed to insert artifacts:", artErr);
          return json({ ok: false, error: { code: "db_error", message: artErr.message }, httpStatus: 500, requestId }, 200);
        }
      }
    }

    // Update run status
    if (body.status === "failed") {
      const runUpdate: Record<string, unknown> = {
        status: "failed",
        error: body.error,
        completed_at: now,
      };
      if (typeof body.progressStage === "string") runUpdate.progress_stage = body.progressStage;
      if (typeof body.progressMessage === "string") runUpdate.progress_message = body.progressMessage;
      if (typeof body.progressPercent === "number") runUpdate.progress_percent = body.progressPercent;

      const { error: runErr } = await adminSupabase
        .from("book_runs")
        .update(runUpdate)
        .eq("id", job.run_id);

      if (runErr) {
        console.error("[book-job-apply-result] Failed to update run (failed):", runErr);
        return json({ ok: false, error: { code: "db_error", message: runErr.message }, httpStatus: 500, requestId }, 200);
      }
    } else {
      // If all jobs are done and none failed/stale/dead_letter, mark run complete.
      const { data: statuses, error: stErr } = await adminSupabase
        .from("book_render_jobs")
        .select("status")
        .eq("run_id", job.run_id);

      if (stErr) {
        console.error("[book-job-apply-result] Failed to fetch run job statuses:", stErr);
        return json({ ok: false, error: { code: "db_error", message: stErr.message }, httpStatus: 500, requestId }, 200);
      }

      const s = Array.isArray(statuses) ? statuses.map((r: any) => String(r.status || "")) : [];
      const hasOpen = s.some((x) => x === "pending" || x === "processing");
      const hasBad = s.some((x) => x === "failed" || x === "stale" || x === "dead_letter");

      if (!hasOpen && !hasBad) {
        const { error: runErr } = await adminSupabase
          .from("book_runs")
          .update({ status: "completed", completed_at: now, progress_percent: 100, progress_stage: "completed" })
          .eq("id", job.run_id);
        if (runErr) {
          console.error("[book-job-apply-result] Failed to mark run completed:", runErr);
          return json({ ok: false, error: { code: "db_error", message: runErr.message }, httpStatus: 500, requestId }, 200);
        }
      }
    }

    return json({
      ok: true,
      jobId: body.jobId,
      runId: job.run_id,
      status: body.status,
      artifactsRecorded: Array.isArray(body.artifacts) ? body.artifacts.length : 0,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-job-apply-result] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


