/**
 * Test the deployed import-legacy-course Edge Function (agent auth).
 *
 * Usage:
 *   npx tsx scripts/legacy-import/test-edge-import.ts --courseId=169 --locale=he
 *   npx tsx scripts/legacy-import/test-edge-import.ts --courseId=169 --skip-images
 */

import { loadLearnPlayEnv } from '../../tests/helpers/parse-learnplay-env';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Load supabase/.deploy.env (gitignored) before reading process.env.
// Do NOT print values.
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
    // ignore; we'll fail loudly if required vars are missing
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

function parseArgs(argv: string[]) {
  const courseIdArg = argv.find((a) => a.startsWith('--courseId='));
  const listArg = argv.find((a) => a === '--list' || a.startsWith('--list='));
  const localeArg = argv.find((a) => a.startsWith('--locale='));
  const skipImages = argv.includes('--skip-images');
  const courseId = courseIdArg ? Number(courseIdArg.split('=')[1]) : 169;
  const locale = localeArg ? String(localeArg.split('=')[1]).trim() : 'he';
  const listLimit = listArg?.includes('=')
    ? Number(String(listArg.split('=')[1]))
    : listArg
      ? 10
      : null;
  return { courseId, locale, migrateImages: !skipImages, listLimit };
}

async function main() {
  const { courseId, locale, migrateImages, listLimit } = parseArgs(process.argv.slice(2));
  if (listLimit === null) {
    if (!Number.isFinite(courseId) || courseId <= 0) blocked('courseId must be a positive number');
  }

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
    body: JSON.stringify(
      listLimit !== null
        ? { action: 'list', limit: listLimit }
        : { action: 'import', courseId, migrateImages, locale }
    ),
  });

  const json = (await res.json().catch(() => null)) as any;
  console.log(JSON.stringify(json, null, 2));

  // withCors uses HTTP 200 even on errors; respect structured failures.
  if (json && typeof json === 'object' && json.ok === false) {
    process.exit(1);
  }
  if (json && typeof json === 'object' && json.success === false) {
    process.exit(1);
  }
  if (!res.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


