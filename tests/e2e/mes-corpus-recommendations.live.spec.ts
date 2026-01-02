import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../helpers/load-local-env';

// Attempt to auto-resolve required env vars from local env files (supabase/.deploy.env, learnplay.env), without printing secrets.
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
    if (!r.ok()) {
      await sleep(1500);
      continue;
    }
    const j = (await r.json().catch(() => null)) as any;
    const st = String(j?.job?.status || '').toLowerCase();
    if (st === 'done') return;
    if (st === 'failed' || st === 'dead_letter' || st === 'stale') {
      throw new Error(`mes_corpus_index failed (status=${st}): ${String(j?.job?.error || 'unknown')}`);
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for job ${args.jobId} to complete`);
}

test('live: mes_corpus_index → recommend-mes-content (real DB + real LLM)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const agentHeaders = {
    'Content-Type': 'application/json',
    'x-agent-token': AGENT_TOKEN,
    'x-organization-id': ORGANIZATION_ID,
  } as const;

  const token = `MES_E2E_PHRASE_${randomUUID()}`;
  const docA = {
    doc_id: `e2e-${randomUUID()}`,
    title: 'E2E MES Doc A',
    url: 'https://example.com/mes/a',
    text: `This is an MES corpus document.\nUniquePhrase: ${token}\nTopic: atrioventricular bundle of His.\nAtria, ventricles, aorta.`,
  };
  const docB = {
    doc_id: `e2e-${randomUUID()}`,
    title: 'E2E MES Doc B',
    url: 'https://example.com/mes/b',
    text: `This is another MES corpus document.\nTopic: hypertension basics.\nNot the unique token.`,
  };

  // 1) Enqueue index job
  const enqResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: agentHeaders,
    data: { jobType: 'mes_corpus_index', payload: { documents: [docA, docB] } },
    timeout: 60_000,
  });
  expect(enqResp.ok()).toBeTruthy();
  const enqJson = (await enqResp.json().catch(() => null)) as any;
  expect(enqJson?.ok).toBe(true);
  const jobId = String(enqJson?.jobId || '').trim();
  expect(jobId).toMatch(/[0-9a-f-]{36}/i);

  // 2) Run worker (targeted)
  const workerResp = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { worker: true, queue: 'agent', jobId },
      timeout: 10 * 60_000,
    }
  );
  expect(workerResp.ok()).toBeTruthy();

  // 3) Poll for completion
  await pollJobDone({ request, SUPABASE_URL, agentHeaders, jobId, timeoutMs: 8 * 60_000 });

  // 4) Recommend
  const recResp = await request.post(`${SUPABASE_URL}/functions/v1/recommend-mes-content`, {
    headers: agentHeaders,
    data: { query: `atrioventricular bundle of His ${token}`, limit: 5 },
    timeout: 60_000,
  });
  expect(recResp.ok()).toBeTruthy();
  const recJson = (await recResp.json().catch(() => null)) as any;
  expect(recJson?.ok).toBe(true);
  expect(Array.isArray(recJson?.results)).toBe(true);
  expect(recJson.results.length).toBeGreaterThan(0);

  const found = Array.isArray(recJson.results)
    ? recJson.results.find((r: any) => String(r?.doc_id || '') === docA.doc_id)
    : null;
  expect(found).toBeTruthy();
  expect(Array.isArray(found?.matches)).toBe(true);
  expect(found.matches.length).toBeGreaterThan(0);
  expect(String(found.matches[0]?.text || '')).toContain(token);
});


