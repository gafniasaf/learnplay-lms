import { config } from '../config.js';
import { fetchJson } from '../http.js';

function projectRefFromUrl(url: string): string {
  // https://<ref>.supabase.co → <ref>
  return url.replace(/^https?:\/\/([^.]*)\.supabase\.co.*$/i, '$1');
}

export async function functionInfo({ params }: { params: { functionSlug?: string } }) {
  const pat = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT || '';
  if (!pat) {
    throw new Error('Missing SUPABASE_ACCESS_TOKEN in MCP environment');
  }
  const ref = projectRefFromUrl(config.supabaseUrl);
  const api = `https://api.supabase.com/v1/projects/${ref}/functions`;

  const res = await fetchJson(api, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    timeoutMs: 15000,
  });
  if (!res.ok) {
    throw new Error(`functions list failed (${res.status}): ${res.text || ''}`);
  }

  const all = Array.isArray(res.json) ? res.json : (res.json?.data || []);
  const functions = (all || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    status: f.status,
    version: f.version,
    updated_at: f.updated_at,
  }));

  if (params.functionSlug) {
    return { functions: functions.filter((f: any) => f.slug === params.functionSlug) };
  }
  return { functions };
}


