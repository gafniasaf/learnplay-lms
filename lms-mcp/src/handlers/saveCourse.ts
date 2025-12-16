import { config } from '../config';
import { fetchJson } from '../http';

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


