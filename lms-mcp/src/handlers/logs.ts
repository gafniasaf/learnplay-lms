import { config } from '../config';
import { fetchJson } from '../http';

export async function logs({ params }: { params: { jobId: string } }) {
  const url = `${config.supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(params.jobId)}&eventsLimit=200`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: { 'X-Agent-Token': config.agentToken },
  });
  if (!res.ok) {
    throw new Error(`logs failed (${res.status}) ${res.text || ''}`);
  }
  const data: any = res.json || {};
  // Normalize various possible shapes
  const ev = data.events || data.job?.events || data.job_events || [];
  return Array.isArray(ev) ? ev : [];
}


