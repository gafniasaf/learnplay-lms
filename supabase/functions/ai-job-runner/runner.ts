import { JobRegistry } from "./registry.ts";
import type { JobContext, JobExecutor } from "./strategies/types.ts";

export async function runJob(jobType: string, payload: Record<string, unknown> = {}, jobId?: string) {
  const executor: JobExecutor | undefined = JobRegistry[jobType];
  if (!executor) {
    throw new Error(`Unknown job type: ${jobType}`);
  }

  const context: JobContext = {
    jobId: jobId ?? crypto.randomUUID(),
    payload,
  };

  return executor.execute(context);
}
