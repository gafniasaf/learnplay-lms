import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function enqueueJob({ params }: { params: { type: string; subject: string; courseId?: string; locale?: string; payload?: any } }) {
  if (!config.organizationId) {
    throw new Error('BLOCKED: ORGANIZATION_ID is REQUIRED for enqueueJob (agent auth requires org scope)');
  }
  const url = `${config.supabaseUrl}/functions/v1/enqueue-job`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'X-Organization-Id': config.organizationId },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`enqueueJob failed (${res.status}) ${res.text || ''}`);
  }
  // Expect { jobId: string }
  return res.json;
}


