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

test('live: option image should fit the option tile (real DB + real LLM, no mocks)', async ({ page, request, baseURL }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv('SUPABASE_URL');
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || requireEnv('SUPABASE_ANON_KEY');
  const AGENT_TOKEN = requireEnv('AGENT_TOKEN');
  const ORGANIZATION_ID = requireEnv('ORGANIZATION_ID');

  const courseId = `e2e-option-images-${Date.now()}`;
  const subject = `Option Images E2E ${new Date().toISOString().slice(0, 19)}`;

  // Keep notes free of the word "images" to avoid triggering study-text image enqueue logic.
  const notes = 'E2E run: keep the course simple and concrete. Use 3-4 short answer choices.';

  // 1) Generate a real course (real DB + real LLM)
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
  console.log(`[live-e2e] queued jobId=${jobId} courseId=${courseId}`);

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

  const courseContent = await poll<any>({
    name: 'course.json persisted',
    timeoutMs: 6 * 60_000,
    intervalMs: 2500,
    fn: async () => {
      const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
      const r = await request.get(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok()) return null;
      const j = await r.json().catch(() => null);
      if (!j) return null;
      const content = (j && typeof j === 'object' && 'content' in j && 'format' in j) ? (j as any).content : j;
      const items = Array.isArray((content as any)?.items) ? (content as any).items : [];
      if (!items.length) return null;
      return content;
    },
  });

  const items: any[] = Array.isArray(courseContent?.items) ? courseContent.items : [];
  expect(items.length).toBeGreaterThanOrEqual(1);

  // 2) Generate real option images (real LLM/media provider) and persist into optionMedia
  const updatedItems = items.map((it) => ({ ...it }));
  const itemCountToDecorate = Math.min(updatedItems.length, 3); // keep cost bounded

  for (let i = 0; i < itemCountToDecorate; i++) {
    const it = updatedItems[i];
    const options: string[] = Array.isArray(it?.options) ? it.options.map(String) : [];
    if (options.length < 2) continue;

    const optionIndex = 0;
    const optionText = options[optionIndex] || 'answer choice';
    const stem = String(it?.stem?.text || it?.text || '').replace(/<[^>]*>/g, '').slice(0, 140);

    const prompt = [
      `Educational illustration for kids.`,
      `Question context: ${stem || 'multiple choice question'}.`,
      `This answer choice: ${optionText}.`,
      `Style: simple, colorful, realistic illustration or photo.`,
      `IMPORTANT: No text, letters, numbers, labels, watermarks, logos.`,
    ].join(' ');

    const genResp = await request.post(`${SUPABASE_URL}/functions/v1/ai-generate-media`, {
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': AGENT_TOKEN,
        'x-organization-id': ORGANIZATION_ID,
      },
      data: {
        prompt,
        kind: 'image',
        options: { size: '1024x1024', quality: 'standard' },
      },
      timeout: 10 * 60_000,
    });
    const genJson = (await genResp.json().catch(() => null)) as any;

    // ai-generate-media returns either { ok:false, error } or a GeneratedMedia object.
    if (genJson && typeof genJson === 'object' && genJson.ok === false) {
      const msg = genJson?.error?.message || genJson?.error || 'ai-generate-media failed';
      throw new Error(`ai-generate-media failed: ${String(msg)}`);
    }

    expect(genResp.ok()).toBeTruthy();
    expect(typeof genJson?.url).toBe('string');

    const optMedia = Array.isArray(it?.optionMedia) ? [...it.optionMedia] : [];
    optMedia[optionIndex] = {
      type: 'image',
      url: String(genJson.url),
      alt: typeof genJson?.alt === 'string' ? genJson.alt : `Option ${optionIndex + 1} image`,
      width: typeof genJson?.width === 'number' ? genJson.width : undefined,
      height: typeof genJson?.height === 'number' ? genJson.height : undefined,
      mediaLayout: 'full',
      fitMode: 'cover',
    };
    it.optionMedia = optMedia;
  }

  const updatedCourse = {
    ...courseContent,
    items: updatedItems,
  };

  const saveResp = await request.post(`${SUPABASE_URL}/functions/v1/save-course-json`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    data: {
      courseId,
      content: updatedCourse,
    },
    timeout: 60_000,
  });
  const saveJson = (await saveResp.json().catch(() => null)) as any;
  expect(saveResp.ok()).toBeTruthy();
  expect(saveJson?.ok).toBe(true);

  // 3) Open the real UI and assert the option image fills the tile
  expect(baseURL).toBeTruthy();
  await page.goto(`/play/${courseId}/welcome`, { waitUntil: 'domcontentloaded' });

  // Some builds auto-start the round; others show an explicit Start/Begin CTA.
  const startBtn = page.getByRole('button', { name: /^Start$/ }).first();
  if (await startBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await startBtn.click();
  }

  const optionGroup = page.getByRole('group', { name: 'Answer options' });
  await expect(optionGroup).toBeVisible({ timeout: 120_000 });

  const img = optionGroup.locator('img.object-cover').first();
  await expect(img).toBeVisible({ timeout: 120_000 });

  // Wait until the image is fully loaded so geometry is stable.
  await page.waitForFunction(
    (el) => {
      const img = el as HTMLImageElement;
      return !!img && img.complete && img.naturalWidth > 0;
    },
    await img.elementHandle(),
    { timeout: 120_000 }
  );

  const metrics = await img.evaluate((imgEl) => {
    const img = imgEl as HTMLImageElement;
    const button = img.closest('button');
    if (!button) return null;

    const imgRect = img.getBoundingClientRect();
    const btnRect = button.getBoundingClientRect();
    const btnStyle = window.getComputedStyle(button);
    const imgStyle = window.getComputedStyle(img);

    const borderLeft = parseFloat(btnStyle.borderLeftWidth || '0') || 0;
    const borderTop = parseFloat(btnStyle.borderTopWidth || '0') || 0;
    const borderRight = parseFloat(btnStyle.borderRightWidth || '0') || 0;
    const borderBottom = parseFloat(btnStyle.borderBottomWidth || '0') || 0;

    const inner = {
      left: btnRect.left + borderLeft,
      top: btnRect.top + borderTop,
      width: btnRect.width - borderLeft - borderRight,
      height: btnRect.height - borderTop - borderBottom,
    };

    return {
      img: { left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height },
      inner,
      styles: {
        objectFit: imgStyle.objectFit,
        position: imgStyle.position,
        top: imgStyle.top,
        right: imgStyle.right,
        bottom: imgStyle.bottom,
        left: imgStyle.left,
        overflow: btnStyle.overflow,
      },
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.styles.objectFit).toBe('cover');
  expect(metrics!.styles.position).toBe('absolute');
  expect(metrics!.styles.overflow).toBe('hidden');

  const tol = 2; // allow minor rounding/border differences
  expect(Math.abs(metrics!.img.left - metrics!.inner.left)).toBeLessThanOrEqual(tol);
  expect(Math.abs(metrics!.img.top - metrics!.inner.top)).toBeLessThanOrEqual(tol);
  expect(Math.abs(metrics!.img.width - metrics!.inner.width)).toBeLessThanOrEqual(tol);
  expect(Math.abs(metrics!.img.height - metrics!.inner.height)).toBeLessThanOrEqual(tol);
});


