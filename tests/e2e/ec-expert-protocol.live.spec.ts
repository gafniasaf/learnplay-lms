// Live E2E test for EC Expert protocol

import { test, expect } from '@playwright/test';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';

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

test('live: ec-expert protocol generates exercises from study text (real DB + real LLM)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || requireEnv('SUPABASE_ANON_KEY');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const courseId = `e2e-ec-expert-${Date.now()}`;
  const studyText = `
    Zuur-base balans is cruciaal voor het handhaven van homeostase in het menselijk lichaam.
    De pH-schaal loopt van 0 tot 14, waarbij 7 neutraal is.
    Bloed-pH wordt strak gereguleerd tussen 7,35 en 7,45.
    Het lichaam gebruikt buffers, het ademhalingssysteem en het renale systeem om deze balans te handhaven.
  `;

  // Enqueue job with EC Expert protocol
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
        subject: 'Zuur-Base Balans',
        grade_band: '3-5',
        grade: '3-5',
        // Must be divisible by 3 to preserve cluster variants (1/2/3) for EC Expert.
        items_per_group: 3,
        mode: 'options',
        protocol: 'ec-expert',
        notes: 'E2E: EC Expert protocol run',
        study_text: studyText,
      },
    },
  });

  const enqueueJson = await enqueueResp.json().catch(() => null) as any;
  expect(enqueueResp.ok()).toBeTruthy();
  expect(enqueueJson?.ok).toBe(true);
  const jobId = enqueueJson?.jobId;
  expect(jobId).toBeTruthy();

  console.log(`[live-e2e] queued jobId=${String(jobId)} courseId=${courseId}`);

  // Run pipeline for this specific job (agent-token path; no user login).
  const procResp = await request.get(
    `${SUPABASE_URL}/functions/v1/process-pending-jobs?jobId=${encodeURIComponent(String(jobId))}&mediaN=0`,
    { headers: { 'x-agent-token': AGENT_TOKEN }, timeout: 10 * 60_000 }
  );
  if (!procResp.ok()) {
    const status = procResp.status();
    const bodyText = await procResp.text().catch(() => "");
    throw new Error(`process-pending-jobs failed (HTTP ${status}): ${bodyText.slice(0, 2000)}`);
  }
  const procJson = (await procResp.json().catch(() => null)) as any;
  if (procJson?.ok !== true) {
    throw new Error(`process-pending-jobs returned ok=false: ${JSON.stringify(procJson).slice(0, 2000)}`);
  }

  // Wait for course.json to be persisted.
  const _storedCourse = await poll({
    name: 'course.json persisted',
    timeoutMs: 6 * 60_000,
    intervalMs: 2500,
    fn: async () => {
      // Fail fast if the job failed (so we don't wait on course.json forever)
      const statusRes = await request.get(`${SUPABASE_URL}/functions/v1/list-course-jobs?jobId=${encodeURIComponent(String(jobId))}`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      if (statusRes.ok()) {
        const statusJson = (await statusRes.json().catch(() => null)) as any;
        const job = Array.isArray(statusJson?.jobs) ? statusJson.jobs[0] : null;
        if (job?.status === 'failed') {
          throw new Error(`Job failed: ${String(job?.error || 'unknown error')}`);
        }
      }

      const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
      const r = await request.get(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok()) return null;
      return (await r.json().catch(() => null)) as any;
    },
  });

  // Verify course is retrievable via get-course as well.
  const courseResp = await request.get(`${SUPABASE_URL}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  expect(courseResp.ok()).toBeTruthy();
  const course = await courseResp.json() as any;

  const payload = (course && typeof course === 'object' && 'content' in course) ? (course as any).content : course;
  expect(payload).toBeDefined();
  expect(Array.isArray(payload.items)).toBe(true);

  // items_per_group=3 and default groups=3 => 9 items
  expect(payload.items.length).toBe(9);
  expect(Array.isArray(payload.studyTexts)).toBe(true);
  expect(payload.studyTexts[0].content).toContain('Zuur-base balans');

  // Verify items are in Dutch (basic check)
  const firstItem = payload.items[0];
  expect(firstItem.text).toBeDefined();
  expect(typeof firstItem.text).toBe('string');
  
  // Verify items have required fields
  expect(firstItem.mode).toBe('options');
  expect(firstItem.options).toBeDefined();
  expect(Array.isArray(firstItem.options)).toBe(true);
  expect(firstItem.correctIndex).toBeDefined();
  expect(typeof firstItem.correctIndex).toBe('number');
  expect(firstItem.explain).toBeDefined();

  // Ensure each item has exactly one [blank] placeholder after normalization.
  for (const it of payload.items) {
    const blanks = String(it.text || '').match(/\[blank\]/g) || [];
    expect(blanks.length).toBe(1);
  }
});

