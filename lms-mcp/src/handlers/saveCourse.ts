import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface SaveCourseInput {
  envelope: any;
}

export async function saveCourse({ params }: { params: SaveCourseInput }) {
  const url = `${config.supabaseUrl}/functions/v1/save-course`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken },
    body: params.envelope,
  });
  if (!res.ok) {
    throw new Error(`saveCourse failed (${res.status}) ${res.text || ''}`);
  }
  return res.json;
}


