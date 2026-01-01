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

test('live: standards ingest → map → export (real DB + real LLM)', async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const agentHeaders = {
    'Content-Type': 'application/json',
    'x-agent-token': AGENT_TOKEN,
    'x-organization-id': ORGANIZATION_ID,
  } as const;

  // ---------------------------------------------------------------------------
  // 1) Create an ingested material (needed for mapping)
  // ---------------------------------------------------------------------------
  const materialId = randomUUID();
  const materialFileName = `e2e-standards-material-${Date.now()}.txt`;
  const materialStoragePath = `${ORGANIZATION_ID}/${materialId}/upload/${materialFileName}`;
  const materialObjectPath = [ORGANIZATION_ID, materialId, 'upload', materialFileName].map(encodeURIComponent).join('/');

  const materialText = [
    'Heart Anatomy - Quick Notes',
    '',
    'The heart has four chambers: two atria and two ventricles.',
    'Blood flows from the right atrium to the right ventricle, to the lungs, back to the left atrium, then left ventricle, then to the aorta.',
    'Key terms: atria, ventricles, aorta, pulmonary circulation.',
  ].join('\n');

  const uploadMaterialResp = await request.post(`${SUPABASE_URL}/storage/v1/object/materials/${materialObjectPath}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'text/plain',
      'x-upsert': 'true',
    },
    data: materialText,
    timeout: 60_000,
  });
  expect(uploadMaterialResp.ok()).toBeTruthy();

  const saveMaterialResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
    headers: agentHeaders,
    data: {
      entity: 'library-material',
      values: {
        id: materialId,
        title: `E2E Material ${new Date().toISOString().slice(0, 19)}`,
        source: 'e2e',
        file_name: materialFileName,
        content_type: 'text/plain',
        storage_path: materialStoragePath,
        status: 'uploaded',
        analysis_summary: {},
      },
    },
    timeout: 60_000,
  });
  const saveMaterialJson = (await saveMaterialResp.json().catch(() => null)) as any;
  expect(saveMaterialResp.ok()).toBeTruthy();
  expect(saveMaterialJson?.ok).toBe(true);

  const enqMaterialResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: agentHeaders,
    data: {
      jobType: 'material_ingest',
      payload: {
        material_id: materialId,
        storage_bucket: 'materials',
        storage_path: materialStoragePath,
        file_name: materialFileName,
        content_type: 'text/plain',
      },
    },
    timeout: 60_000,
  });
  const enqMaterialJson = (await enqMaterialResp.json().catch(() => null)) as any;
  expect(enqMaterialResp.ok()).toBeTruthy();
  expect(enqMaterialJson?.ok).toBe(true);
  const materialIngestJobId = String(enqMaterialJson?.jobId || '').trim();
  expect(materialIngestJobId).toMatch(/[0-9a-f-]{36}/i);

  const runMaterialWorker = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(materialIngestJobId)}`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { worker: true, queue: 'agent', jobId: materialIngestJobId },
      timeout: 10 * 60_000,
    }
  );
  expect(runMaterialWorker.ok()).toBeTruthy();

  await poll({
    name: 'material_ingest done',
    timeoutMs: 6 * 60_000,
    intervalMs: 2000,
    fn: async () => {
      const r = await request.get(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(materialIngestJobId)}&includeEvents=true`, {
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

  // ---------------------------------------------------------------------------
  // 2) Upload + ingest standards document
  // ---------------------------------------------------------------------------
  const standardsDocumentId = randomUUID();
  const standardsFileName = `e2e-standards-${Date.now()}.txt`;
  const standardsStoragePath = `${ORGANIZATION_ID}/${standardsDocumentId}/upload/${standardsFileName}`;
  const standardsObjectPath = [ORGANIZATION_ID, standardsDocumentId, 'upload', standardsFileName].map(encodeURIComponent).join('/');

  const standardsText = [
    'S001: Explain the basic structure of the heart (atria and ventricles).',
    'S002: Describe the path of blood flow through the heart.',
    'S003: Identify the aorta and its role in systemic circulation.',
  ].join('\n');

  const uploadStandardsResp = await request.post(`${SUPABASE_URL}/storage/v1/object/materials/${standardsObjectPath}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'text/plain',
      'x-upsert': 'true',
    },
    data: standardsText,
    timeout: 60_000,
  });
  expect(uploadStandardsResp.ok()).toBeTruthy();

  const saveStdResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
    headers: agentHeaders,
    data: {
      entity: 'standards-document',
      values: {
        id: standardsDocumentId,
        title: `E2E Standards ${new Date().toISOString().slice(0, 19)}`,
        source: 'e2e',
        locale: 'en-US',
        file_name: standardsFileName,
        content_type: 'text/plain',
        storage_path: standardsStoragePath,
        status: 'uploaded',
        item_count: 0,
        items: [],
        ingest_summary: {},
      },
    },
    timeout: 60_000,
  });
  const saveStdJson = (await saveStdResp.json().catch(() => null)) as any;
  expect(saveStdResp.ok()).toBeTruthy();
  expect(saveStdJson?.ok).toBe(true);

  const enqStdResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: agentHeaders,
    data: {
      jobType: 'standards_ingest',
      payload: {
        standards_document_id: standardsDocumentId,
        storage_bucket: 'materials',
        storage_path: standardsStoragePath,
        file_name: standardsFileName,
        content_type: 'text/plain',
        locale: 'en-US',
      },
    },
    timeout: 60_000,
  });
  const enqStdJson = (await enqStdResp.json().catch(() => null)) as any;
  expect(enqStdResp.ok()).toBeTruthy();
  expect(enqStdJson?.ok).toBe(true);
  const standardsIngestJobId = String(enqStdJson?.jobId || '').trim();
  expect(standardsIngestJobId).toMatch(/[0-9a-f-]{36}/i);

  const runStandardsWorker = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(standardsIngestJobId)}`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { worker: true, queue: 'agent', jobId: standardsIngestJobId },
      timeout: 10 * 60_000,
    }
  );
  expect(runStandardsWorker.ok()).toBeTruthy();

  await poll({
    name: 'standards_ingest done',
    timeoutMs: 6 * 60_000,
    intervalMs: 2000,
    fn: async () => {
      const r = await request.get(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(standardsIngestJobId)}&includeEvents=true`, {
        headers: agentHeaders,
        timeout: 60_000,
      });
      if (!r.ok()) return null;
      const j = (await r.json().catch(() => null)) as any;
      const st = String(j?.job?.status || '').toLowerCase();
      if (st === 'done') return j;
      if (st === 'failed' || st === 'dead_letter' || st === 'stale') {
        throw new Error(`standards_ingest failed (status=${st}): ${String(j?.job?.error || 'unknown')}`);
      }
      return null;
    },
  });

  const stdRecordResp = await request.get(
    `${SUPABASE_URL}/functions/v1/get-record?entity=standards-document&id=${encodeURIComponent(standardsDocumentId)}`,
    { headers: agentHeaders, timeout: 60_000 }
  );
  expect(stdRecordResp.ok()).toBeTruthy();
  const stdRecordJson = (await stdRecordResp.json().catch(() => null)) as any;
  expect(String(stdRecordJson?.id)).toBe(standardsDocumentId);
  expect(String(stdRecordJson?.organization_id)).toBe(ORGANIZATION_ID);
  expect(String(stdRecordJson?.status || '')).toBe('ready');
  expect(Number(stdRecordJson?.item_count || 0)).toBeGreaterThan(0);

  // ---------------------------------------------------------------------------
  // 3) Map standards → material
  // ---------------------------------------------------------------------------
  const enqMapResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: agentHeaders,
    data: {
      jobType: 'standards_map',
      payload: {
        standards_document_id: standardsDocumentId,
        material_id: materialId,
        max_items: 10,
        top_k: 3,
      },
    },
    timeout: 60_000,
  });
  const enqMapJson = (await enqMapResp.json().catch(() => null)) as any;
  expect(enqMapResp.ok()).toBeTruthy();
  expect(enqMapJson?.ok).toBe(true);
  const mapJobId = String(enqMapJson?.jobId || '').trim();
  expect(mapJobId).toMatch(/[0-9a-f-]{36}/i);

  const runMapWorker = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(mapJobId)}`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { worker: true, queue: 'agent', jobId: mapJobId },
      timeout: 10 * 60_000,
    }
  );
  expect(runMapWorker.ok()).toBeTruthy();

  await poll({
    name: 'standards_map done',
    timeoutMs: 8 * 60_000,
    intervalMs: 2500,
    fn: async () => {
      const r = await request.get(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(mapJobId)}&includeEvents=true`, {
        headers: agentHeaders,
        timeout: 60_000,
      });
      if (!r.ok()) return null;
      const j = (await r.json().catch(() => null)) as any;
      const st = String(j?.job?.status || '').toLowerCase();
      if (st === 'done') return j;
      if (st === 'failed' || st === 'dead_letter' || st === 'stale') {
        throw new Error(`standards_map failed (status=${st}): ${String(j?.job?.error || 'unknown')}`);
      }
      return null;
    },
  });

  const mapRecordResp = await request.get(
    `${SUPABASE_URL}/functions/v1/get-record?entity=standards-mapping&id=${encodeURIComponent(mapJobId)}`,
    { headers: agentHeaders, timeout: 60_000 }
  );
  expect(mapRecordResp.ok()).toBeTruthy();
  const mapRecordJson = (await mapRecordResp.json().catch(() => null)) as any;
  expect(String(mapRecordJson?.id)).toBe(mapJobId);
  expect(String(mapRecordJson?.material_id)).toBe(materialId);
  expect(String(mapRecordJson?.standards_document_id)).toBe(standardsDocumentId);

  const mappingArtifactPath = mapRecordJson?.mapping?.artifact?.path as string | undefined;
  expect(typeof mappingArtifactPath).toBe('string');
  expect(String(mappingArtifactPath || '').length).toBeGreaterThan(5);

  const mappingArtifactObjectPath = String(mappingArtifactPath || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const mappingArtifactResp = await request.get(`${SUPABASE_URL}/storage/v1/object/materials/${mappingArtifactObjectPath}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Cache-Control': 'no-cache',
    },
    timeout: 60_000,
  });
  expect(mappingArtifactResp.ok()).toBeTruthy();
  const mappingArtifactJson = (await mappingArtifactResp.json().catch(() => null)) as any;
  expect(Array.isArray(mappingArtifactJson?.items)).toBe(true);
  expect(mappingArtifactJson.items.length).toBeGreaterThan(0);
  expect(Array.isArray(mappingArtifactJson.items[0]?.matches)).toBe(true);

  // ---------------------------------------------------------------------------
  // 4) Export mapping → CSV
  // ---------------------------------------------------------------------------
  const enqExportResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    headers: agentHeaders,
    data: {
      jobType: 'standards_export',
      payload: { mapping_id: mapJobId },
    },
    timeout: 60_000,
  });
  const enqExportJson = (await enqExportResp.json().catch(() => null)) as any;
  expect(enqExportResp.ok()).toBeTruthy();
  expect(enqExportJson?.ok).toBe(true);
  const exportJobId = String(enqExportJson?.jobId || '').trim();
  expect(exportJobId).toMatch(/[0-9a-f-]{36}/i);

  const runExportWorker = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(exportJobId)}`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { worker: true, queue: 'agent', jobId: exportJobId },
      timeout: 10 * 60_000,
    }
  );
  expect(runExportWorker.ok()).toBeTruthy();

  await poll({
    name: 'standards_export done',
    timeoutMs: 6 * 60_000,
    intervalMs: 2000,
    fn: async () => {
      const r = await request.get(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(exportJobId)}&includeEvents=true`, {
        headers: agentHeaders,
        timeout: 60_000,
      });
      if (!r.ok()) return null;
      const j = (await r.json().catch(() => null)) as any;
      const st = String(j?.job?.status || '').toLowerCase();
      if (st === 'done') return j;
      if (st === 'failed' || st === 'dead_letter' || st === 'stale') {
        throw new Error(`standards_export failed (status=${st}): ${String(j?.job?.error || 'unknown')}`);
      }
      return null;
    },
  });

  const mapRecordAfterResp = await request.get(
    `${SUPABASE_URL}/functions/v1/get-record?entity=standards-mapping&id=${encodeURIComponent(mapJobId)}`,
    { headers: agentHeaders, timeout: 60_000 }
  );
  expect(mapRecordAfterResp.ok()).toBeTruthy();
  const mapRecordAfterJson = (await mapRecordAfterResp.json().catch(() => null)) as any;
  const csvPath = mapRecordAfterJson?.export?.csv?.path as string | undefined;
  expect(typeof csvPath).toBe('string');
  expect(String(csvPath || '').length).toBeGreaterThan(5);

  const csvObjectPath = String(csvPath || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const csvResp = await request.get(`${SUPABASE_URL}/storage/v1/object/materials/${csvObjectPath}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'Cache-Control': 'no-cache',
    },
    timeout: 60_000,
  });
  expect(csvResp.ok()).toBeTruthy();
  const csvText = await csvResp.text();
  expect(csvText).toContain('mapping_id');
  expect(csvText).toContain(standardsDocumentId);
  expect(csvText).toContain(materialId);
  expect(csvText).toContain('S001');
});



