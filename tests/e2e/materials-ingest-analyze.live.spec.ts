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

test('live: materials upload → ingest → analyze (real DB + real LLM)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const materialId = randomUUID();
  const fileName = `e2e-material-${Date.now()}.txt`;
  const storagePath = `${ORGANIZATION_ID}/${materialId}/upload/${fileName}`;
  const storageObjectPath = [ORGANIZATION_ID, materialId, 'upload', fileName].map(encodeURIComponent).join('/');

  const sampleText = [
    'Heart Anatomy: Overview',
    '',
    'The heart is a muscular organ that pumps blood throughout the body.',
    'Key concepts:',
    '- Atria: upper chambers that receive blood.',
    '- Ventricles: lower chambers that pump blood out.',
    '- Aorta: main artery carrying blood from the heart.',
    '',
    'Procedure: Blood flow through the heart',
    '1) Deoxygenated blood enters the right atrium.',
    '2) Blood flows into the right ventricle.',
    '3) Right ventricle pumps blood to the lungs.',
    '4) Oxygenated blood returns to the left atrium.',
    '5) Blood flows into the left ventricle.',
    '6) Left ventricle pumps blood to the aorta.',
    '',
    'Important: Always check for signs of circulatory distress.',
  ].join('\n');

  // 0) Upload the raw material file into the private materials bucket (service role).
  const uploadResp = await request.post(`${SUPABASE_URL}/storage/v1/object/materials/${storageObjectPath}`, {
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

  const agentHeaders = {
    'Content-Type': 'application/json',
    'x-agent-token': AGENT_TOKEN,
    'x-organization-id': ORGANIZATION_ID,
  } as const;

  // 1) Create/Upsert the library-material record (manifest entity record).
  const saveResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
    headers: agentHeaders,
    data: {
      entity: 'library-material',
      values: {
        id: materialId,
        title: `E2E Material ${new Date().toISOString().slice(0, 19)}`,
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
    timeoutMs: 5 * 60_000,
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

  // 5) Enqueue analyze job
  const analyzeEnqResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: agentHeaders,
    data: {
      jobType: 'material_analyze',
      payload: { material_id: materialId },
    },
    timeout: 60_000,
  });
  const analyzeEnqJson = (await analyzeEnqResp.json().catch(() => null)) as any;
  expect(analyzeEnqResp.ok()).toBeTruthy();
  expect(analyzeEnqJson?.ok).toBe(true);
  const analyzeJobId = String(analyzeEnqJson?.jobId || '').trim();
  expect(analyzeJobId).toMatch(/[0-9a-f-]{36}/i);

  // 6) Run worker (targeted)
  const workerAnalyzeResp = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(analyzeJobId)}`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { worker: true, queue: 'agent', jobId: analyzeJobId },
      timeout: 10 * 60_000,
    }
  );
  expect(workerAnalyzeResp.ok()).toBeTruthy();

  // 7) Poll for analyze completion
  await poll({
    name: 'material_analyze done',
    timeoutMs: 8 * 60_000,
    intervalMs: 2500,
    fn: async () => {
      const r = await request.get(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(analyzeJobId)}&includeEvents=true`, {
        headers: agentHeaders,
        timeout: 60_000,
      });
      if (!r.ok()) return null;
      const j = (await r.json().catch(() => null)) as any;
      const st = String(j?.job?.status || '').toLowerCase();
      if (st === 'done') return j;
      if (st === 'failed' || st === 'dead_letter' || st === 'stale') {
        throw new Error(`material_analyze failed (status=${st}): ${String(j?.job?.error || 'unknown')}`);
      }
      return null;
    },
  });

  // 8) Verify the record is updated (status=ready + analysis present)
  const recordResp = await request.get(
    `${SUPABASE_URL}/functions/v1/get-record?entity=library-material&id=${encodeURIComponent(materialId)}`,
    { headers: agentHeaders, timeout: 60_000 }
  );
  expect(recordResp.ok()).toBeTruthy();
  const recordJson = (await recordResp.json().catch(() => null)) as any;
  expect(String(recordJson?.id)).toBe(materialId);
  expect(String(recordJson?.organization_id)).toBe(ORGANIZATION_ID);
  expect(String(recordJson?.status || '')).toBe('ready');

  const analysis = recordJson?.analysis_summary?.analysis;
  expect(analysis).toBeTruthy();
  expect(typeof analysis?.summary).toBe('string');
  expect(String(analysis?.summary || '').length).toBeGreaterThan(20);
  expect(Array.isArray(analysis?.key_concepts)).toBe(true);
  expect(Array.isArray(analysis?.suggested_assignments)).toBe(true);

  // 9) Verify extracted artifact exists in Storage (service role)
  const extractedPath = recordJson?.analysis_summary?.ingest?.extracted?.path as string | undefined;
  expect(typeof extractedPath).toBe('string');
  expect(String(extractedPath || '').length).toBeGreaterThan(5);

  const extractedObjectPath = extractedPath
    .split('/')
    .map((seg: string) => encodeURIComponent(seg))
    .join('/');
  const extractedGet = await request.get(`${SUPABASE_URL}/storage/v1/object/materials/${extractedObjectPath}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Cache-Control': 'no-cache',
    },
    timeout: 60_000,
  });
  expect(extractedGet.ok()).toBeTruthy();
  const extractedText = await extractedGet.text();
  expect(extractedText).toContain('Heart');

  // 10) Verify embeddings were stored in content_embeddings for this material key
  const materialKey = `material:${materialId}`;
  const embQuery =
    `${SUPABASE_URL}/rest/v1/content_embeddings` +
    `?select=id,course_id,content_type` +
    `&organization_id=eq.${encodeURIComponent(ORGANIZATION_ID)}` +
    `&course_id=eq.${encodeURIComponent(materialKey)}` +
    `&content_type=eq.reference`;

  const embResp = await request.get(embQuery, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Accept: 'application/json',
    },
    timeout: 60_000,
  });
  expect(embResp.ok()).toBeTruthy();
  const embJson = (await embResp.json().catch(() => null)) as any;
  expect(Array.isArray(embJson)).toBe(true);
  expect(embJson.length).toBeGreaterThan(0);
});



