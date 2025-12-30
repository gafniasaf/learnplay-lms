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

const sql = `
ALTER TABLE public.course_metadata
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS grade_band TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

CREATE INDEX IF NOT EXISTS idx_course_metadata_archived_at ON public.course_metadata(archived_at);
CREATE INDEX IF NOT EXISTS idx_course_metadata_deleted_at ON public.course_metadata(deleted_at);
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
if (response.status === 201 || response.status === 200) {
  console.log('✅ Columns/indexes applied successfully');
} else {
  console.log('❌ Error:', JSON.stringify(data, null, 2));
  process.exit(1);
}


