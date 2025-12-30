// Apply a single migration file via Supabase Management API
//
// SECURITY:
// - Never hardcode tokens.
// - Require SUPABASE_ACCESS_TOKEN via env (or env file loader upstream).
// - Derive project ref from env or supabase/config.toml.
import * as fs from 'fs';
import * as path from 'path';

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.log('Usage: node scripts/apply-migration.mjs <migration-file.sql>');
  process.exit(1);
}

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN is REQUIRED - set env var before running');
  process.exit(1);
}

function resolveProjectRef() {
  const fromEnv = process.env.SUPABASE_PROJECT_REF;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();

  const url = process.env.SUPABASE_URL;
  if (url && typeof url === 'string') {
    const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    if (m?.[1]) return m[1];
  }

  try {
    const toml = fs.readFileSync(path.join(process.cwd(), 'supabase', 'config.toml'), 'utf-8');
    const m = toml.match(/^\s*project_id\s*=\s*\"([a-z0-9]+)\"\s*$/m);
    if (m?.[1]) return m[1];
  } catch {
    // ignore
  }

  console.error('❌ SUPABASE_PROJECT_REF is REQUIRED (or set SUPABASE_URL, or ensure supabase/config.toml has project_id)');
  process.exit(1);
}

const projectRef = resolveProjectRef();

const migrationPath = migrationFile.includes('/') || migrationFile.includes('\\')
  ? migrationFile
  : path.join('supabase/migrations', migrationFile);

if (!fs.existsSync(migrationPath)) {
  console.error(`File not found: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf-8');
console.log(`Applying: ${path.basename(migrationPath)} (${sql.length} chars)`);

const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: sql })
});

console.log('Status:', response.status);
const text = await response.text();
try {
  const data = JSON.parse(text);
  if (response.status >= 400) {
    console.error('❌ Error:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  console.log('✅ Migration applied successfully');
  if (Array.isArray(data) && data.length > 0) {
    console.log('Result:', JSON.stringify(data, null, 2));
  }
} catch {
  console.log('Response:', text.slice(0, 500));
  if (response.status >= 400) process.exit(1);
}

