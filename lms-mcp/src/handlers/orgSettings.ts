import { config } from '../config';
import { fetchJson } from '../http';

export async function getOrgSettings({ params }: { params: { orgId?: string } }) {
  const q = params?.orgId ? `?orgId=${encodeURIComponent(params.orgId)}` : '';
  const url = `${config.supabaseUrl}/functions/v1/get-org-settings${q}`;
  const res = await fetchJson(url, { method: 'GET', headers: { 'X-Agent-Token': config.agentToken } });
  if (!res.ok) throw new Error(`get-org-settings failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}

export async function saveOrgSettings({ params }: { params: { orgId: string; thresholds: { variantsCoverageMin: number } } }) {
  const url = `${config.supabaseUrl}/functions/v1/save-org-settings`;
  const res = await fetchJson(url, { method: 'POST', headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' }, body: params });
  if (!res.ok) throw new Error(`save-org-settings failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}


