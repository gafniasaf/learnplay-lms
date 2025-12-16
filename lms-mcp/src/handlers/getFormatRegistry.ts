import { config } from '../config';
import { fetchJson } from '../http';

export async function getFormatRegistry() {
  const url = `${config.supabaseUrl}/functions/v1/get-format-registry`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: {
      'X-Agent-Token': config.agentToken,
      'Content-Type': 'application/json',
    },
    timeoutMs: 8000,
  });
  if (!res.ok) {
    throw new Error(`get-format-registry failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json?.registry ?? res.json;
}


