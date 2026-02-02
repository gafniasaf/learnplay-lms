import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function alertDetector({ params }: { params?: { windowMinutes?: number } }) {
  const headers: Record<string, string> = { 'X-Agent-Token': config.agentToken };
  if (config.organizationId) {
    headers['X-Organization-Id'] = config.organizationId;
  }
  const res = await fetchJson(`${config.supabaseUrl}/functions/v1/alert-detector`, {
    method: 'POST',
    headers,
    body: params || {},
  });
  if (!res.ok) {
    throw new Error(`alertDetector failed (${res.status}) ${res.text || ''}`);
  }
  return res.json || { ok: true, active: [] };
}
