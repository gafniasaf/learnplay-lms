/**
 * Import 10 legacy courses into IgniteZero via the deployed import-legacy-course Edge Function.
 *
 * Strategy:
 * 1) List candidate legacy courses (limit N)
 * 2) Probe-import without image migration to find 10 importable courses
 * 3) Re-import those 10 with image migration enabled
 *
 * Usage:
 *   npx tsx scripts/legacy-import/import-10-courses.ts --limit=200 --locale=en
 */

import { loadLearnPlayEnv } from '../../tests/helpers/parse-learnplay-env';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

function loadDeployEnv(): void {
  try {
    const deployEnvPath = path.resolve(process.cwd(), 'supabase', '.deploy.env');
    if (!existsSync(deployEnvPath)) return;
    const content = readFileSync(deployEnvPath, 'utf-8');
    const lines = content.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line
        .slice(idx + 1)
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .replace(/^'(.*)'$/, '$1');
      if (!key) continue;
      if (!process.env[key] && value) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadDeployEnv();
loadLearnPlayEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;

function blocked(msg: string): never {
  console.error(`❌ BLOCKED: ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) blocked('SUPABASE_URL is required');
if (!SUPABASE_ANON_KEY) blocked('SUPABASE_ANON_KEY is required');
if (!AGENT_TOKEN) blocked('AGENT_TOKEN is required');
if (!ORGANIZATION_ID) blocked('ORGANIZATION_ID is required');

function argValue(prefix: string): string | null {
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

const limit = (() => {
  const v = argValue('--limit=');
  const n = v ? Number(v) : 200;
  return Number.isFinite(n) ? Math.max(10, Math.min(500, Math.floor(n))) : 200;
})();

const locale = (() => {
  const v = argValue('--locale=');
  return v && v.trim().length ? v.trim() : 'en';
})();

type LegacyListItem = { id: number; name: string };

async function callImportFunction(body: Record<string, unknown>): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/import-legacy-course`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${String(SUPABASE_ANON_KEY)}`,
      apikey: String(SUPABASE_ANON_KEY),
      'x-agent-token': String(AGENT_TOKEN),
      'x-organization-id': String(ORGANIZATION_ID),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!json) throw new Error('empty_response');
  if (json.ok === false) {
    const msg = json?.error?.message ? String(json.error.message) : 'request_failed';
    throw new Error(msg);
  }
  if (json.success === false) {
    throw new Error(String(json.error || 'request_failed'));
  }
  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }
  return json;
}

async function listLegacyCourses(): Promise<LegacyListItem[]> {
  const json = await callImportFunction({ action: 'list', limit });
  const items = Array.isArray(json.items) ? json.items : [];
  return items
    .map((it: any) => ({ id: Number(it?.id), name: String(it?.name ?? '') }))
    .filter((it: any) => Number.isFinite(it.id));
}

async function probeImport(courseId: number): Promise<boolean> {
  try {
    await callImportFunction({ action: 'import', courseId, migrateImages: false, locale });
    return true;
  } catch {
    return false;
  }
}

async function importWithImages(courseId: number): Promise<any> {
  return await callImportFunction({ action: 'import', courseId, migrateImages: true, locale });
}

async function main() {
  console.log(`🔎 Listing up to ${limit} legacy courses...`);
  const candidates = await listLegacyCourses();
  console.log(`Found ${candidates.length} candidate course(s).`);

  const selected: LegacyListItem[] = [];
  for (const c of candidates) {
    if (selected.length >= 10) break;
    const ok = await probeImport(c.id);
    if (ok) {
      selected.push(c);
      console.log(`✅ Selected legacy course ${c.id}: ${c.name}`);
    } else {
      console.log(`⏭️  Skipping legacy course ${c.id} (probe failed)`);
    }
  }

  if (selected.length < 10) {
    console.error(`❌ Could only find ${selected.length}/10 importable courses in the first ${candidates.length} candidates.`);
    process.exit(1);
  }

  console.log('\n🖼️  Importing selected courses WITH image migration...\n');
  const results: Array<{ legacyId: number; ok: boolean; courseId?: string; error?: string }> = [];
  for (const c of selected) {
    try {
      const res = await importWithImages(c.id);
      results.push({ legacyId: c.id, ok: true, courseId: res.courseId });
      console.log(`✅ Imported legacy ${c.id} -> ${res.courseId}`);
    } catch (err) {
      results.push({ legacyId: c.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      console.log(`❌ Failed importing legacy ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const okN = results.filter((r) => r.ok).length;
  const failN = results.length - okN;
  console.log('\n════════════════════════════════════');
  console.log(`📊 DONE: ${okN} succeeded, ${failN} failed`);
  console.log('════════════════════════════════════');
  console.log(JSON.stringify({ selected: selected.map((s) => s.id), results }, null, 2));

  if (failN > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


