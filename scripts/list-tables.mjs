import fs from 'node:fs';
import path from 'node:path';

function requireEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== 'string' || !v.trim()) {
    console.error(`❌ ${name} is REQUIRED - set env var before running`);
    process.exit(1);
  }
  return v.trim();
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

const SUPABASE_ACCESS_TOKEN = requireEnv('SUPABASE_ACCESS_TOKEN');
const SUPABASE_PROJECT_REF = resolveProjectRef();

// List all public tables
const sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name";

const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(SUPABASE_PROJECT_REF)}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
  },
  body: JSON.stringify({ query: sql }),
});

console.log('Status:', response.status);
const data = await response.json().catch(() => null);
if (!Array.isArray(data)) {
  console.log('Response:', JSON.stringify(data, null, 2));
  process.exit(response.ok ? 0 : 1);
}

console.log('Tables in public schema:');
data.forEach(row => console.log(' -', row.table_name));
console.log(`\nTotal: ${data.length} tables`);


