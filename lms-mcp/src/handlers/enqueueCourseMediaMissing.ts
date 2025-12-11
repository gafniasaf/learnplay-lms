import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface EnqueueCourseMediaMissingInput {
  courseId: string;
  limit?: number;
  dryRun?: boolean;
  promptTemplate?: string;
}

export async function enqueueCourseMediaMissing({ params }: { params: EnqueueCourseMediaMissingInput }) {
  const url = `${config.supabaseUrl}/functions/v1/enqueue-course-missing-images`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: params,
    timeoutMs: 30000,
  });
  if (!res.ok) {
    throw new Error(`enqueue-course-missing-images failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}


