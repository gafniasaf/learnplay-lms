import { config } from "../config";
import { fetchJson } from "../http";

export interface ApplyJobResultInput {
  jobId: string;
  courseId: string;
  attachments?: any[];
  mergePlan?: { patch: any[] };
  dryRun?: boolean;
}

export async function applyJobResult({ params }: { params: ApplyJobResultInput }) {
  const url = `${config.supabaseUrl}/functions/v1/apply-job-result`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: {
      'X-Agent-Token': config.agentToken,
    },
    body: params,
    timeoutMs: 15000,
  });
  if (!res.ok) {
    throw new Error(`apply-job-result failed (${res.status})`);
  }
  return res.json;
}


