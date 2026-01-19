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

test.describe('live UI: TeacherGPT chat', () => {
  test.use({ storageState: 'playwright/.auth/teacher.json' });

  test('loads chat page and renders lesson plan + KD-check + sources (data-cta-id locators)', async ({ page, request }) => {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
    const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

    const agentHeaders = {
      'Content-Type': 'application/json',
      'x-agent-token': AGENT_TOKEN,
      'x-organization-id': ORGANIZATION_ID,
    } as const;

    // Seed a material + ingest so chat has something to retrieve.
    const materialId = randomUUID();
    const token = `CHAT_UI_TOKEN_${randomUUID()}`;
    const fileName = `e2e-chat-ui-${Date.now()}.txt`;
    const storagePath = `${ORGANIZATION_ID}/${materialId}/upload/${fileName}`;
    const objectPath = [ORGANIZATION_ID, materialId, 'upload', fileName].map(encodeURIComponent).join('/');

    const sampleText = [
      'TeacherGPT UI Test Material',
      `UniqueToken: ${token}`,
      '',
      'SBAR stands for Situation, Background, Assessment, Recommendation.',
      'Use SBAR to structure professional communication during patient handover.',
    ].join('\n');

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

    const saveResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
      headers: agentHeaders,
      data: {
        entity: 'library-material',
        values: {
          id: materialId,
          title: `E2E Chat UI Material ${new Date().toISOString().slice(0, 19)}`,
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

    const enqIngest = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
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
    const enqJson = (await enqIngest.json().catch(() => null)) as any;
    expect(enqIngest.ok()).toBeTruthy();
    expect(enqJson?.ok).toBe(true);
    const ingestJobId = String(enqJson?.jobId || '').trim();
    expect(ingestJobId).toMatch(/[0-9a-f-]{36}/i);

    const worker = await request.post(
      `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(ingestJobId)}`,
      { headers: { 'Content-Type': 'application/json' }, data: { worker: true, queue: 'agent', jobId: ingestJobId }, timeout: 10 * 60_000 }
    );
    expect(worker.ok()).toBeTruthy();

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

    // UI: open TeacherGPT chat
    await page.goto('/teacher/teachergpt/chat');
    await page.waitForLoadState('domcontentloaded');

    // Tabs exist
    await expect(page.locator('[data-cta-id="cta-teachergpt-chat-tab-lesplan"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-teachergpt-chat-tab-materials"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-teachergpt-chat-tab-sources"]')).toBeVisible();

    // Suggestion chip fills prompt
    await page.locator('[data-cta-id="cta-teachergpt-chat-suggestion-b1-k2-w2"]').click();
    await expect(page.locator('[data-cta-id="cta-teachergpt-chat-input"]')).toHaveValue(/B1-K2-W2/i);

    // Send
    await page.locator('[data-cta-id="cta-teachergpt-chat-send"]').click();
    await expect(page.getByText('Ik heb een lesplan opgesteld')).toBeVisible({ timeout: 180_000 });

    // Lesplan tab shows KD-check items + save button
    await expect(page.getByText(/Lesplan \(KD/i)).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/SBAR-structuur/i)).toBeVisible({ timeout: 180_000 });
    await expect(page.locator('[data-cta-id="cta-teachergpt-chat-kdcheck-save"]')).toBeVisible({ timeout: 180_000 });

    // Materialen tab shows at least one recommendation action
    await page.locator('[data-cta-id="cta-teachergpt-chat-tab-materials"]').click();
    await expect(page.locator('[data-cta-id="cta-teachergpt-chat-recommendation-use"]').first()).toBeVisible({ timeout: 180_000 });

    // Bronnen tab shows at least one citation card
    await page.locator('[data-cta-id="cta-teachergpt-chat-tab-sources"]').click();
    await expect(page.getByText(/chunk\s+\d+/i).first()).toBeVisible({ timeout: 180_000 });
  });
});


