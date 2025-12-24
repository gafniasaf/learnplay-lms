import { test, expect } from '@playwright/test';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';

// Load local-only env files into process.env for live E2E runs.
// This does NOT print secrets; it only populates process.env.
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

test('live: publish-course works with agent token auth (no user login)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || requireEnv('SUPABASE_ANON_KEY');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const courseId = `e2e-publish-agent-${Date.now()}`;
  const subject = `Publish Agent E2E ${new Date().toISOString().slice(0, 19)}`;

  // Keep notes free of the word "images" to avoid triggering study-text image enqueue logic.
  const notes = 'E2E publish check. Keep it minimal: 1 group, 1 item, short options.';

  const enqueueResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: {
      'Content-Type': 'application/json',
      'x-agent-token': AGENT_TOKEN,
      'x-organization-id': ORGANIZATION_ID,
    },
    data: {
      jobType: 'ai_course_generate',
      payload: {
        course_id: courseId,
        subject,
        grade_band: '3-5',
        grade: '3-5',
        items_per_group: 1,
        mode: 'options',
        notes,
      },
    },
    timeout: 60_000,
  });
  const enqueueJson = (await enqueueResp.json().catch(() => null)) as any;
  expect(enqueueResp.ok()).toBeTruthy();
  expect(enqueueJson?.ok).toBe(true);
  const jobId = String(enqueueJson?.jobId || '').trim();
  expect(jobId).toMatch(/[0-9a-f-]{36}/i);

  const procResp = await request.get(
    `${SUPABASE_URL}/functions/v1/process-pending-jobs?jobId=${encodeURIComponent(jobId)}&mediaN=0`,
    {
      headers: { 'x-agent-token': AGENT_TOKEN },
      timeout: 10 * 60_000,
    }
  );
  const procJson = (await procResp.json().catch(() => null)) as any;
  expect(procResp.ok()).toBeTruthy();
  expect(procJson?.ok).toBe(true);

  // Ensure course JSON exists before publishing (storage is the source of truth for publish snapshot).
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

  // Publish via agent token (this is the Lovable/preview path: no real Supabase user session).
  const publishResp = await request.post(`${SUPABASE_URL}/functions/v1/publish-course`, {
    headers: {
      'Content-Type': 'application/json',
      // Mirrors the frontend dev-agent mode headers
      'x-agent-token': AGENT_TOKEN,
      'x-organization-id': ORGANIZATION_ID,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    data: {
      courseId,
      changelog: 'E2E publish via agent token',
    },
    timeout: 60_000,
  });
  const publishJson = (await publishResp.json().catch(() => null)) as any;
  expect(publishResp.ok()).toBeTruthy();

  // withCors wraps Errors.* into HTTP 200 with ok:false/httpStatus. Treat that as a hard failure.
  if (publishJson && typeof publishJson === 'object' && publishJson.ok === false) {
    const msg = publishJson?.error?.message || publishJson?.error || 'publish-course failed';
    throw new Error(`publish-course failed: ${String(msg)} (httpStatus=${String(publishJson?.httpStatus)})`);
  }

  expect(typeof publishJson?.version).toBe('number');
  expect(publishJson.version).toBeGreaterThanOrEqual(2);

  // Verify snapshot exists in Storage (hybrid storage contract)
  const versionPath = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/versions/${encodeURIComponent(String(publishJson.version))}.json?cb=${Date.now()}`;
  const snapResp = await request.get(versionPath, { headers: { 'Cache-Control': 'no-cache' } });
  expect(snapResp.ok()).toBeTruthy();
  const snapshot = await snapResp.json().catch(() => null);
  expect(snapshot).toBeTruthy();
});


