import { config } from '../config.ts';
import { fetchJson } from '../http.ts';

export async function itemRewriteQuality({ params }: { params: { courseId: string; itemId: number } }) {
  const url = `${config.supabaseUrl}/functions/v1/item-rewrite-quality`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: params,
  });
  if (!res.ok) throw new Error(`item-rewrite-quality failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}


