import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function autoFix({ params }: { params: { courseId: string; apply?: boolean } }) {
  const { courseId, apply = false } = params;
  const url = `${config.supabaseUrl}/functions/v1/editor-auto-fix`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: { courseId, apply },
    timeoutMs: 20000,
  });
  if (!res.ok) {
    throw new Error(`editor-auto-fix failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}


