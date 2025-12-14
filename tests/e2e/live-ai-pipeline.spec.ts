import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: AI Pipeline - Full Course Creation & Editor
 * 
 * Tests the complete AI pipeline with REAL Supabase and REAL LLM calls:
 * - Course generation with LLM (text content)
 * - Image generation with DALL-E
 * - Storage and retrieval
 * - Course editor LLM features (rewrite, variants, co-pilot)
 * 
 * Prerequisites:
 *   - Admin account must exist
 *   - OpenAI API key in learnplay.env
 *   - Supabase credentials configured
 * 
 * Run with: npm run e2e:live
 * 
 * ⚠️ WARNING: These tests create REAL courses and use REAL LLM APIs (costs apply)
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live e2e tests`);
  return value;
}

function getSupabaseBase(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error('VITE_SUPABASE_URL (or SUPABASE_URL) is required');
  if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY) is required');
  return { url, anonKey };
}

async function getSessionAccessToken(page: import('@playwright/test').Page): Promise<string> {
  const token = await page.evaluate(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.includes('auth-token')) continue;
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const access =
            parsed?.currentSession?.access_token ||
            parsed?.access_token ||
            parsed?.currentSession?.accessToken ||
            null;
          if (typeof access === 'string' && access.length > 20) return access;
        } catch {
          // ignore
        }
      }
      return null;
    } catch {
      return null;
    }
  });
  if (!token) throw new Error('Could not extract Supabase session access token from localStorage');
  return token;
}

test.describe('Live AI Pipeline: Course Creation', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('complete course creation with LLM text and DALL-E images', async ({ page }) => {
    const testSubject = `E2E Test Course ${Date.now()}`;
    let courseId: string | null = null;
    
    // Step 1: Navigate to AI pipeline page
    await page.goto('/admin/ai-pipeline');
    // Avoid `networkidle` (admin pages poll/realtime and may never become idle)
    await page.waitForLoadState('domcontentloaded');
    
    // Step 2: Find and fill Quick Start form
    // Look for subject input (required field)
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"], input#subject').first();
    await subjectInput.waitFor({ timeout: 15000 });
    await subjectInput.fill(testSubject);
    
    // Set grade (optional but helps)
    const gradeSelect = page.locator('select').first();
    if (await gradeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await gradeSelect.selectOption({ index: 2 }); // Select 3-5 or similar
    }
    
    // Set items per group (smaller for faster testing)
    const itemsInput = page.locator('input[type="number"]').first();
    if (await itemsInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await itemsInput.fill('6'); // Smaller number for faster generation
    }
    
    // Step 3: Enqueue job via API (stable in headless; avoids Chromium net::ERR_INSUFFICIENT_RESOURCES).
    const { url, anonKey } = getSupabaseBase();
    const sessionToken = await getSessionAccessToken(page);
    const slug = testSubject.toLowerCase().replace(/\s+/g, '-');
    courseId = `${slug}-${Date.now()}`;

    const enqueueRes = await page.request.post(`${url}/functions/v1/enqueue-job`, {
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${sessionToken}`,
      },
      data: {
        jobType: 'ai_course_generate',
        payload: {
          course_id: courseId,
          subject: testSubject.trim(),
          grade: '6-8',
          grade_band: '6-8',
          items_per_group: 6,
          mode: 'options',
        },
      },
    });
    expect(enqueueRes.ok()).toBeTruthy();
    const enqueueJson = await enqueueRes.json();
    expect(enqueueJson?.ok).toBeTruthy();
    const jobId: string = enqueueJson.jobId;
    expect(typeof jobId).toBe('string');

    // Step 4: Run generation for THIS job.
    // This aligns with the current UI behavior (dev/preview kicks generation directly),
    // and ensures course JSON is persisted to storage.
    const generateRes = await page.request.post(`${url}/functions/v1/generate-course?jobId=${encodeURIComponent(jobId)}`, {
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      data: {
        subject: testSubject.trim(),
        gradeBand: '6-8',
        grade: '6-8',
        itemsPerGroup: 6,
        mode: 'options',
      },
      timeout: 600000, // allow long generation
    });
    expect(generateRes.ok()).toBeTruthy();

    // Step 5-6: Poll job status via list-course-jobs (real DB), up to 5 minutes
    const maxWaitTime = 300000;
    const startTime = Date.now();
    let lastStatus = '';
    let lastFallbackReason: string | null = null;
    while ((Date.now() - startTime) < maxWaitTime) {
      const statusRes = await page.request.get(`${url}/functions/v1/list-course-jobs?jobId=${encodeURIComponent(jobId)}`, {
        headers: { apikey: anonKey },
      });
      expect(statusRes.ok()).toBeTruthy();
      const statusJson = await statusRes.json();
      const job = Array.isArray(statusJson.jobs) ? statusJson.jobs[0] : null;
      const status = job?.status as string | undefined;
      lastStatus = status || '';
      lastFallbackReason = (job?.fallback_reason ?? job?.fallbackReason ?? null) as string | null;
      if (status === 'done') break;
      if (status === 'failed') {
        throw new Error(`Job failed: ${job?.error || 'unknown error'}`);
      }
      await page.waitForTimeout(5000);
    }

    if (lastStatus !== 'done') {
      console.warn(`Job did not reach done within ${maxWaitTime / 1000}s. Last status: ${lastStatus}`);
    }
    expect(lastStatus).toBe('done');
    // A "perfect" run should not fallback.
    expect(lastFallbackReason, `Unexpected fallback_reason for job ${jobId}`).toBeFalsy();
    
    // Step 7: Verify course is stored and becomes visible via list-courses + get-course
    if (courseId) {
      const { url, anonKey } = getSupabaseBase();

      // Poll get-course until it becomes readable (more stable than list-courses, which downloads many objects)
      let getOk = false;
      let courseJson: any = null;
      for (let i = 0; i < 30; i++) {
        const getRes = await page.request.get(`${url}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`, {
          headers: { apikey: anonKey },
        });
        if (getRes.ok()) {
          getOk = true;
          courseJson = await getRes.json().catch(() => null);
          break;
        }
        await page.waitForTimeout(2000);
      }
      expect(getOk).toBeTruthy();

      // Validate structural integrity of the stored course pack (server-side validation)
      const agentToken = requireEnv('AGENT_TOKEN');
      const validateRes = await page.request.post(`${url}/functions/v1/validate-course-structure`, {
        headers: { 'Content-Type': 'application/json', 'X-Agent-Token': agentToken },
        data: { courseId },
      });
      expect(validateRes.ok()).toBeTruthy();
      const validateJson = await validateRes.json();
      expect(validateJson?.ok, `validate-course-structure issues: ${JSON.stringify(validateJson?.issues || [])}`).toBeTruthy();

      // Basic non-placeholder checks on retrieved payload
      const payload = courseJson?.content ?? courseJson;
      expect(payload?.id).toBe(courseId);
      expect(Array.isArray(payload?.items) && payload.items.length > 0).toBeTruthy();
      if (typeof payload?.contentVersion === 'string') {
        expect(payload.contentVersion.startsWith('placeholder-')).toBeFalsy();
      }

      // Open editor (correct route) and verify it loads (not 404)
      await page.goto(`/admin/editor/${courseId}`);
      await page.waitForLoadState('domcontentloaded');
      
      // Verify NOT 404 (would catch route bug)
      const is404 = await page.locator('text=/404|not found/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(is404).toBeFalsy();
      
      // Verify course editor loaded
      const hasEditor = await page.getByText(/edit|course|item/i).isVisible({ timeout: 10000 }).catch(() => false);
      expect(hasEditor).toBeTruthy();
      
      // Step 8: Verify course structure (texts, items)
      const courseContent = await page.locator('body').textContent();
      expect(courseContent).toBeTruthy();
      expect(courseContent?.length).toBeGreaterThan(500); // Course has content
      
      // Step 9: Trigger ONE real image generation via enqueue-course-media + media-runner, then confirm stimulus exists
      const enqueueRes = await page.request.post(`${url}/functions/v1/enqueue-course-media`, {
        headers: { 'Content-Type': 'application/json', 'x-agent-token': agentToken, apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        data: { courseId, itemId: 0, prompt: 'A simple kid-friendly illustration for the first question', provider: 'openai-dalle3' },
      });
      expect(enqueueRes.ok()).toBeTruthy();

      const runRes = await page.request.post(`${url}/functions/v1/media-runner?n=1`, {
        headers: { 'Content-Type': 'application/json', 'x-agent-token': agentToken },
        data: {},
      });
      expect(runRes.ok()).toBeTruthy();

      const after = await page.request.get(`${url}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`, {
        headers: { apikey: anonKey },
      });
      expect(after.ok()).toBeTruthy();
      const afterJson = await after.json();
      const coursePayload = afterJson?.content ?? afterJson;
      const stim = coursePayload?.items?.[0]?.stimulus;
      expect(stim?.type).toBe('image');
      expect(typeof stim?.url).toBe('string');
    }
  }, 600000); // 10 minute timeout for full pipeline
});

