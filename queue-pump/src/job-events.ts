// queue-pump/src/job-events.ts
// Helper for emitting job events with seq safely (ported from supabase/functions/_shared/job-events.ts)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export type JobEventStep =
  | "queued"
  | "generating"
  | "validating"
  | "repairing"
  | "reviewing"
  | "images"
  | "enriching"
  | "storage_read"
  | "storage_write"
  | "catalog_update"
  | "verifying"
  | "heartbeat"
  | "done"
  | "failed";

export async function emitJobEvent(
  jobId: string,
  step: JobEventStep,
  progress: number,
  message = "",
  meta: Record<string, unknown> = {},
) {
  // compute next seq (best-effort; reconciler will correct any gaps)
  const { data: nextSeqData } = await supabase.rpc("next_job_event_seq", { p_job_id: jobId });
  const seq = (nextSeqData as number) ?? 1;
  await supabase.from("job_events").insert({
    job_id: jobId,
    seq,
    step,
    status: step === "failed" ? "error" : step === "done" ? "success" : "info",
    progress,
    message,
    meta,
  });
}

/**
 * Emit progress events for ai_agent_jobs (non-course factory jobs).
 *
 * Uses public.agent_job_events + public.next_agent_job_event_seq.
 */
export async function emitAgentJobEvent(
  jobId: string,
  step: JobEventStep,
  progress: number,
  message = "",
  meta: Record<string, unknown> = {},
) {
  const { data: nextSeqData } = await supabase.rpc("next_agent_job_event_seq", { p_job_id: jobId });
  const seq = (nextSeqData as number) ?? 1;
  await supabase.from("agent_job_events").insert({
    job_id: jobId,
    seq,
    step,
    status: step === "failed" ? "error" : step === "done" ? "success" : "info",
    progress,
    message,
    meta,
  });
}

