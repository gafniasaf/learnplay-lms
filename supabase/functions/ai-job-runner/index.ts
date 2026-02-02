import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleOptions, stdHeaders } from "../_shared/cors.ts";
import { runJob } from "./runner.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitAgentJobEvent, emitJobEvent } from "../_shared/job-events.ts";

interface JobRequestBody {
  jobType?: string;
  payload?: Record<string, unknown>;
  worker?: boolean;
  queue?: "course" | "agent" | "any";
}

function parseIntEnv(key: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(key);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(value, min), max);
}

function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const raw = baseMs * Math.pow(2, safeAttempt - 1);
  return Math.min(raw, maxMs);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isYieldResult(result: unknown): result is {
  yield: true;
  message?: string;
  nextPayload?: Record<string, unknown>;
  payloadPatch?: Record<string, unknown>;
  progress?: number;
} {
  if (!isRecord(result)) return false;
  return (result as any).yield === true;
}

// Long-running job types that should be handled by queue-pump (Fly.io) instead of Edge Functions.
// Edge Functions have a 60s timeout which is insufficient for these jobs.
const LONG_RUNNING_JOB_TYPES = [
  "generate_multi_week_plan",
  "book_generate_full",
  "book_generate_chapter",
];

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
  const queueParamRaw = body?.queue || url.searchParams.get("queue") || "any";
  const queue = (queueParamRaw === "course" || queueParamRaw === "agent" || queueParamRaw === "any")
    ? queueParamRaw
    : "any";

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

    if (queue !== "agent") {
      // 1) Prefer course jobs (ai_course_jobs) for backwards compatibility.
      const { data: courseJobs, error: pickCourseErr } = await admin.rpc("get_next_pending_job", {});
      if (pickCourseErr) {
        return new Response(JSON.stringify({ ok: false, error: `Failed to select course job: ${pickCourseErr.message}` }), {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }
      const courseJob = Array.isArray(courseJobs) ? courseJobs[0] : null;

      if (courseJob?.id) {
        const jobId = String(courseJob.id);
        const ctx = { requestId, jobId, courseId: courseJob.course_id };
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
              subject: courseJob.subject,
              gradeBand: courseJob.grade_band,
              grade: courseJob.grade,
              itemsPerGroup: courseJob.items_per_group,
              levelsCount: courseJob.levels_count || undefined,
              mode: courseJob.mode,
            }),
          });
          const genJson = await genResp.json().catch(() => null);

          if (!genResp.ok || genJson?.success === false) {
            const msg = genJson?.error?.message || genJson?.error || `generate-course failed (${genResp.status})`;
            // Ensure job row is not left stuck in "processing"
            try {
              await admin
                .from("ai_course_jobs")
                .update({
                  status: "failed",
                  error: msg,
                  completed_at: new Date().toISOString(),
                })
                .eq("id", jobId);
            } catch {
              // best-effort
            }
            try { await emitJobEvent(jobId, "failed", 100, msg, { ...ctx, status: genResp.status }); } catch {}
            return new Response(JSON.stringify({ ok: false, processed: true, jobId, status: "failed", error: msg }), {
              status: 200,
              headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
            });
          }

          // Successful completion: mark job done and set a reasonable result_path
          try {
            const courseId = String(courseJob.course_id || "");
            const resultPath =
              typeof genJson?.result_path === "string"
                ? genJson.result_path
                : (courseId ? `${courseId}/course.json` : null);
            const update: Record<string, unknown> = {
              status: "done",
              completed_at: new Date().toISOString(),
            };
            if (resultPath) update.result_path = resultPath;
            await admin.from("ai_course_jobs").update(update).eq("id", jobId);
          } catch {
            // best-effort
          }
          try { await emitJobEvent(jobId, "done", 100, "Job complete", ctx); } catch {}
          return new Response(JSON.stringify({ ok: true, processed: true, jobId, status: "done" }), {
            status: 200,
            headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Ensure job row is not left stuck in "processing"
          try {
            await admin
              .from("ai_course_jobs")
              .update({
                status: "failed",
                error: msg,
                completed_at: new Date().toISOString(),
              })
              .eq("id", jobId);
          } catch {
            // best-effort
          }
          try { await emitJobEvent(jobId, "failed", 100, msg, ctx); } catch {}
          return new Response(JSON.stringify({ ok: false, processed: true, jobId, status: "failed", error: msg }), {
            status: 200,
            headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
          });
        }
      }

      if (queue === "course") {
        return new Response(JSON.stringify({ ok: true, processed: false, message: "No pending jobs" }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }
    }

    // 2) Otherwise process generic factory jobs (ai_agent_jobs).
    // Optional targeting: queue=agent&jobId=<uuid> will attempt to process that specific job (useful for tests/ops).
    const targetJobIdFromUrl = url.searchParams.get("jobId") || url.searchParams.get("job_id");
    const targetJobIdFromBody =
      typeof (body as any)?.jobId === "string"
        ? String((body as any).jobId)
        : typeof (body as any)?.job_id === "string"
          ? String((body as any).job_id)
          : null;
    const targetJobId = (targetJobIdFromUrl || targetJobIdFromBody || "").trim() || null;

    let agentJob: any | null = null;
    if (queue === "agent" && targetJobId) {
      const nowIso = new Date().toISOString();
      // Atomically claim the target job only if it is queued.
      const { data: claimed, error: claimErr } = await admin
        .from("ai_agent_jobs")
        .update({ status: "processing", started_at: nowIso, last_heartbeat: nowIso, next_attempt_at: null })
        .eq("id", targetJobId)
        .eq("status", "queued")
        .select("*")
        .maybeSingle();

      if (claimErr) {
        return new Response(JSON.stringify({ ok: false, error: `Failed to claim factory job: ${claimErr.message}` }), {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }

      if (!claimed) {
        // Not claimable (missing or already processing/terminal). Best-effort load for a helpful response.
        const { data: existing, error: loadErr } = await admin
          .from("ai_agent_jobs")
          .select("*")
          .eq("id", targetJobId)
          .maybeSingle();
        if (loadErr) {
          return new Response(JSON.stringify({ ok: false, error: `Failed to load factory job: ${loadErr.message}` }), {
            status: 500,
            headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
          });
        }
        if (!existing) {
          return new Response(JSON.stringify({ ok: false, processed: false, error: "Factory job not found" }), {
            status: 200,
            headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
          });
        }
        return new Response(JSON.stringify({ ok: true, processed: false, message: `Factory job not claimable (status=${existing.status})` }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }

      agentJob = claimed;
    } else {
      const { data: agentJobs, error: pickAgentErr } = await admin.rpc("get_next_pending_agent_job", {});
      if (pickAgentErr) {
        return new Response(JSON.stringify({ ok: false, error: `Failed to select factory job: ${pickAgentErr.message}` }), {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }
      agentJob = Array.isArray(agentJobs) ? agentJobs[0] : null;
    }

    if (!agentJob?.id) {
      return new Response(JSON.stringify({ ok: true, processed: false, message: "No pending jobs" }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

    const jobId = String(agentJob.id);
    const jobType = String(agentJob.job_type || "");

    // Skip long-running jobs - release back to queue for queue-pump (Fly.io) to handle.
    // Edge Functions have a 60s timeout which is insufficient for these job types.
    if (LONG_RUNNING_JOB_TYPES.includes(jobType)) {
      try {
        await admin
          .from("ai_agent_jobs")
          .update({
            status: "queued",
            started_at: null,
            last_heartbeat: null,
          })
          .eq("id", jobId);
      } catch {
        // best-effort - if release fails, reconciler will eventually handle it
      }
      return new Response(JSON.stringify({ ok: true, processed: false, message: `Skipped long-running job type: ${jobType}`, skippedJobId: jobId }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }
    const jobOrgId = String(agentJob.organization_id || "");
    const payload = (agentJob.payload && typeof agentJob.payload === "object") ? agentJob.payload : {};
    const ctx = { requestId, jobId, jobType };
    try {
      await emitAgentJobEvent(jobId, "generating", 10, "Starting job", ctx);
    } catch {
      // best-effort
    }
    try {
      // Heartbeat (best-effort)
      // Keep last_heartbeat fresh for long-running jobs so the reconciler can detect truly stalled jobs.
      const heartbeatIntervalMs = 30_000;
      let heartbeatTimer: number | null = null;
      const heartbeatOnce = async () => {
        try {
          await admin.rpc("update_job_heartbeat", { job_id: jobId, job_table: "ai_agent_jobs" });
        } catch {
          // best-effort
        }
      };
      await heartbeatOnce();
      try {
        heartbeatTimer = setInterval(() => {
          void heartbeatOnce();
        }, heartbeatIntervalMs) as unknown as number;
      } catch {
        heartbeatTimer = null;
      }

      if (!jobType) {
        throw new Error("Invalid job: missing job_type");
      }
      if (!jobOrgId) {
        throw new Error("Invalid job: missing organization_id");
      }

      const mergedPayload: Record<string, unknown> = {
        ...(payload as Record<string, unknown>),
        organization_id: jobOrgId,
      };
      let result: unknown;
      try {
        result = await runJob(jobType, mergedPayload, jobId);
      } finally {
        if (heartbeatTimer) {
          try {
            clearInterval(heartbeatTimer);
          } catch {
            // best-effort
          }
        }
      }

      // Yield/Requeue support: allow long-running orchestrators (e.g. sectioned bookgen)
      // to yield control back to the worker and be re-queued with updated payload.
      if (isYieldResult(result)) {
        const nowIso = new Date().toISOString();
        const MAX_YIELDS = 50;

        const currentPayload = isRecord(payload) ? (payload as Record<string, unknown>) : {};

        // nextPayload semantics:
        // - If payloadPatch is provided: merge patch into existing stored payload
        // - Else if nextPayload is provided: replace payload
        // - Else: keep existing stored payload
        const nextPayloadRaw = isRecord((result as any).payloadPatch)
          ? { ...currentPayload, ...((result as any).payloadPatch as Record<string, unknown>) }
          : isRecord((result as any).nextPayload)
            ? ((result as any).nextPayload as Record<string, unknown>)
            : currentPayload;
        const nextPayload: Record<string, unknown> = { ...nextPayloadRaw };

        // Keep org context in the row, not in the payload (runner injects it on execution).
        delete (nextPayload as any).organization_id;

        const prevYieldCountRaw = (nextPayload as any).__yieldCount;
        const prevYieldCount = (typeof prevYieldCountRaw === "number" && Number.isFinite(prevYieldCountRaw))
          ? Math.max(0, Math.floor(prevYieldCountRaw))
          : 0;
        const yieldCount = prevYieldCount + 1;
        (nextPayload as any).__yieldCount = yieldCount;

        if (yieldCount > MAX_YIELDS) {
          throw new Error(`BLOCKED: Job yielded too many times (${yieldCount} > ${MAX_YIELDS}). Halting for human review.`);
        }

        const yieldMsg = typeof (result as any).message === "string" && (result as any).message.trim()
          ? String((result as any).message).trim()
          : "Yielding job for requeue";

        try {
          await admin
            .from("ai_agent_jobs")
            .update({
              status: "queued",
              payload: nextPayload as any,
              // Store yield metadata for observability (job is not terminal).
              result: { ...(isRecord(result) ? result : {}), yieldedAt: nowIso, yieldCount } as any,
              error: null,
              started_at: null,
              completed_at: null,
              last_heartbeat: null,
              next_attempt_at: null,
              // Push to the back of the queue to avoid starvation.
              created_at: nowIso,
            })
            .eq("id", jobId);
        } catch {
          // best-effort
        }

        try { await emitAgentJobEvent(jobId, "generating", 95, yieldMsg, { ...ctx, status: "queued", yieldCount }); } catch {}
        return new Response(JSON.stringify({ ok: true, processed: true, jobId, status: "queued", jobType, yielded: true, yieldCount }), {
          status: 200,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
        });
      }

      try {
        await admin
          .from("ai_agent_jobs")
          .update({
            status: "done",
            result: result as any,
            error: null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } catch {
        // best-effort
      }

      try { await emitAgentJobEvent(jobId, "done", 100, "Job complete", ctx); } catch {}
      return new Response(JSON.stringify({ ok: true, processed: true, jobId, status: "done", jobType }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Ensure job row is not left stuck in "processing"
      try {
        await admin
          .from("ai_agent_jobs")
          .update({
            status: "failed",
            error: msg,
            completed_at: new Date().toISOString(),
            next_attempt_at: (() => {
              const baseBackoffMs = parseIntEnv("AGENT_JOB_RETRY_BASE_MS", 30_000, 1_000, 60 * 60 * 1000);
              const maxBackoffMs = parseIntEnv("AGENT_JOB_RETRY_MAX_MS", 10 * 60_000, 5_000, 24 * 60 * 60 * 1000);
              const retryCount = typeof agentJob?.retry_count === "number" ? agentJob.retry_count : 0;
              const attempt = retryCount + 1;
              const backoffMs = computeBackoffMs(attempt, baseBackoffMs, maxBackoffMs);
              return new Date(Date.now() + backoffMs).toISOString();
            })(),
          })
          .eq("id", jobId);
      } catch {
        // best-effort
      }
      try { await emitAgentJobEvent(jobId, "failed", 100, msg, ctx); } catch {}
      return new Response(JSON.stringify({ ok: false, processed: true, jobId, status: "failed", error: msg, jobType }), {
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

