import { test, expect } from '@playwright/test';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { randomUUID } from 'crypto';

loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env before running live E2E`);
  }
  return String(v).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function poll<T>(args: {
  name: string;
  timeoutMs: number;
  intervalMs: number;
  fn: () => Promise<T | null>;
}): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < args.timeoutMs) {
    const res = await args.fn();
    if (res !== null) return res;
    await sleep(args.intervalMs);
  }
  throw new Error(`Timed out waiting for ${args.name} after ${args.timeoutMs}ms`);
}

test('live: course lifecycle works in dev-agent mode (versions + restore + archive + delete)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || requireEnv('SUPABASE_ANON_KEY');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const courseId = `e2e-lifecycle-agent-${Date.now()}`;
  const subject = `Lifecycle Agent E2E ${new Date().toISOString().slice(0, 19)}`;
  // IMPORTANT: Use a synthetic UUID that is NOT a real auth.users id.
  // Preview/dev-agent mode must work without real users.
  const devUserId = randomUUID();

  const headers = {
    'Content-Type': 'application/json',
    'x-agent-token': AGENT_TOKEN,
    'x-organization-id': ORGANIZATION_ID,
    'x-user-id': devUserId,
    // Mirror frontend behavior (dev agent calls send anon bearer too)
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  } as const;

  // 1) Generate a real course
  const enqueueResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers,
    data: {
      jobType: 'ai_course_generate',
      payload: {
        course_id: courseId,
        subject,
        grade_band: '3-5',
        grade: '3-5',
        items_per_group: 1,
        mode: 'options',
        notes: 'E2E lifecycle check. Keep it minimal.',
      },
    },
    timeout: 60_000,
  });
  const enqueueJson = (await enqueueResp.json().catch(() => null)) as any;
  expect(enqueueResp.ok()).toBeTruthy();
  if (enqueueJson && typeof enqueueJson === 'object' && enqueueJson.ok === false) {
    const msg = enqueueJson?.error?.message || enqueueJson?.error || 'enqueue-job failed';
    throw new Error(`enqueue-job failed: ${String(msg)} (httpStatus=${String(enqueueJson?.httpStatus)})`);
  }
  expect(enqueueJson?.ok).toBe(true);
  const jobId = String(enqueueJson?.jobId || '').trim();
  expect(jobId).toMatch(/[0-9a-f-]{36}/i);

  const procResp = await request.get(
    `${SUPABASE_URL}/functions/v1/process-pending-jobs?jobId=${encodeURIComponent(jobId)}&mediaN=0`,
    { headers: { 'x-agent-token': AGENT_TOKEN }, timeout: 10 * 60_000 }
  );
  const procJson = (await procResp.json().catch(() => null)) as any;
  expect(procResp.ok()).toBeTruthy();
  expect(procJson?.ok).toBe(true);

  await poll({
    name: 'course.json persisted',
    timeoutMs: 6 * 60_000,
    intervalMs: 2500,
    fn: async () => {
      const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
      const r = await request.get(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok()) return null;
      const j = await r.json().catch(() => null);
      return j || null;
    },
  });

  // 2) Publish (creates version 2 snapshot)
  const publishResp = await request.post(`${SUPABASE_URL}/functions/v1/publish-course`, {
    headers,
    data: { courseId, changelog: 'E2E lifecycle publish' },
    timeout: 60_000,
  });
  const publishJson = (await publishResp.json().catch(() => null)) as any;
  expect(publishResp.ok()).toBeTruthy();
  if (publishJson && typeof publishJson === 'object' && publishJson.ok === false) {
    throw new Error(`publish-course failed: ${publishJson?.error?.message || publishJson?.error || 'unknown'}`);
  }
  const v2 = Number(publishJson?.version);
  expect(v2).toBeGreaterThanOrEqual(2);

  // 3) List versions (agent auth should be allowed)
  const listResp = await request.get(`${SUPABASE_URL}/functions/v1/list-course-versions?courseId=${encodeURIComponent(courseId)}&limit=10`, {
    headers,
    timeout: 60_000,
  });
  const listJson = (await listResp.json().catch(() => null)) as any;
  expect(listResp.ok()).toBeTruthy();
  if (listJson && typeof listJson === 'object' && listJson.ok === false) {
    throw new Error(`list-course-versions failed: ${listJson?.error?.message || listJson?.error || 'unknown'}`);
  }
  expect(Array.isArray(listJson?.versions)).toBe(true);
  expect(listJson.versions.length).toBeGreaterThanOrEqual(1);

  // 4) Get version snapshot (agent auth should be allowed)
  const snapResp = await request.get(
    `${SUPABASE_URL}/functions/v1/get-course-version-snapshot?courseId=${encodeURIComponent(courseId)}&version=${encodeURIComponent(String(v2))}`,
    { headers, timeout: 60_000 }
  );
  const snapJson = (await snapResp.json().catch(() => null)) as any;
  expect(snapResp.ok()).toBeTruthy();
  if (snapJson && typeof snapJson === 'object' && snapJson.ok === false) {
    throw new Error(`get-course-version-snapshot failed: ${snapJson?.error?.message || snapJson?.error || 'unknown'}`);
  }
  expect(snapJson?.snapshot || snapJson?.metadata_snapshot).toBeTruthy();

  // 5) Restore from v2 (creates v3)
  const restoreResp = await request.post(`${SUPABASE_URL}/functions/v1/restore-course-version`, {
    headers,
    data: { courseId, version: v2, changelog: 'E2E lifecycle restore' },
    timeout: 60_000,
  });
  const restoreJson = (await restoreResp.json().catch(() => null)) as any;
  expect(restoreResp.ok()).toBeTruthy();
  if (restoreJson && typeof restoreJson === 'object' && restoreJson.ok === false) {
    throw new Error(`restore-course-version failed: ${restoreJson?.error?.message || restoreJson?.error || 'unknown'}`);
  }
  expect(Number(restoreJson?.newVersion)).toBeGreaterThan(v2);

  // 6) Archive then delete (agent auth should be allowed)
  const archiveResp = await request.post(`${SUPABASE_URL}/functions/v1/archive-course`, {
    headers,
    data: { courseId, reason: 'E2E' },
    timeout: 60_000,
  });
  const archiveJson = (await archiveResp.json().catch(() => null)) as any;
  expect(archiveResp.ok()).toBeTruthy();
  if (archiveJson && typeof archiveJson === 'object' && archiveJson.ok === false) {
    throw new Error(`archive-course failed: ${archiveJson?.error?.message || archiveJson?.error || 'unknown'}`);
  }

  const deleteResp = await request.post(`${SUPABASE_URL}/functions/v1/delete-course`, {
    headers,
    data: { courseId, confirm: courseId },
    timeout: 60_000,
  });
  const deleteJson = (await deleteResp.json().catch(() => null)) as any;
  expect(deleteResp.ok()).toBeTruthy();
  if (deleteJson && typeof deleteJson === 'object' && deleteJson.ok === false) {
    throw new Error(`delete-course failed: ${deleteJson?.error?.message || deleteJson?.error || 'unknown'}`);
  }
});


