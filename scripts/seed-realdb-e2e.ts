import { createClient } from '@supabase/supabase-js';

/**
 * Seed deterministic data for real-db E2E tests.
 *
 * Requires:
 *   - SUPABASE_URL (or VITE_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY (recommended) or an admin-capable key
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/seed-realdb-e2e.ts
 */

function envOrThrow(name: string, alt?: string) {
  const v = process.env[name] ?? (alt ? process.env[alt] : undefined);
  if (!v) throw new Error(`Missing env: ${name}${alt ? ` (or ${alt})` : ''}`);
  return v;
}

async function run() {
  const url = envOrThrow('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY (preferred). Fallback anon/publishable key may fail due to RLS.');

  const supabase = createClient(url, key);

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

  const jobs = [
    {
      id: 'e2e-generating-1',
      course_id: 'e2e-gen-course',
      subject: 'E2E Generating Job',
      grade: '3-5',
      status: 'running',
      current_phase: 2,
      summary: JSON.stringify({
        phase_0: { status: 'done', ai_calls: 1 },
        phase_1: { status: 'done', ai_calls: 2 },
        phase_2: { status: 'running', ai_calls: 1 },
      }),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: 'e2e-failed-1',
      course_id: 'e2e-fail-course',
      subject: 'E2E Failed Job',
      grade: '6-8',
      status: 'failed',
      current_phase: 3,
      summary: JSON.stringify({ phase_3: { status: 'failed', error: 'Seeded failure' } }),
      job_error: 'Seeded failure for E2E',
      created_at: hoursAgo(3),
      updated_at: hoursAgo(3),
    },
    {
      id: 'e2e-stuck-1',
      course_id: 'e2e-stuck-course',
      subject: 'E2E Stuck Job',
      grade: '9-12',
      status: 'running',
      current_phase: 1,
      summary: JSON.stringify({ phase_1: { status: 'running' } }),
      created_at: hoursAgo(4),
      updated_at: hoursAgo(4), // stale to trigger stuck UI
    },
    {
      id: 'e2e-needs-attn-1',
      course_id: 'e2e-review-course',
      subject: 'E2E Needs Attention Job',
      grade: '3-5',
      status: 'needs_attention',
      current_phase: 5,
      summary: JSON.stringify({ review: { overall: 62, correctness: 60, clarity: 65, age_appropriateness: 62 } }),
      created_at: hoursAgo(1),
      updated_at: hoursAgo(1),
    },
  ];

  // Upsert jobs
  const { error: upsertErr } = await supabase.from('ai_course_jobs').upsert(jobs, { onConflict: 'id' });
  if (upsertErr) throw upsertErr;

  // Seed some events for the generating job timeline
  const events = [
    { id: 'e2e-evt-1', job_id: 'e2e-generating-1', event_type: 'phase_start', message: 'Starting Phase 2: Repair', created_at: hoursAgo(0.1) },
    { id: 'e2e-evt-2', job_id: 'e2e-generating-1', event_type: 'info', message: 'Validating 20 items', created_at: hoursAgo(0.08) },
    { id: 'e2e-evt-3', job_id: 'e2e-generating-1', event_type: 'repair', message: 'Repaired 5 validation failures', created_at: hoursAgo(0.05) },
  ];
  // Use insert with ignore duplicates if supported; else do maybeSingle upserts
  await supabase.from('job_events').upsert(events, { onConflict: 'id' });

  console.log('✅ Seeded real-db E2E data.');
}

run().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});