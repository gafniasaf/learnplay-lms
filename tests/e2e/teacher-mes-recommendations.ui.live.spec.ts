import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../helpers/load-local-env';

loadLocalEnvForTests();
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

async function pollJobDone(args: {
  request: any;
  SUPABASE_URL: string;
  agentHeaders: Record<string, string>;
  jobId: string;
  timeoutMs: number;
}): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < args.timeoutMs) {
    const r = await args.request.get(
      `${args.SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(args.jobId)}&includeEvents=true`,
      { headers: args.agentHeaders, timeout: 60_000 }
    );
    if (r.ok()) {
      const j = (await r.json().catch(() => null)) as any;
      const st = String(j?.job?.status || '').toLowerCase();
      if (st === 'done') return;
      if (st === 'failed' || st === 'dead_letter' || st === 'stale') {
        throw new Error(`job failed (status=${st}): ${String(j?.job?.error || 'unknown')}`);
      }
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for job ${args.jobId} to complete`);
}

test.describe('live UI: teacher MES recommendations', () => {
  test.use({ storageState: 'playwright/.auth/teacher.json' });

  test('navigates via hamburger → TeacherGPT → MES, searches, shows results', async ({ page, request }) => {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
    const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
    const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

    const agentHeaders = {
      'Content-Type': 'application/json',
      'x-agent-token': AGENT_TOKEN,
      'x-organization-id': ORGANIZATION_ID,
    } as const;

    // Seed: index 1 MES doc for deterministic UI search
    const token = `MES_UI_PHRASE_${randomUUID()}`;
    const doc = {
      doc_id: `e2e-ui-${randomUUID()}`,
      title: 'UI MES Doc',
      url: 'https://example.com/mes/ui',
      text: `UniquePhrase: ${token}\nTopic: cardiac anatomy.\nAtria and ventricles.`,
    };

    const enq = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
      headers: agentHeaders,
      data: { jobType: 'mes_corpus_index', payload: { documents: [doc] } },
      timeout: 60_000,
    });
    expect(enq.ok()).toBeTruthy();
    const enqJson = (await enq.json().catch(() => null)) as any;
    expect(enqJson?.ok).toBe(true);
    const jobId = String(enqJson?.jobId || '').trim();
    expect(jobId).toMatch(/[0-9a-f-]{36}/i);

    const worker = await request.post(
      `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`,
      { headers: { 'Content-Type': 'application/json' }, data: { worker: true, queue: 'agent', jobId }, timeout: 10 * 60_000 }
    );
    expect(worker.ok()).toBeTruthy();

    await pollJobDone({ request, SUPABASE_URL, agentHeaders, jobId, timeoutMs: 8 * 60_000 });

    // UI: open menu and navigate to MES recommendations
    await page.goto('/teacher/teachergpt/mes');
    await page.waitForLoadState('domcontentloaded');

    // Search
    await page.locator('[data-cta-id="cta-teachergpt-mes-query"]').fill(`cardiac anatomy atria ventricles ${token}`);
    await page.locator('[data-cta-id="cta-teachergpt-mes-search"]').click();

    // Expect results show the seeded doc_id (avoid strict-mode: doc_id can appear in multiple result fields).
    await expect(page.getByText(new RegExp(doc.doc_id, 'i')).first()).toBeVisible({ timeout: 60_000 });
  });
});


