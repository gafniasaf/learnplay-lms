import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function itemGenerateMore({ params }: { params: { courseId: string; count?: number } }) {
  const url = `${config.supabaseUrl}/functions/v1/item-generate-more`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: params,
  });
  if (!res.ok) throw new Error(`item-generate-more failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}


