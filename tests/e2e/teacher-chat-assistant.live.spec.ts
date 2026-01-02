import { test, expect } from '@playwright/test';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { randomUUID } from 'crypto';

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
  while (Date.now() - start < args.timeoutMs) {
    const res = await args.fn();
    if (res !== null) return res;
    await sleep(args.intervalMs);
  }
  throw new Error(`Timed out waiting for ${args.name} after ${args.timeoutMs}ms`);
}

test('live: teacher-chat-assistant (real DB + real LLM, grounded citations)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const agentHeaders = {
    'Content-Type': 'application/json',
    'x-agent-token': AGENT_TOKEN,
    'x-organization-id': ORGANIZATION_ID,
  } as const;

  const materialId = randomUUID();
  const token = `CHAT_E2E_TOKEN_${randomUUID()}`;
  const fileName = `e2e-chat-material-${Date.now()}.txt`;
  const storagePath = `${ORGANIZATION_ID}/${materialId}/upload/${fileName}`;
  const objectPath = [ORGANIZATION_ID, materialId, 'upload', fileName].map(encodeURIComponent).join('/');

  const sampleText = [
    'Clinical Notes: Heart Anatomy',
    '',
    `UniqueToken: ${token}`,
    '',
    'The heart has four chambers: two atria and two ventricles.',
    'Blood flows RA → RV → lungs → LA → LV → aorta.',
  ].join('\n');

  // 0) Upload material into private bucket (service role)
  const uploadResp = await request.post(`${SUPABASE_URL}/storage/v1/object/materials/${objectPath}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'text/plain',
      'x-upsert': 'true',
    },
    data: sampleText,
    timeout: 60_000,
  });
  expect(uploadResp.ok()).toBeTruthy();

  // 1) Save record
  const saveResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
    headers: agentHeaders,
    data: {
      entity: 'library-material',
      values: {
        id: materialId,
        title: `E2E Chat Material ${new Date().toISOString().slice(0, 19)}`,
        source: 'e2e',
        file_name: fileName,
        content_type: 'text/plain',
        storage_bucket: 'materials',
        storage_path: storagePath,
        status: 'uploaded',
        analysis_summary: {},
      },
    },
    timeout: 60_000,
  });
  const saveJson = (await saveResp.json().catch(() => null)) as any;
  expect(saveResp.ok()).toBeTruthy();
  expect(saveJson?.ok).toBe(true);

  // 2) Enqueue ingest job
  const ingestEnqResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: agentHeaders,
    data: {
      jobType: 'material_ingest',
      payload: {
        material_id: materialId,
        storage_bucket: 'materials',
        storage_path: storagePath,
        file_name: fileName,
        content_type: 'text/plain',
      },
    },
    timeout: 60_000,
  });
  const ingestEnqJson = (await ingestEnqResp.json().catch(() => null)) as any;
  expect(ingestEnqResp.ok()).toBeTruthy();
  expect(ingestEnqJson?.ok).toBe(true);
  const ingestJobId = String(ingestEnqJson?.jobId || '').trim();
  expect(ingestJobId).toMatch(/[0-9a-f-]{36}/i);

  // 3) Run worker (targeted)
  const workerIngestResp = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(ingestJobId)}`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { worker: true, queue: 'agent', jobId: ingestJobId },
      timeout: 10 * 60_000,
    }
  );
  expect(workerIngestResp.ok()).toBeTruthy();

  // 4) Poll for ingest completion
  await poll({
    name: 'material_ingest done',
    timeoutMs: 6 * 60_000,
    intervalMs: 2000,
    fn: async () => {
      const r = await request.get(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(ingestJobId)}&includeEvents=true`, {
        headers: agentHeaders,
        timeout: 60_000,
      });
      if (!r.ok()) return null;
      const j = (await r.json().catch(() => null)) as any;
      const st = String(j?.job?.status || '').toLowerCase();
      if (st === 'done') return j;
      if (st === 'failed' || st === 'dead_letter' || st === 'stale') {
        throw new Error(`material_ingest failed (status=${st}): ${String(j?.job?.error || 'unknown')}`);
      }
      return null;
    },
  });

  // 5) Chat (agent auth is allowed for tests/ops; chat function enforces teacher/admin only for user auth)
  const chatResp = await request.post(`${SUPABASE_URL}/functions/v1/teacher-chat-assistant`, {
    headers: agentHeaders,
    data: {
      scope: 'materials',
      materialId,
      messages: [{ role: 'user', content: `What is the unique token? ${token}` }],
    },
    timeout: 120_000,
  });
  expect(chatResp.ok()).toBeTruthy();
  const chatJson = (await chatResp.json().catch(() => null)) as any;
  expect(chatJson?.ok).toBe(true);
  expect(typeof chatJson?.answer).toBe('string');
  expect(String(chatJson.answer || '').length).toBeGreaterThan(20);
  expect(Array.isArray(chatJson?.citations)).toBe(true);
  expect(chatJson.citations.length).toBeGreaterThan(0);
  expect(String(chatJson.citations[0]?.course_id || '')).toContain(`material:${materialId}`);
  expect(String(chatJson.citations[0]?.text || '')).toContain(token);
});


