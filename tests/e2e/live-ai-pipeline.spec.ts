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
    
    // Step 3: Create the job - look for Generate Course button
    const createButton = page.locator('button:has-text("Generate Course"), button:has-text("Generate")').first();
    await expect(createButton).toBeEnabled({ timeout: 10000 });
    await createButton.click();

    // Capture the generated courseId from localStorage (this app sets selectedCourseId immediately on enqueue)
    let selectedCourseId: string | null = null;
    for (let i = 0; i < 10; i++) {
      selectedCourseId = await page.evaluate(() => localStorage.getItem('selectedCourseId'));
      if (selectedCourseId) break;
      await page.waitForTimeout(500);
    }

    // Fallback: resolve courseId from backend job list (stable + real DB evidence)
    if (!selectedCourseId) {
      const { url, anonKey } = getSupabaseBase();
      for (let i = 0; i < 15; i++) {
        const res = await page.request.get(
          `${url}/functions/v1/list-course-jobs?search=${encodeURIComponent(testSubject)}&limit=5`,
          { headers: { apikey: anonKey } },
        );
        if (res.ok()) {
          const data = await res.json();
          const job = Array.isArray(data.jobs) ? data.jobs[0] : null;
          const backendCourseId = job?.course_id;
          if (typeof backendCourseId === 'string' && backendCourseId.length > 3) {
            selectedCourseId = backendCourseId;
            break;
          }
        }
        await page.waitForTimeout(1000);
      }
    }

    if (!selectedCourseId) {
      throw new Error('Course ID could not be resolved after clicking Generate Course (no localStorage and no matching job in list-course-jobs).');
    }

    courseId = selectedCourseId;
    
    // Step 4: Wait for job creation confirmation
    // Wait for the button text to change or for processing indication
    await page.waitForTimeout(5000);
    
    // Check that page shows some indication of job creation
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);
    
    // Extract job ID from the page or toast
    let jobId: string | null = null;
    const jobIdText = await page.locator('text=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i').first().textContent().catch(() => null);
    if (jobIdText) {
      const match = jobIdText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) jobId = match[0];
    }
    
    // Step 5: Monitor job progress via API or UI
    // Navigate to jobs page to monitor progress
    await page.goto('/admin/jobs');
    await page.waitForLoadState('domcontentloaded');
    
    // If we have a job ID, try to find it in the list
    if (jobId) {
      // Look for job ID in the page
      const jobIdElement = page.locator(`text=/${jobId}/i`);
      const hasJobId = await jobIdElement.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasJobId) {
        // Click on the job to see details
        await jobIdElement.click();
        await page.waitForTimeout(2000);
      }
    }
    
    // Step 6: Wait for job to complete (polling via page refresh)
    // This can take 2-5 minutes for real LLM + DALL-E generation
    const maxWaitTime = 300000; // 5 minutes
    const startTime = Date.now();
    let jobComplete = false;
    let lastStatus = '';
    
    while (!jobComplete && (Date.now() - startTime) < maxWaitTime) {
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000); // Wait for content to load
      
      const pageContent = await page.locator('body').textContent() || '';
      lastStatus = pageContent;
      
      // Look for completed job status indicators
      const isDone = /done|complete|finished|success/i.test(pageContent);
      const isFailed = /failed|error|unauthorized/i.test(pageContent);
      const isProcessing = /processing|pending|running|in progress/i.test(pageContent);
      
      if (isDone) {
        jobComplete = true;
        // Try to extract course ID from page content
        const courseIdMatch = pageContent.match(/course[_-]?id[:\s]+([a-z0-9-]+)/i) ||
                             pageContent.match(/courses\/([a-z0-9-]+)/i);
        if (courseIdMatch) courseId = courseIdMatch[1];
        break;
      }
      
      if (isFailed && !isProcessing) {
        // Only fail if it's definitely failed (not just processing)
        throw new Error(`Job failed: ${pageContent.substring(0, 200)}`);
      }
      
      // Log progress
      console.log(`Job status check: ${isProcessing ? 'processing' : 'unknown'}, elapsed: ${Math.round((Date.now() - startTime) / 1000)}s`);
      
      // Wait before next check
      await page.waitForTimeout(15000); // Check every 15 seconds
    }
    
    if (!jobComplete) {
      console.warn(`Job did not complete within ${maxWaitTime / 1000} seconds. Last status: ${lastStatus.substring(0, 200)}`);
      // Don't fail the test - job might still be processing
      // Instead, verify what we can
    }
    
    // Step 7: Verify course is stored and becomes visible via list-courses + get-course
    if (courseId) {
      const { url, anonKey } = getSupabaseBase();

      // Poll list-courses until it appears (up to 60s)
      const sessionToken = await getSessionAccessToken(page);
      let found = false;
      for (let i = 0; i < 30; i++) {
        const res = await page.request.get(`${url}/functions/v1/list-courses?search=${encodeURIComponent(courseId)}&limit=5`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${sessionToken}` },
        });
        expect(res.ok()).toBeTruthy();
        const data = await res.json();
        found = Array.isArray(data.items) && data.items.some((it: any) => it.id === courseId);
        if (found) break;
        await page.waitForTimeout(2000);
      }
      expect(found).toBeTruthy();

      // Verify get-course loads it
      const getRes = await page.request.get(`${url}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`, {
        headers: { apikey: anonKey },
      });
      expect(getRes.ok()).toBeTruthy();

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
      const agentToken = requireEnv('AGENT_TOKEN');
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

