import { test, expect } from '@playwright/test';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';

// Ensure local-only env files are loaded into process.env for live E2E runs.
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
  // bounded loop
  while (Date.now() - start < args.timeoutMs) {
    const res = await args.fn();
    // IMPORTANT: treat only `null` as "not ready".
    // Some callsites intentionally return `undefined` (e.g. T=void) to signal success.
    if (res !== null) return res;
    await sleep(args.intervalMs);
  }
  throw new Error(`Timed out waiting for ${args.name} after ${args.timeoutMs}ms`);
}

function extractStudyTextImageUrls(studyTextContent: string): string[] {
  const s = String(studyTextContent || '');
  const re = /\[IMAGE:(https?:\/\/[^\]]+)\]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

test('live: course generation should create 3 study texts with 1 image each (real DB + real LLM)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const courseId = `e2e-studytexts-${Date.now()}`;
  const subject = `Statues E2E ${new Date().toISOString().slice(0, 19)}`;
  const notes = 'Create 3 study texts with 1 image each. Ensure every study text includes exactly one [IMAGE:...] marker.';

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
        items_per_group: 2,
        mode: 'options',
        notes,
      },
    },
  });

  const enqueueJson = await enqueueResp.json().catch(() => null) as any;
  expect(enqueueResp.ok()).toBeTruthy();
  expect(enqueueJson?.ok).toBe(true);
  const jobId = String(enqueueJson?.jobId || '').trim();
  expect(jobId).toMatch(/[0-9a-f-]{36}/i);

  console.log(`[live-e2e] queued jobId=${jobId} courseId=${courseId}`);

  // Run the worker path (course job + a batch of media jobs).
  // NOTE: this uses real LLM + real image providers in Edge.
  const procResp = await request.get(`${SUPABASE_URL}/functions/v1/process-pending-jobs?jobId=${encodeURIComponent(jobId)}&mediaN=25`, {
    headers: { 'x-agent-token': AGENT_TOKEN },
    // Real LLM calls can take >30s; override Playwright's default request timeout.
    timeout: 10 * 60_000,
  });
  const procJson = await procResp.json().catch(() => null) as any;
  expect(procResp.ok()).toBeTruthy();
  expect(procJson?.ok).toBe(true);

  // Wait for course.json to exist and include 3 study texts.
  const courseJson = await poll<any>({
    name: 'course.json persisted with 3 studyTexts',
    timeoutMs: 6 * 60_000,
    intervalMs: 2500,
    fn: async () => {
      const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
      const r = await request.get(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok()) return null;
      const j = await r.json().catch(() => null);
      if (!j) return null;
      const content = (j && typeof j === 'object' && 'content' in j && 'format' in j) ? (j as any).content : j;
      const studyTexts = Array.isArray((content as any)?.studyTexts) ? (content as any).studyTexts : [];
      if (studyTexts.length !== 3) return null;
      return content;
    },
  });

  const studyTexts = (courseJson as any).studyTexts as Array<{ id: string; content: string }>;
  expect(studyTexts).toHaveLength(3);

  // Poll media jobs and drive media-runner until study-text images are embedded into course.json.
  await poll<void>({
    name: 'all 3 studyText images embedded as URLs',
    timeoutMs: 8 * 60_000,
    intervalMs: 4000,
    fn: async () => {
      const mjResp = await request.get(`${SUPABASE_URL}/functions/v1/list-media-jobs?limit=50&courseId=${encodeURIComponent(courseId)}`);
      if (!mjResp.ok()) return null;
      const mjJson = await mjResp.json().catch(() => null) as any;
      const jobs = Array.isArray(mjJson?.jobs) ? mjJson.jobs : [];
      const studyJobs = jobs.filter((j: any) => j?.metadata?.targetRef?.type === 'study_text');

      // If not all jobs are done yet, nudge the runner and keep polling.
      const pending = studyJobs.filter((j: any) => j?.status !== 'done');
      if (pending.length > 0) {
        await request.post(`${SUPABASE_URL}/functions/v1/media-runner?n=25`, {
          headers: { 'x-agent-token': AGENT_TOKEN, 'Content-Type': 'application/json' },
          // Image generation can take >30s; override Playwright's default request timeout.
          timeout: 10 * 60_000,
        });
        return null;
      }

      // Confirm course.json embeds URLs in every study text.
      const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
      const r = await request.get(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok()) return null;
      const j = await r.json().catch(() => null);
      if (!j) return null;
      const content = (j && typeof j === 'object' && 'content' in j && 'format' in j) ? (j as any).content : j;
      const sts = Array.isArray((content as any)?.studyTexts) ? (content as any).studyTexts : [];
      if (sts.length !== 3) return null;

      const urlCounts = sts.map((st: any) => extractStudyTextImageUrls(String(st?.content || '')).length);
      const totalUrls = urlCounts.reduce((a: number, n: number) => a + n, 0);
      if (totalUrls < 3) {
        // If we have done jobs but missing embeds, explicitly sync once (this should normally be unnecessary).
        await request.post(`${SUPABASE_URL}/functions/v1/sync-study-text-images`, {
          headers: { 'x-agent-token': AGENT_TOKEN, 'Content-Type': 'application/json' },
          data: { courseId },
          timeout: 60_000,
        });
        return null;
      }

      return undefined;
    },
  });

  // Final assertion: each study text has at least one URL image marker.
  const finalUrl = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
  const finalResp = await request.get(finalUrl, { headers: { 'Cache-Control': 'no-cache' } });
  expect(finalResp.ok()).toBeTruthy();
  const finalJson = await finalResp.json().catch(() => null) as any;
  const finalContent = finalJson && typeof finalJson === 'object' && 'content' in finalJson && 'format' in finalJson
    ? finalJson.content
    : finalJson;
  const finalStudyTexts = Array.isArray(finalContent?.studyTexts) ? finalContent.studyTexts : [];
  expect(finalStudyTexts).toHaveLength(3);

  for (const st of finalStudyTexts) {
    const urls = extractStudyTextImageUrls(String(st?.content || ''));
    expect(urls.length).toBeGreaterThanOrEqual(1);
  }
});


