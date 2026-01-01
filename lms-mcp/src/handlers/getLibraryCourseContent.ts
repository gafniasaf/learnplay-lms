import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface GetLibraryCourseContentInput {
  courseId: string;
}

export async function getLibraryCourseContent({ params }: { params: GetLibraryCourseContentInput }) {
  const courseId = String(params?.courseId ?? '').trim();
  if (!courseId) {
    throw new Error('courseId is required');
  }

  const qs = new URLSearchParams();
  qs.set('courseId', courseId);

  const url = `${config.supabaseUrl}/functions/v1/get-course?${qs.toString()}`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: {
      // get-course is readable with service role inside the function, but we still propagate agent headers
      // for consistent audit trails and to support any future auth tightening.
      'X-Agent-Token': config.agentToken,
      ...(config.organizationId ? { 'X-Organization-Id': config.organizationId } : {}),
      'Content-Type': 'application/json',
    },
    timeoutMs: 60000,
  });
  if (!res.ok) {
    throw new Error(`get-course failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}



