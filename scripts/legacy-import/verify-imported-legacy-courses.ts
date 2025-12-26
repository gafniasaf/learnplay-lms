/**
 * Verify imported legacy courses are visible in catalog and course.json has migrated image URLs.
 *
 * Usage:
 *   npx tsx scripts/legacy-import/verify-imported-legacy-courses.ts --sample=legacy-2
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

const sampleCourseId = argValue('--sample=') || 'legacy-2';
const LEGACY_BLOB_BASE = 'https://expertcollegeresources.blob.core.windows.net/assets-cnt';

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${String(SUPABASE_ANON_KEY)}`,
      apikey: String(SUPABASE_ANON_KEY),
      'x-agent-token': String(AGENT_TOKEN),
      'x-organization-id': String(ORGANIZATION_ID),
    },
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!json) throw new Error('empty_response');
  if (json.ok === false) throw new Error(String(json?.error?.message || 'request_failed'));
  if (!res.ok) throw new Error(`http_${res.status}`);
  return json;
}

async function main() {
  const listUrl = `${SUPABASE_URL}/functions/v1/list-courses?limit=100&page=1&sort=newest&includeArchived=0`;
  const list = await fetchJson(listUrl);
  const items = Array.isArray(list.items) ? list.items : [];
  const legacy = items.filter((it: any) => typeof it?.id === 'string' && it.id.startsWith('legacy-'));
  console.log(`✅ Catalog contains ${legacy.length} legacy-* course(s).`);
  console.log(legacy.map((c: any) => c.id).slice(0, 25));

  const getUrl = `${SUPABASE_URL}/functions/v1/get-course?courseId=${encodeURIComponent(sampleCourseId)}`;
  const payload = await fetchJson(getUrl);
  const course =
    payload && typeof payload === 'object' && 'content' in payload && 'format' in payload
      ? (payload as any).content
      : payload;
  const studyTexts = Array.isArray((course as any).studyTexts) ? (course as any).studyTexts : [];
  const joined = studyTexts.map((s: any) => String(s?.content || '')).join('\n\n');

  const hasLegacyBlob = joined.includes(LEGACY_BLOB_BASE);
  const hasMediaLibrary = joined.includes('/storage/v1/object/public/media-library/');
  const imgTagCount = (joined.match(/<img\\b/gi) || []).length;

  console.log(`✅ Sample course: ${sampleCourseId}`);
  console.log(`   studyTexts: ${studyTexts.length}`);
  console.log(`   <img> tags in studyTexts: ${imgTagCount}`);
  console.log(`   contains legacy blob URLs: ${hasLegacyBlob}`);
  console.log(`   contains media-library URLs: ${hasMediaLibrary}`);

  if (!hasMediaLibrary) {
    console.warn('⚠️  No migrated media-library URLs detected in studyTexts content for this sample.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


