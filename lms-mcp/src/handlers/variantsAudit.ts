import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function variantsAudit({ params }: { params: { courseId: string } }) {
  const url = `${config.supabaseUrl}/functions/v1/generate-variants-audit`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: {
      'X-Agent-Token': config.agentToken,
      'Content-Type': 'application/json',
    },
    body: { courseId: params.courseId },
    timeoutMs: 15000,
  });
  if (!res.ok) {
    throw new Error(`variants-audit failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}


