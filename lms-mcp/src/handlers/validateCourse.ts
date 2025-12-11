import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface ValidateCourseInput {
  courseId: string;
}

export async function validateCourse({ params }: { params: ValidateCourseInput }) {
  const url = `${config.supabaseUrl}/functions/v1/validate-course-structure`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: {
      'X-Agent-Token': config.agentToken,
      'Content-Type': 'application/json',
    },
    body: { courseId: params.courseId },
    timeoutMs: 10000,
  });
  if (!res.ok) {
    throw new Error(`validate-course-structure failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}


