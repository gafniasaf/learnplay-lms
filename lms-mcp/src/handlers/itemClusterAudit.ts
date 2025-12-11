import { config } from '../config.ts';
import { fetchJson } from '../http.ts';

export async function itemClusterAudit({ params }: { params: { courseId: string } }) {
  const url = `${config.supabaseUrl}/functions/v1/item-cluster-audit`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: params,
  });
  if (!res.ok) throw new Error(`item-cluster-audit failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}


