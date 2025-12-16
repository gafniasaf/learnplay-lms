import { config } from '../config';
import { fetchJson } from '../http';

export async function listTemplates() {
  const url = `${config.supabaseUrl}/functions/v1/list-templates`;
  const res = await fetchJson(url, { method: 'GET', headers: { 'X-Agent-Token': config.agentToken } });
  if (!res.ok) throw new Error(`list-templates failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}

export async function getTemplate({ params }: { params: { id: string } }) {
  const url = `${config.supabaseUrl}/functions/v1/get-template?id=${encodeURIComponent(params.id)}`;
  const res = await fetchJson(url, { method: 'GET', headers: { 'X-Agent-Token': config.agentToken } });
  if (!res.ok) throw new Error(`get-template failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}


