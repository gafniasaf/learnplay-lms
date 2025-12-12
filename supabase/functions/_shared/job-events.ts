// _shared/job-events.ts
// Helper for emitting job events with seq safely.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

export type JobEventStep =
  | "queued"
  | "generating"
  | "validating"
  | "repairing"
  | "reviewing"
  | "images"
  | "enriching"
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
  meta: Record<string, unknown> = {}
) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
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


