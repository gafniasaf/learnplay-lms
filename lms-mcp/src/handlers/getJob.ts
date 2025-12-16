import { config } from '../config';
import { fetchJson } from '../http';

export async function getJob({ params }: { params: { jobId: string } }) {
  const url = `${config.supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(params.jobId)}`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: { 'X-Agent-Token': config.agentToken },
  });
  if (!res.ok) {
    throw new Error(`getJob failed (${res.status}) ${res.text || ''}`);
  }
  const data: any = res.json || {};
  // Normalize shapes
  const job = data.job || data;
  const events: any[] = data.events || job?.events || data.job_events || [];
  let status = String(job?.status || '').toLowerCase();
  if (!status && Array.isArray(events) && events.length > 0) {
    const last = events[events.length - 1];
    const step = String(last?.step || '').toLowerCase();
    const lvl = String(last?.status || '').toLowerCase();
    if (step === 'done' || lvl === 'success') status = 'done';
    else if (step === 'failed' || lvl === 'error') status = 'failed';
  }
  const normalized = {
    ...data,
    status,
    events,
    jobId: job?.id || params.jobId,
    courseId: job?.course_id || job?.courseId,
  };
  return normalized;
}


