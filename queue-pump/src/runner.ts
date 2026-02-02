import { parseIntEnv, requireEnv, sleep } from "./env.js";
import { adminSupabase } from "./supabase.js";
import { JobRegistry } from "./registry.js";

type AgentJobRow = {
  id: string;
  organization_id: string;
  job_type: string;
  status: string;
  payload: unknown;
  result: unknown;
  retry_count?: number | null;
  max_retries?: number | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const raw = baseMs * Math.pow(2, safeAttempt - 1);
  return Math.min(raw, maxMs);
}

function isYieldResult(v: unknown): v is {
  yield: true;
  message?: string;
  nextPayload?: Record<string, unknown>;
  payloadPatch?: Record<string, unknown>;
  progress?: number;
  partialPlan?: unknown;
  meta?: Record<string, unknown>;
} {
  return !!v && typeof v === "object" && (v as any).yield === true;
}

async function claimNextAgentJob(): Promise<AgentJobRow | null> {
  const { data, error } = await adminSupabase.rpc("get_next_pending_agent_job");
  if (error) throw new Error(`get_next_pending_agent_job failed: ${error.message}`);

  // PostgREST returns SETOF as an array. Some deployments may return a single object.
  const row =
    Array.isArray(data) ? (data[0] as any) : data && typeof data === "object" ? (data as any) : null;
  if (!row?.id) return null;
  return row as AgentJobRow;
}

async function loadAgentJobById(id: string): Promise<AgentJobRow | null> {
  const jobId = String(id || "").trim();
  if (!jobId) return null;
  const { data, error } = await adminSupabase
    .from("ai_agent_jobs")
    .select("id, organization_id, job_type, status, payload, result, retry_count, max_retries")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`load_agent_job_failed:${error.message}`);
  return data?.id ? (data as AgentJobRow) : null;
}

async function updateHeartbeat(jobId: string): Promise<void> {
  try {
    await adminSupabase.rpc("update_job_heartbeat", { job_id: jobId, job_table: "ai_agent_jobs" });
  } catch {
    // best-effort
  }
}

