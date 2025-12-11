import { config } from '../config.ts';
import { fetchJson } from '../http.ts';

export async function listJobs({ params }: { params: { page?: number; limit?: number } }) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const url = `${config.supabaseUrl}/functions/v1/list-jobs?page=${page}&limit=${limit}`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: { 'X-Agent-Token': config.agentToken },
  });
  if (!res.ok) {
    throw new Error(`listJobs failed (${res.status}) ${res.text || ''}`);
  }
  const data: any = res.json || {};
  // Normalize array of jobs from various shapes
  let arr: any[] = [];
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data.items)) arr = data.items;
  else if (Array.isArray(data.jobs)) arr = data.jobs;

  const items = arr.map((j) => {
    const job = j?.job || j;
    const status = String(job?.status || '').toLowerCase();
    return {
      ...job,
      jobId: job?.id || job?.jobId,
      id: job?.id || job?.jobId,
      courseId: job?.course_id || job?.courseId,
      status,
    };
  });

  const total: number = typeof data.total === 'number' ? data.total : items.length;

  return { items, total, page, limit };
}


