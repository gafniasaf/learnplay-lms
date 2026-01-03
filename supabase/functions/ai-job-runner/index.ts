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
        .update({ status: "processing", started_at: nowIso, last_heartbeat: nowIso })
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

