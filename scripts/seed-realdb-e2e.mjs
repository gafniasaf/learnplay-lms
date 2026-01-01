import { createClient } from '@supabase/supabase-js';
import { loadLocalEnvForTests } from '../tests/helpers/load-local-env';
import { loadLearnPlayEnv } from '../tests/helpers/parse-learnplay-env';

// Seed deterministic data for real-db E2E tests.
// Requires:
//  - SUPABASE_URL (or VITE_SUPABASE_URL)
//  - SUPABASE_SERVICE_ROLE_KEY (required; no fallbacks)

function envOrThrow(name, alt) {
  const v = process.env[name] ?? (alt ? process.env[alt] : undefined);
  if (!v) throw new Error(`Missing env: ${name}${alt ? ` (or ${alt})` : ''}`);
  return v;
}

async function run() {
  // Attempt to auto-resolve required env vars from local env files (supabase/.deploy.env, learnplay.env), without printing secrets.
  loadLocalEnvForTests();
  loadLearnPlayEnv();

  const url = envOrThrow('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY (required).');

  const supabase = createClient(url, key);

  // Resolve a test user to assign as created_by for RLS visibility
  const ownerEmail = process.env.E2E_EMAIL || process.env.E2E_ADMIN_EMAIL;
  if (!ownerEmail) {
    console.error('❌ E2E_EMAIL (or E2E_ADMIN_EMAIL) is REQUIRED - set env var before running');
    process.exit(1);
  }

  const orgId = process.env.ORGANIZATION_ID;
  if (!orgId) {
    console.error('❌ ORGANIZATION_ID is REQUIRED - set env var before running');
    process.exit(1);
  }

  let ownerId = null;
  try {
    const { data: users, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw listErr;
    const match = users.users?.find(u => (u.email || '').toLowerCase() === ownerEmail.toLowerCase());
    if (match) ownerId = match.id;
  } catch (e) {
    console.warn('⚠️ Could not list users to set created_by:', e?.message || e);
  }

  if (!ownerId) {
    console.error('❌ BLOCKED: ownerId unresolved for seeded jobs (RLS visibility).');
    console.error('   Fix: run `npx tsx scripts/provision-e2e-users.ts` first, then re-run this seed.');
    process.exit(1);
  }

  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600_000).toISOString();

  const jobs = [
    {
      id: '00000000-0000-0000-0000-0000000000a1',
      course_id: 'e2e-gen-course',
      subject: 'E2E Generating Job',
      organization_id: orgId,
      created_by: ownerId,
      grade: '3-5',
      grade_band: '3-5',
      status: 'running',
      mode: 'options',
      summary: JSON.stringify({
        phase_0: { status: 'done', ai_calls: 1 },
        phase_1: { status: 'done', ai_calls: 2 },
        phase_2: { status: 'running', ai_calls: 1 },
      }),
    },
    {
      id: '00000000-0000-0000-0000-0000000000b1',
      course_id: 'e2e-fail-course',
      subject: 'E2E Failed Job',
      organization_id: orgId,
      created_by: ownerId,
      grade: '6-8',
      grade_band: '6-8',
      status: 'failed',
      mode: 'options',
      summary: JSON.stringify({ phase_3: { status: 'failed', error: 'Seeded failure' } }),
    },
    {
      id: '00000000-0000-0000-0000-0000000000c1',
      course_id: 'e2e-stuck-course',
      subject: 'E2E Stuck Job',
      organization_id: orgId,
      created_by: ownerId,
      grade: '9-12',
      grade_band: '9-12',
      status: 'running',
      mode: 'options',
      summary: JSON.stringify({ phase_1: { status: 'running' } }),
    },
    {
      id: '00000000-0000-0000-0000-0000000000d1',
      course_id: 'e2e-review-course',
      subject: 'E2E Needs Attention Job',
      organization_id: orgId,
      created_by: ownerId,
      grade: '3-5',
      grade_band: '3-5',
      status: 'needs_attention',
      mode: 'options',
      summary: JSON.stringify({ review: { overall: 62, correctness: 60, clarity: 65, age_appropriateness: 62 } }),
    },
  ];

  const { error: upsertErr } = await supabase.from('ai_course_jobs').upsert(jobs, { onConflict: 'id' });
  if (upsertErr) throw upsertErr;

  const events = [
    { id: '00000000-0000-0000-0000-000000000101', job_id: '00000000-0000-0000-0000-0000000000a1', seq: 1, step: 'generating', status: 'info', progress: 10, message: 'Starting generation', created_at: hoursAgo(0.12) },
    { id: '00000000-0000-0000-0000-000000000102', job_id: '00000000-0000-0000-0000-0000000000a1', seq: 2, step: 'storage_write', status: 'info', progress: 75, message: 'Uploaded course JSON', created_at: hoursAgo(0.07) },
    { id: '00000000-0000-0000-0000-000000000103', job_id: '00000000-0000-0000-0000-0000000000a1', seq: 3, step: 'catalog_update', status: 'info', progress: 85, message: 'Catalog updated', created_at: hoursAgo(0.05) },
  ];
  await supabase.from('job_events').upsert(events, { onConflict: 'id' });

  console.log('✅ Seeded real-db E2E data.');
}

run().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