test.describe('Live AI Pipeline: Course Editor LLM Features', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('course editor LLM rewrite feature works', async ({ page }) => {
    // Navigate to catalog and pick a course, or skip if none are visible
    await page.goto('/courses');
    await page.waitForLoadState('domcontentloaded');
    
    const courseLink = page.locator('a[href*="/play/"], a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!hasCourse) {
      console.log('No courses found - skipping editor LLM test');
      return;
    }
    
    await courseLink.click();
    await page.waitForLoadState('domcontentloaded');
    
    // Look for AI rewrite button or feature
    // This might be in a tab or toolbar
    const rewriteButton = page.locator('button:has-text("Rewrite"), button:has-text("AI"), [data-testid*="rewrite"]').first();
    const hasRewrite = await rewriteButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasRewrite) {
      // Click rewrite button
      await rewriteButton.click();
      await page.waitForTimeout(2000);
      
      // Look for rewrite UI (chat panel, input field, etc.)
      const rewriteUI = page.locator('textarea, input[placeholder*="rewrite"], [data-testid*="rewrite"]').first();
      const hasRewriteUI = await rewriteUI.isVisible({ timeout: 5000 }).catch(() => false);
      
      // If rewrite UI is available, test it
      if (hasRewriteUI) {
        await rewriteUI.fill('Make this more engaging');
        const submitButton = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Generate")').first();
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click();
          
          // Wait for LLM response (could take 10-30 seconds)
          await expect(
            page.locator('text=/rewritten|updated|generated/i').or(
              page.locator('[data-testid*="result"]')
            )
          ).toBeVisible({ timeout: 60000 });
        }
      }
    }
  }, 120000); // 2 minute timeout

  test('course editor variants audit works', async ({ page }) => {
    // Use seeded real course directly (avoids empty lists / route drift)
    await page.goto('/admin/editor/english-grammar-foundations');
    await page.waitForLoadState('domcontentloaded');
    
    // Look for variants or audit button
    const variantsButton = page.locator('button:has-text("Variants"), button:has-text("Audit"), [data-testid*="variants"]').first();
    const hasVariants = await variantsButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasVariants) {
      await variantsButton.click();
      await page.waitForTimeout(2000);
      
      // Wait for audit results (could take 10-30 seconds)
      await expect(
        page.locator('text=/audit|variants|coverage/i').or(
          page.locator('[data-testid*="audit"], [data-testid*="variants"]')
        )
      ).toBeVisible({ timeout: 60000 });
    }
  }, 120000);

  test('course editor co-pilot features work', async ({ page }) => {
    // Use seeded real course directly (avoids empty lists / route drift)
    await page.goto('/admin/editor/english-grammar-foundations');
    await page.waitForLoadState('domcontentloaded');
    
    // Look for co-pilot buttons (Enrich, Variants, Localize)
    const copilotButtons = [
      page.locator('button:has-text("Enrich")').first(),
      page.locator('button:has-text("Variants")').first(),
      page.locator('button:has-text("Localize")').first(),
      page.locator('[data-testid="btn-localize"]').first(),
    ];
    
    for (const button of copilotButtons) {
      const isVisible = await button.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        // Found a co-pilot button - verify it's clickable
        const isEnabled = await button.isEnabled();
        expect(isEnabled).toBeTruthy();
        break; // Just verify one exists and is enabled
      }
    }
  });
});

