import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { emitJobEvent } from "../_shared/job-events.ts";
import { emitAgentJobEvent } from "../_shared/job-events.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

async function courseReality(courseId: string) {
  let hasCourseJson = false;

  const { data: files } = await admin.storage.from("courses").list(courseId, { limit: 100, search: "course.json" });
  if (files && Array.isArray(files)) {
    hasCourseJson = files.some((f: any) => (f.name || "") === "course.json");
  }

  return { hasCourseJson };
}

async function agentJobReality(jobId: string) {
  // Placeholder for future “reality” checks (e.g., storage artifacts) for agent jobs.
  // For now, we only use heartbeats to detect stalls.
  return { jobId };
}

serve(
  withCors(async (req: Request) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "POST") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Authorization: agent token OR superadmin user session
    const agentHeader = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
    const expectedAgent = Deno.env.get("AGENT_TOKEN");

    if (!(expectedAgent && agentHeader === expectedAgent)) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return Errors.noAuth(requestId, req);
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authErr } = await userClient.auth.getUser();
      if (authErr || !authData?.user) return Errors.invalidAuth(requestId, req);

      const { data: roles, error: roleErr } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id);
      if (roleErr) return Errors.internal(roleErr.message, requestId, req);
      const ok = Array.isArray(roles) && roles.some((r: any) => r.role === "superadmin");
      if (!ok) return Errors.forbidden("superadmin role required", requestId, req);
    }

    // Find jobs not done/failed
    const { data: jobs, error } = await admin
      .from("ai_course_jobs")
      .select("id, course_id, status, result_path, last_heartbeat, created_at")
      .neq("status", "done")
      .neq("status", "failed")
      .limit(100);

    if (error) return Errors.internal(error.message, requestId, req);

    const results: any[] = [];

    for (const job of jobs || []) {
      const courseId = job.course_id as string;
      const { hasCourseJson } = await courseReality(courseId);
      const realityDone = Boolean(hasCourseJson);

      if (realityDone) {
        const result_path = (job as any).result_path || `${courseId}/course.json`;
        await admin.from("ai_course_jobs").update({ status: "done", result_path }).eq("id", job.id);
        try {
          await emitJobEvent(job.id, "done", 100, "Reconciler: marked done based on reality (storage)", {
            result_path,
            hasCourseJson,
          });
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, action: "marked_done", hasCourseJson });
        continue;
      }

      const heartbeatOrCreated = (job as any).last_heartbeat || (job as any).created_at;
      const updatedAtMs = heartbeatOrCreated ? new Date(heartbeatOrCreated).getTime() : NaN;
      const isStalled = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > 5 * 60 * 1000;

      if (isStalled) {
        await admin.from("ai_course_jobs").update({ status: "failed", error: "Reconciler: job stalled" }).eq("id", job.id);
        try {
          await emitJobEvent(job.id, "failed", 100, "Reconciler: job stalled");
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, action: "marked_failed_stalled" });
      } else {
        try {
          await emitJobEvent(job.id, "heartbeat", 10, "Reconciler heartbeat");
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, action: "heartbeat" });
      }
    }

    // Reconcile agent jobs (factory queue)
    const { data: agentJobs, error: agentErr } = await admin
      .from("ai_agent_jobs")
      .select("id, job_type, status, error, last_heartbeat, started_at, created_at, retry_count, max_retries")
      .eq("status", "processing")
      .limit(200);

    if (agentErr) return Errors.internal(agentErr.message, requestId, req);

    const AGENT_STALL_MS = 15 * 60 * 1000;

    for (const job of agentJobs || []) {
      const heartbeatOrStartedOrCreated = (job as any).last_heartbeat || (job as any).started_at || (job as any).created_at;
      const updatedAtMs = heartbeatOrStartedOrCreated ? new Date(heartbeatOrStartedOrCreated).getTime() : NaN;
      const isStalled = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > AGENT_STALL_MS;

      if (isStalled) {
        const retryCount = typeof (job as any).retry_count === "number" ? (job as any).retry_count : 0;
        const maxRetries = typeof (job as any).max_retries === "number" ? (job as any).max_retries : 3;
        const baseBackoffMs = parseIntEnv("AGENT_JOB_RETRY_BASE_MS", 30_000, 1_000, 60 * 60 * 1000);
        const maxBackoffMs = parseIntEnv("AGENT_JOB_RETRY_MAX_MS", 10 * 60_000, 5_000, 24 * 60 * 60 * 1000);
        const attempt = retryCount + 1;
        const backoffMs = computeBackoffMs(attempt, baseBackoffMs, maxBackoffMs);
        const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

        if (retryCount >= maxRetries) {
          const { error: dlErr } = await admin
            .from("ai_agent_jobs")
            .update({
              status: "dead_letter",
              error: "Reconciler: job stalled (max retries exceeded)",
              completed_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          if (dlErr) {
            results.push({ jobId: job.id, jobType: (job as any).job_type, action: "agent_deadletter_failed", error: dlErr.message });
            continue;
          }
          try {
            await emitAgentJobEvent(String(job.id), "failed", 100, "Reconciler: dead-lettered after stalls", {
              jobType: (job as any).job_type,
              last_heartbeat: (job as any).last_heartbeat || null,
            });
          } catch {
            // best-effort
          }
          results.push({ jobId: job.id, jobType: (job as any).job_type, action: "agent_dead_letter_stalled" });
          continue;
        }

        const { error: updateErr } = await admin
          .from("ai_agent_jobs")
          .update({
            status: "failed",
            error: "Reconciler: job stalled",
            completed_at: new Date().toISOString(),
            next_attempt_at: nextAttemptAt,
          })
          .eq("id", job.id);
        if (updateErr) {
          results.push({ jobId: job.id, jobType: (job as any).job_type, action: "agent_update_failed", error: updateErr.message });
          continue;
        }
        try {
          await emitAgentJobEvent(String(job.id), "failed", 100, "Reconciler: job stalled", {
            jobType: (job as any).job_type,
            last_heartbeat: (job as any).last_heartbeat || null,
            nextAttemptAt,
          });
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, jobType: (job as any).job_type, action: "agent_marked_failed_stalled" });
      } else {
        // Best-effort: a reconciler heartbeat marker can help operators confirm reconciler is running.
        try {
          await emitAgentJobEvent(String(job.id), "heartbeat", 10, "Reconciler heartbeat");
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, jobType: (job as any).job_type, action: "agent_heartbeat" });
      }

      // Reserved for future richer “reality” checks
      await agentJobReality(String(job.id));
    }

    return { ok: true, count: results.length, results };
  }),
);


