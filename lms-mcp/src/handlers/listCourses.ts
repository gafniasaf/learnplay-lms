import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface ListCoursesInput {
  includeArchived?: boolean;
  limit?: number;
}

export async function listCourses({ params }: { params: ListCoursesInput }) {
  const qs = new URLSearchParams();
  if (params?.includeArchived) qs.set('includeArchived', 'true');
  if (params?.limit) qs.set('limit', String(params.limit));
  const url = `${config.supabaseUrl}/functions/v1/list-courses-filtered${qs.size ? `?${qs.toString()}` : ''}`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: {
      'X-Agent-Token': config.agentToken,
      'Content-Type': 'application/json',
    },
    timeoutMs: 10000,
  });
  if (!res.ok) {
    throw new Error(`list-courses-filtered failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}


