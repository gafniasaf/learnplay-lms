import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, stdHeaders } from "../_shared/cors.ts";
import { runJob } from "./runner.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitJobEvent } from "../_shared/job-events.ts";

interface JobRequestBody {
  jobType?: string;
  payload?: Record<string, unknown>;
  worker?: boolean;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "ai-job-runner");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ ok: false, error: "BLOCKED: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  let body: JobRequestBody;
  try {
    body = await req.json() as JobRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const url = new URL(req.url);
  const workerMode = body?.worker === true || url.searchParams.get("worker") === "1";

  try {
    // Back-compat: default behavior remains "execute a specific job type"
    if (!workerMode) {
      if (!body?.jobType || typeof body.jobType !== "string") {
        return new Response(JSON.stringify({ error: "jobType is required" }), {
          status: 400,
          headers: stdHeaders(req, { "Content-Type": "application/json" }),
        });
      }
      const result = await runJob(body.jobType, body.payload ?? {});
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Worker mode (Dawn-style): pick next pending course job with DB lock + heartbeat, then call generate-course.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    const { data: jobs, error: pickErr } = await admin.rpc("get_next_pending_job", {});
    if (pickErr) {
      return new Response(JSON.stringify({ ok: false, error: `Failed to select job: ${pickErr.message}` }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }
    const job = Array.isArray(jobs) ? jobs[0] : null;
    if (!job?.id) {
      return new Response(JSON.stringify({ ok: true, processed: false, message: "No pending jobs" }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

    const jobId = String(job.id);
    const ctx = { requestId, jobId, courseId: job.course_id };
    try {
      await emitJobEvent(jobId, "generating", 10, "Starting generation", ctx);
    } catch {
      // best-effort
    }
    try {
      // Heartbeat (best-effort)
      try { await admin.rpc("update_job_heartbeat", { job_id: jobId, job_table: "ai_course_jobs" }); } catch {}

      const genUrl = `${SUPABASE_URL}/functions/v1/generate-course?jobId=${encodeURIComponent(jobId)}`;
      const genResp = await fetch(genUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: job.subject,
          gradeBand: job.grade_band,
          grade: job.grade,
          itemsPerGroup: job.items_per_group,
          levelsCount: job.levels_count || undefined,
          mode: job.mode,
        }),
      });
      const genJson = await genResp.json().catch(() => null);

      if (!genResp.ok || genJson?.success === false) {
        const msg = genJson?.error?.message || genJson?.error || `generate-course failed (${genResp.status})`;
        try { await emitJobEvent(jobId, "failed", 100, msg, { ...ctx, status: genResp.status }); } catch {}
        return new Response(JSON.stringify({ ok: false, processed: true, jobId, status: "failed", error: msg }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }

      try { await emitJobEvent(jobId, "done", 100, "Job complete", ctx); } catch {}
      return new Response(JSON.stringify({ ok: true, processed: true, jobId, status: "done" }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try { await emitJobEvent(jobId, "failed", 100, msg, ctx); } catch {}
      return new Response(JSON.stringify({ ok: false, processed: true, jobId, status: "failed", error: msg }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

