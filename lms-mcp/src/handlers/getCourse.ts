import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface GetCourseInput {
  courseId: string;
}

export async function getCourse({ params }: { params: GetCourseInput }) {
  const courseId = params.courseId;
  // 1) Try Edge Function first
  const edgeUrl = `${config.supabaseUrl}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`;
  try {
    const res = await fetchJson(edgeUrl, {
      method: 'GET',
      headers: { 'X-Agent-Token': config.agentToken },
      timeoutMs: 10000,
    });
    if (res.ok && res.json) return res.json;
  } catch {
    // ignore and fallback
  }

  // 2) Fallback to Storage public URL
  const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json`;
  try {
    const resp = await fetch(publicUrl, { headers: { 'Accept': 'application/json' } });
    if (resp.ok) {
      return await resp.json();
    }
  } catch {
    // ignore and try SR
  }

  throw new Error('getCourse: all retrieval strategies failed');
}


