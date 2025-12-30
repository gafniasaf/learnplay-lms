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

// Check for views needed by parent/teacher dashboards
const sql = `
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND (table_name LIKE '%child%' OR table_name LIKE '%parent%' OR table_name LIKE '%student%' OR table_name LIKE '%teacher%' OR table_name LIKE '%dashboard%')
ORDER BY table_name
`;

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
console.log('Parent/Student/Teacher related tables/views:');
if (Array.isArray(data)) {
  data.forEach(row => console.log(` - ${row.table_name} (${row.table_type})`));
} else {
  console.log(JSON.stringify(data, null, 2));
}

// Also check for specific views
const viewSql = "SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname";
const viewResponse = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(SUPABASE_PROJECT_REF)}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
  },
  body: JSON.stringify({ query: viewSql }),
});

const viewData = await viewResponse.json().catch(() => null);
console.log('\nAll views:');
if (Array.isArray(viewData)) {
  viewData.forEach(row => console.log(` - ${row.viewname}`));
} else {
  console.log(JSON.stringify(viewData, null, 2));
}


