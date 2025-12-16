import { config } from '../config';
import { fetchJson } from '../http';

export async function studytextRewrite({ params }: { params: { courseId: string; index?: number } }) {
  const url = `${config.supabaseUrl}/functions/v1/studytext-rewrite`;
  const res = await fetchJson(url, { method: 'POST', headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' }, body: params });
  if (!res.ok) throw new Error(`studytext-rewrite failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}

export async function studytextExpand({ params }: { params: { courseId: string; index?: number } }) {
  const url = `${config.supabaseUrl}/functions/v1/studytext-expand`;
  const res = await fetchJson(url, { method: 'POST', headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' }, body: params });
  if (!res.ok) throw new Error(`studytext-expand failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}

export async function studytextVisualize({ params }: { params: { courseId: string; index?: number } }) {
  const url = `${config.supabaseUrl}/functions/v1/studytext-visualize`;
  const res = await fetchJson(url, { method: 'POST', headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' }, body: params });
  if (!res.ok) throw new Error(`studytext-visualize failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}