async function persistYield(jobId: string, payload: Record<string, unknown>, yieldResult: any, yieldCount: number): Promise<void> {
  const persistedResult = {
    ...yieldResult,
    yieldedAt: nowIso(),
    yieldCount,
  };
  const { error } = await adminSupabase
    .from("ai_agent_jobs")
    .update({
      payload,
      result: persistedResult,
      // Keep status=processing; we handle yields in-memory but persist snapshots for UI.
      status: "processing",
      updated_at: nowIso(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`persist_yield_failed:${error.message}`);
}

async function requeueYield(jobId: string, currentPayload: Record<string, unknown>, yieldResult: any, maxYields: number): Promise<number> {
  const now = nowIso();

  const nextPayloadRaw = isRecord(yieldResult?.payloadPatch)
    ? { ...currentPayload, ...(yieldResult.payloadPatch as Record<string, unknown>) }
    : isRecord(yieldResult?.nextPayload)
      ? (yieldResult.nextPayload as Record<string, unknown>)
      : currentPayload;

  const nextPayload: Record<string, unknown> = isRecord(nextPayloadRaw) ? { ...nextPayloadRaw } : {};

  // Keep org context in the row, not in the payload (runner injects it on execution).
  delete (nextPayload as any).organization_id;

  const prevYieldCountRaw = (nextPayload as any).__yieldCount;
  const prevYieldCount =
    typeof prevYieldCountRaw === "number" && Number.isFinite(prevYieldCountRaw)
      ? Math.max(0, Math.floor(prevYieldCountRaw))
      : 0;
  const yieldCount = prevYieldCount + 1;
  (nextPayload as any).__yieldCount = yieldCount;

  if (yieldCount > maxYields) {
    throw new Error(`BLOCKED: Job yielded too many times (${yieldCount} > ${maxYields}). Halting for human review.`);
  }

  const persistedResult = {
    ...(isRecord(yieldResult) ? yieldResult : {}),
    yieldedAt: now,
    yieldCount,
  };

  const { error } = await adminSupabase
    .from("ai_agent_jobs")
    .update({
      status: "queued",
      payload: nextPayload as any,
      // Store yield metadata for observability (job is not terminal).
      result: persistedResult as any,
      error: null,
      started_at: null,
      completed_at: null,
      last_heartbeat: null,
      // Push to the back of the queue to avoid starvation (important for orchestrators that enqueue subjobs).
      created_at: now,
      updated_at: now,
    })
    .eq("id", jobId);
  if (error) throw new Error(`requeue_yield_failed:${error.message}`);

  return yieldCount;
}

async function markDone(jobId: string, result: unknown): Promise<void> {
  const { error } = await adminSupabase
    .from("ai_agent_jobs")
    .update({
      status: "done",
      result,
      error: null,
      completed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`mark_done_failed:${error.message}`);
}

async function markFailed(jobId: string, message: string, retryCount?: number | null): Promise<void> {
  const baseBackoffMs = parseIntEnv("QUEUE_PUMP_RETRY_BASE_MS", 30_000, 1_000, 60 * 60 * 1000);
  const maxBackoffMs = parseIntEnv("QUEUE_PUMP_RETRY_MAX_MS", 10 * 60_000, 5_000, 24 * 60 * 60 * 1000);
  const attempt = typeof retryCount === "number" && Number.isFinite(retryCount) ? Math.max(1, retryCount) : 1;
  const backoffMs = computeBackoffMs(attempt, baseBackoffMs, maxBackoffMs);
  const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

  const { error } = await adminSupabase
    .from("ai_agent_jobs")
    .update({
      status: "failed",
      error: message,
      completed_at: nowIso(),
      updated_at: nowIso(),
      next_attempt_at: nextAttemptAt,
    })
    .eq("id", jobId);
  if (error) throw new Error(`mark_failed_failed:${error.message}`);
}

type YieldMode = "inline" | "requeue";

async function processJob(job: AgentJobRow, opts: { yieldMode: YieldMode }): Promise<"done" | "yielded"> {
  const jobId = String(job.id);
  const jobType = String(job.job_type || "");
  const jobOrgId = String(job.organization_id || "");

  if (!jobType) throw new Error("Invalid job: missing job_type");
  if (!jobOrgId) throw new Error("Invalid job: missing organization_id");

  const executor = JobRegistry[jobType];
  if (!executor) {
    // Important for staged rollout: if we can't run this job type, release it
    // so other workers (Edge/cron) can process it.
    const { error } = await adminSupabase
      .from("ai_agent_jobs")
      .update({ status: "queued", updated_at: nowIso() })
      .eq("id", jobId);
    if (error) throw new Error(`release_unsupported_failed:${error.message}`);
    throw new Error(`unsupported_job_type:${jobType}`);
  }

  const storedPayload: Record<string, unknown> = isRecord(job.payload) ? (job.payload as Record<string, unknown>) : {};
  let payload: Record<string, unknown> = { ...storedPayload, organization_id: jobOrgId };

  // NOTE: Some strategies (notably BookGen orchestrators) intentionally yield many times
  // while waiting on sub-jobs. Keep defaults high enough to avoid false failures.
  const maxYields = parseIntEnv("QUEUE_PUMP_MAX_YIELDS", 1500, 1, 20_000);
  const tickSleepMs = parseIntEnv("QUEUE_PUMP_TICK_SLEEP_MS", 250, 0, 10_000);
  const waitingSleepMs = parseIntEnv("QUEUE_PUMP_WAITING_SLEEP_MS", 5_000, 0, 60_000);
  const heartbeatMs = parseIntEnv("QUEUE_PUMP_HEARTBEAT_MS", 30_000, 5_000, 120_000);

  let heartbeatTimer: NodeJS.Timeout | null = null;
  const heartbeatOnce = async () => updateHeartbeat(jobId);

  await heartbeatOnce();
  heartbeatTimer = setInterval(heartbeatOnce, heartbeatMs);

  try {
    // "requeue" mode matches the Edge worker semantics:
    // - execute once
    // - if yield -> update payload, push created_at, set status back to queued, and return
    if (opts.yieldMode === "requeue") {
      let out: unknown;
      try {
        out = await executor.execute({ jobId, payload });
      } catch (execErr) {
        // Terminal execution error - mark job as failed so it doesn't get stuck in "processing"
        const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
        await markFailed(jobId, errMsg, job.retry_count ?? null);
        throw execErr; // Re-throw so caller knows it failed
      }
      if (isYieldResult(out)) {
        // Apply patch semantics against the stored payload (without injected organization_id)
        await requeueYield(jobId, storedPayload, out, maxYields);
        return "yielded";
      }
      await markDone(jobId, out);
      return "done";
    }

    // "inline" mode (used for ops/testing): keep executing in-memory until completion.
    for (let yieldCount = 0; yieldCount <= maxYields; yieldCount++) {
      let out: unknown;
      try {
        out = await executor.execute({ jobId, payload });
      } catch (execErr) {
        // Terminal execution error - mark job as failed so it doesn't get stuck in "processing"
        const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
        await markFailed(jobId, errMsg, job.retry_count ?? null);
        throw execErr; // Re-throw so caller knows it failed
      }

      if (isYieldResult(out)) {
        // Apply next payload or patch
        if (out.nextPayload && isRecord(out.nextPayload)) {
          payload = out.nextPayload;
        } else if (out.payloadPatch && isRecord(out.payloadPatch)) {
          payload = { ...payload, ...out.payloadPatch };
        }

        await persistYield(jobId, payload, out, yieldCount + 1);

        // Optional pacing to avoid hot loops (especially on waiting/retry yields).
        const msg = typeof out.message === "string" ? out.message.toLowerCase() : "";
        const isWaiting = msg.startsWith("waiting for ") || msg.includes("status=");
        const sleepMs = isWaiting ? waitingSleepMs : tickSleepMs;
        if (sleepMs > 0) await sleep(sleepMs);
        continue;
      }

      await markDone(jobId, out);
      return "done";
    }

    throw new Error(`yield_limit_exceeded:${maxYields}`);
  } finally {
    if (heartbeatTimer) {
      try {
        clearInterval(heartbeatTimer);
      } catch {
        // ignore
      }
    }
  }
}

async function main() {
  // Ensure required env vars are present up-front
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const idleSleepMs = parseIntEnv("QUEUE_PUMP_IDLE_SLEEP_MS", 10_000, 1_000, 120_000);
  const logEvery = parseIntEnv("QUEUE_PUMP_LOG_EVERY", 10, 1, 10_000);
  const targetJobId = (process.env.QUEUE_PUMP_TARGET_JOB_ID || "").trim();

  let processedCount = 0;
  let idleCount = 0;

  // Target mode: process one explicit job id (for ops/testing) and exit.
  if (targetJobId) {
    const job = await loadAgentJobById(targetJobId);
    if (!job) throw new Error(`target_job_not_found:${targetJobId}`);
    // Ensure the job is marked processing so other workers won't pick it.
    await adminSupabase
      .from("ai_agent_jobs")
      .update({ status: "processing", started_at: nowIso(), updated_at: nowIso() })
      .eq("id", targetJobId);
    const outcome = await processJob({ ...job, status: "processing" }, { yieldMode: "inline" });
    if (outcome !== "done") {
      throw new Error(`target_job_incomplete:${targetJobId}`);
    }
    console.log(`[queue-worker] target job complete: ${targetJobId}`);
    return;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const job = await claimNextAgentJob();
      if (!job) {
        idleCount += 1;
        if (idleCount % 6 === 1) console.log("[queue-worker] idle: no pending agent jobs; sleeping…");
        await sleep(idleSleepMs);
        continue;
      }

      idleCount = 0;
      const outcome = await processJob(job, { yieldMode: "requeue" });
      if (outcome === "done") processedCount += 1;

      if (processedCount % logEvery === 0) {
        console.log(`[queue-worker] processed=${processedCount} last=${job.job_type} ${job.id} status=done`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // If unsupported job type, we intentionally released it; back off a bit
      if (msg.startsWith("unsupported_job_type:")) {
        await sleep(2_000);
        continue;
      }

      console.error(`[queue-worker] error: ${msg}`);
      await sleep(5_000);
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[queue-worker] fatal: ${msg}`);
  process.exit(1);
});