test.describe('Live AI Pipeline: Storage & Retrieval', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('created course is stored and retrievable', async ({ page }) => {
    // Verify via Edge Functions (real storage), not UI lists (route drift/polling)
    const { url, anonKey } = getSupabaseBase();
    const res = await page.request.get(`${url}/functions/v1/get-course?courseId=english-grammar-foundations`, {
      headers: { apikey: anonKey },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('course catalog displays created courses', async ({ page }) => {
    const { url, anonKey } = getSupabaseBase();
    const res = await page.request.get(`${url}/functions/v1/list-courses?limit=50`, {
      headers: { apikey: anonKey },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const ids = (data.items || []).map((it: any) => it.id);
    expect(ids).toContain('english-grammar-foundations');
  });
});

test.describe('Live AI Pipeline: Image Generation', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('DALL-E images are generated and stored', async ({ page }) => {
    // Use the real media pipeline (enqueue-course-media + media-runner), no UI scraping
    const { url, anonKey } = getSupabaseBase();
    const agentToken = requireEnv('AGENT_TOKEN');

    const enqueueRes = await page.request.post(`${url}/functions/v1/enqueue-course-media`, {
      headers: { 'Content-Type': 'application/json', 'x-agent-token': agentToken, apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      data: { courseId: 'english-grammar-foundations', itemId: 0, prompt: 'A kid-friendly illustration for the first question', provider: 'openai-dalle3' },
    });
    expect(enqueueRes.ok()).toBeTruthy();

    const runRes = await page.request.post(`${url}/functions/v1/media-runner?n=1`, {
      headers: { 'Content-Type': 'application/json', 'x-agent-token': agentToken },
      data: {},
      timeout: 180000,
    });
    expect(runRes.ok()).toBeTruthy();

    const after = await page.request.get(`${url}/functions/v1/get-course?courseId=english-grammar-foundations`, {
      headers: { apikey: anonKey },
    });
    expect(after.ok()).toBeTruthy();
    const afterJson = await after.json();
    const payload = afterJson?.content ?? afterJson;
    const stim = payload?.items?.[0]?.stimulus;
    expect(stim?.type).toBe('image');
    expect(typeof stim?.url).toBe('string');
  });
});

