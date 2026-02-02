import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function listAlerts({ params }: { params?: { includeResolved?: boolean; limit?: number } }) {
  const query = new URLSearchParams();
  if (typeof params?.includeResolved === 'boolean') {
    query.set('includeResolved', params.includeResolved ? 'true' : 'false');
  }
  if (typeof params?.limit === 'number') {
    query.set('limit', String(params.limit));
  }
  const url = `${config.supabaseUrl}/functions/v1/list-alerts${query.toString() ? `?${query.toString()}` : ''}`;
  const headers: Record<string, string> = { 'X-Agent-Token': config.agentToken };
  if (config.organizationId) {
    headers['X-Organization-Id'] = config.organizationId;
  }
  const res = await fetchJson(url, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error(`listAlerts failed (${res.status}) ${res.text || ''}`);
  }
  return res.json || { ok: true, alerts: [] };
}
