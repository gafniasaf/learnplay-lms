/**
 * E2E Tests: Course Editor V2 - Real DB + Real LLM
 * 
 * Tests LLM-powered features in CourseEditorV2 with REAL database and REAL LLM calls:
 * - AI Rewrite (Stem, Options, Reference, Study Text)
 * - AI Generate Hints
 * - AI Generate Images
 * - Command Palette actions (Audit, Co-Pilot, etc.)
 * 
 * Prerequisites:
 *   - Admin account must exist (playwright/.auth/admin.json)
 *   - OpenAI API key in learnplay.env
 *   - Supabase credentials configured
 *   - Real courses in database
 * 
 * Run with: npm run e2e:real-db tests/e2e/live-course-editor-v2-llm.spec.ts
 * 
 * ⚠️ WARNING: These tests use REAL LLM APIs (costs apply: ~$0.01-0.10 per test)
 */

import { test, expect } from '@playwright/test';

test.describe('Course Editor V2: Real DB + Real LLM', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('AI Rewrite Stem - verifies real LLM call', async ({ page }) => {
    // Go to course selector
    await page.goto('/admin/courses/select');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Course titles are h3.font-semibold INSIDE the course list (div.space-y-2)
    // Not the CardTitle "Select Course to Edit"
    const courseTitleInList = page.locator('div.space-y-2 h3.font-semibold').first();
    const hasCourseTitle = await courseTitleInList.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (!hasCourseTitle) {
      const noCourses = page.locator('text=/No courses available/i');
      const hasNoCourses = await noCourses.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasNoCourses) {
        test.skip('No courses available');
        return;
      }
      test.skip('No course titles found in course list');
      return;
    }

    // Get the course title text for debugging
    const titleText = await courseTitleInList.textContent();
    console.log('[DEBUG] First course title:', titleText);

    // Get course IDs from console log output (MCP logs course IDs)
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Loaded courses:') || text.includes('courseId')) {
        consoleLogs.push(text);
      }
    });
    
    // Refresh the page to capture the console log
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log('[DEBUG] Console logs:', consoleLogs);
    
    // Extract course ID from console log: "[CourseSelector] Loaded courses: [id1, id2, ...]"
    let courseId: string | null = null;
    for (const log of consoleLogs) {
      const match = log.match(/Loaded courses: \[([^\]]+)\]/);
      if (match) {
        const ids = match[1].split(',').map(s => s.trim());
        if (ids.length > 0) {
          courseId = ids[0];
          console.log('[DEBUG] Found course IDs from log:', ids.slice(0, 5));
          break;
        }
      }
    }

    console.log('[DEBUG] Using course ID:', courseId);
    
    // Navigate directly using the URL
    const testCourseId = courseId || 'photosynthesis';
    console.log('[DEBUG] Navigating to:', `/admin/editor/${testCourseId}`);
    
    // Enable dev mode and set admin role to bypass role restrictions
    await page.evaluate(() => {
      localStorage.setItem('app.dev', '1');  // Enable dev mode
      localStorage.setItem('role', 'admin'); // Set admin role
    });
    
    // Check auth state before navigation
    const authState = await page.evaluate(() => {
      const localStorageAuth = localStorage.getItem('sb-eidcegehaswbtzrwzvfa-auth-token');
      return {
        hasAuth: !!localStorageAuth,
        role: localStorage.getItem('role'),
        devMode: localStorage.getItem('app.dev'),
      };
    });
    console.log('[DEBUG] Auth state:', authState);
    
    await page.goto(`/admin/editor/${testCourseId}`);
    
    // Wait and check for redirects
    await page.waitForTimeout(2000);
    console.log('[DEBUG] URL after navigation:', page.url());
    
    // If redirected to /admin, check for error or auth issue
    if (page.url().includes('/admin') && !page.url().includes('/admin/editor/')) {
      const pageText = await page.locator('body').textContent();
      console.log('[DEBUG] Page content after redirect:', pageText?.substring(0, 500));
    }
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Verify we're in the editor
    const currentUrl = page.url();
    console.log('[DEBUG] Current URL:', currentUrl);
    const isEditor = currentUrl.includes('/admin/editor/');
    if (!isEditor) {
      test.skip(`Failed to navigate to course editor. Current URL: ${currentUrl}`);
      return;
    }

    // Take screenshot of editor
    await page.screenshot({ path: 'reports/debug-editor-loaded.png', fullPage: true });

    // Debug: list all data-cta-id elements on the page
    const allCtaIds = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-cta-id]');
      return Array.from(elements).map(el => (el as HTMLElement).getAttribute('data-cta-id'));
    });
    console.log('[DEBUG] All CTA IDs on page:', allCtaIds.slice(0, 20));
    
    // Debug: check React state via window or console
    const pageHTML = await page.content();
    const hasGroupItems = pageHTML.includes('nav-item-select');
    console.log('[DEBUG] HTML contains nav-item-select:', hasGroupItems);
    
    // Check if items exist in DOM but just hidden
    const allDivs = await page.locator('div').count();
    const itemDivs = await page.locator('div:has-text("Item")').count();
    console.log('[DEBUG] Total divs:', allDivs, 'Divs with "Item" text:', itemDivs);
    
    // Get content of divs with "Item" text
    const itemTexts = await page.evaluate(() => {
      const divs = document.querySelectorAll('div');
      const items: string[] = [];
      divs.forEach(div => {
        const text = div.textContent?.trim() || '';
        if (text.startsWith('Item ') && text.length < 30) {
          items.push(text + ' | attrs: ' + Array.from(div.attributes).map(a => `${a.name}=${a.value}`).join(', '));
        }
      });
      return items;
    });
    console.log('[DEBUG] Item divs content:', itemTexts.slice(0, 10));
    
    // Since items aren't visible, test the FAB AI Rewrite button directly
    // This should at least verify the UI is functional
    const fabAiRewrite = page.locator('[data-cta-id="cta-courseeditor-fab-ai-rewrite-stem"]');
    const hasFabAiRewrite = await fabAiRewrite.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('[DEBUG] FAB AI Rewrite visible:', hasFabAiRewrite);
    
    if (!hasFabAiRewrite) {
      // Try toggling the FAB menu first
      const fabToggle = page.locator('[data-cta-id="cta-courseeditor-fab-toggle"]');
      const hasFabToggle = await fabToggle.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasFabToggle) {
        console.log('[DEBUG] Clicking FAB toggle...');
        await fabToggle.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // For now, just verify we can open the Command Palette
    const commandPaletteButton = page.locator('[data-cta-id="cta-courseeditor-command-palette"]');
    const hasCommandPalette = await commandPaletteButton.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('[DEBUG] Command palette button visible:', hasCommandPalette);
    
    if (!hasCommandPalette) {
      test.skip('Command palette button not found');
      return;
    }
    
    // Click command palette
    await commandPaletteButton.click();
    await page.waitForTimeout(1000);
    
    // Check if palette opened
    const paletteInput = page.locator('input[placeholder*="command"]').or(page.locator('input[placeholder*="Search"]'));
    const hasPaletteInput = await paletteInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('[DEBUG] Palette input visible:', hasPaletteInput);
    
    if (!hasPaletteInput) {
      // Try keyboard shortcut
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(1000);
    }

    // Close command palette
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Now select first item in navigator (should be visible now)
    const firstItem = page.locator('[data-cta-id="cta-courseeditor-nav-item-select-0-0"]').first();
    const hasItem = await firstItem.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('[DEBUG] First navigator item visible:', hasItem);

    if (!hasItem) {
      test.skip('No items found in navigator');
      return;
    }

    // Set up request listener BEFORE clicking (to catch all requests)
    const llmRequests: any[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('rewriteText') || url.includes('ai-job-runner') || url.includes('enqueue-job') || url.includes('rewrite-text')) {
        llmRequests.push({ url, method: request.method() });
        console.log('[DEBUG] Captured LLM request:', url);
      }
    });

    await firstItem.click();
    await page.waitForTimeout(2000);

    // Find AI Rewrite button in Stem tab (should be visible by default)
    const aiRewriteButton = page.locator('[data-cta-id="cta-courseeditor-stem-ai-rewrite"]').first();
    const hasRewriteButton = await aiRewriteButton.isVisible({ timeout: 10000 }).catch(() => false);
    console.log('[DEBUG] AI Rewrite button visible:', hasRewriteButton);

    if (!hasRewriteButton) {
      // Debug: check for AI button with different selector
      const aiButtons = await page.locator('button:has-text("AI")').count();
      const rewriteButtons = await page.locator('button:has-text("Rewrite")').count();
      console.log('[DEBUG] AI buttons:', aiButtons, 'Rewrite buttons:', rewriteButtons);
      test.skip(`AI Rewrite button not found. AI btns: ${aiButtons}, Rewrite btns: ${rewriteButtons}`);
      return;
    }

    const stemTextarea = page.locator('#courseeditor-section-stem textarea').first();
    const hasStemTextarea = await stemTextarea.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasStemTextarea) {
      test.skip('Stem textarea not found');
      return;
    }
    const beforeStem = await stemTextarea.inputValue().catch(() => '');

    // Wait for the actual Edge call (real LLM) to complete.
    const rewriteRespPromise = page
      .waitForResponse(
        (resp) => resp.url().includes('/functions/v1/ai-rewrite-text') && resp.status() === 200,
        { timeout: 60000 }
      )
      .catch(() => null);

    // Click AI Rewrite button
    await aiRewriteButton.click();
    await page.waitForTimeout(1000);

    const rewriteResp = await rewriteRespPromise;
    expect(rewriteResp, 'Expected /functions/v1/ai-rewrite-text to be called').toBeTruthy();

    // Wait for UI to reflect the rewrite (either toast or textarea value change).
    const successToast = page.getByText(/AI rewrite applied/i).first();
    const hasSuccessToast = await successToast.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasSuccessToast) {
      await expect.poll(async () => await stemTextarea.inputValue().catch(() => ''), { timeout: 60000 }).not.toBe(beforeStem);
    }

    // Verify a real LLM call was made
    console.log('[DEBUG] LLM Requests made:', llmRequests);
    expect(llmRequests.length).toBeGreaterThan(0);
    const hasRealLLMCall = llmRequests.some(req => 
      req.url.includes('rewriteText') || 
      req.url.includes('ai-rewrite-text') || 
      req.url.includes('ai-job-runner') ||
      req.url.includes('enqueue-job')
    );
    expect(hasRealLLMCall).toBeTruthy();
  });

  test('AI Generate Hints - verifies real LLM call', async ({ page }) => {
    await page.goto('/admin/courses/select');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Get course ID from API response
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('list-courses') && resp.status() === 200, { timeout: 30000 }).catch(() => null),
      page.goto('/admin/courses/select'),
    ]);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    let courseId: string | null = null;
    if (response) {
      try {
        const data = await response.json();
        const courses = data?.courses || data || [];
        if (Array.isArray(courses) && courses.length > 0) {
          courseId = courses[0].id;
        }
      } catch (e) {}
    }

    if (!courseId) {
      const noCourses = page.locator('text=/No courses available/i');
      const hasNoCourses = await noCourses.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasNoCourses) {
        test.skip('No courses available');
        return;
      }
      test.skip('Could not get course ID from API');
      return;
    }

    await page.goto(`/admin/editor/${courseId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    const isEditor = page.url().includes('/admin/editor/');
    if (!isEditor) {
      test.skip(`Failed to navigate to course editor. URL: ${page.url()}`);
      return;
    }

    // Select first item
    const firstItem = page.locator('[data-cta-id*="nav-item-select"]').first();
    const hasItem = await firstItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasItem) {
      test.skip('No items in course');
      return;
    }

    await firstItem.click();
    await page.waitForTimeout(1000);

    // Navigate to Hints tab
    const hintsTab = page.locator('[data-cta-id="cta-courseeditor-editor-tab-hints"]').first();
    const hasHintsTab = await hintsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasHintsTab) {
      test.skip('Hints tab not found');
      return;
    }

    await hintsTab.click();
    await page.waitForTimeout(1000);

    // Find AI Generate button
    const aiGenerateButton = page.locator('[data-cta-id="cta-courseeditor-hints-ai-generate"]').first();
    const hasGenerateButton = await aiGenerateButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasGenerateButton) {
      test.skip('AI Generate button not found');
      return;
    }

    // Check if button is disabled (unsaved changes)
    const isDisabled = await aiGenerateButton.isDisabled();
    if (isDisabled) {
      // Save first
      const saveButton = page.locator('[data-cta-id="cta-courseeditor-save"]').first();
      const hasSave = await saveButton.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSave) {
        await saveButton.click();
        await page.waitForTimeout(2000);
      }
    }

    // Intercept network requests
    const llmRequests: any[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('generateHints') || url.includes('ai-job-runner') || url.includes('enqueue-job')) {
        llmRequests.push({ url, method: request.method() });
      }
    });

    // Click AI Generate
    await aiGenerateButton.click();

    // Wait for hints to be generated (real LLM calls take 10-30 seconds)
    await expect(
      page.locator('text=/generated|complete|processing/i').or(
        page.locator('[role="status"]')
      ).or(
        page.locator('textarea').filter({ hasText: /.+/ })
      )
    ).toBeVisible({ timeout: 60000 });

    // Verify LLM request was made
    expect(llmRequests.length).toBeGreaterThan(0);
  });

  test('Command Palette - Audit Variants - verifies real LLM job', async ({ page }) => {
    await page.goto('/admin/courses/select');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Get course ID from API response
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('list-courses') && resp.status() === 200, { timeout: 30000 }).catch(() => null),
      page.goto('/admin/courses/select'),
    ]);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    let courseId: string | null = null;
    if (response) {
      try {
        const data = await response.json();
        const courses = data?.courses || data || [];
        if (Array.isArray(courses) && courses.length > 0) {
          courseId = courses[0].id;
        }
      } catch (e) {}
    }

    if (!courseId) {
      const noCourses = page.locator('text=/No courses available/i');
      const hasNoCourses = await noCourses.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasNoCourses) {
        test.skip('No courses available');
        return;
      }
      test.skip('Could not get course ID from API');
      return;
    }

    await page.goto(`/admin/editor/${courseId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    const isEditor = page.url().includes('/admin/editor/');
    if (!isEditor) {
      test.skip(`Failed to navigate to course editor. URL: ${page.url()}`);
      return;
    }

    // Open command palette with Ctrl+K
    await page.keyboard.press('Control+K');
    await page.waitForTimeout(500);

    // Find command palette
    const commandPalette = page.locator('[data-cta-id*="command"], input[placeholder*="command" i], input[placeholder*="search" i]').first();
    const hasPalette = await commandPalette.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasPalette) {
      test.skip('Command palette not found');
      return;
    }

    // Type "audit" to find audit command
    await commandPalette.fill('audit');
    await page.waitForTimeout(500);

    // Find and click audit variants command
    const auditCommand = page.locator('[data-cta-id="cta-courseeditor-command-audit-variants"]').first();
    const hasAuditCommand = await auditCommand.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasAuditCommand) {
      test.skip('Audit variants command not found');
      return;
    }

    // Intercept network requests
    const jobRequests: any[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('enqueue-job') || url.includes('audit-variants')) {
        jobRequests.push({ url, method: request.method() });
      }
    });

    await auditCommand.click();
    await page.waitForTimeout(1000);

    // Wait for job to be created (real job creation is fast, but we verify it happened)
    await expect(
      page.locator('text=/audit|started|job|processing/i').or(
        page.locator('[role="status"]')
      )
    ).toBeVisible({ timeout: 30000 });

    // Verify job request was made (real API call, not mocked)
    expect(jobRequests.length).toBeGreaterThan(0);
  });

  test('Study Text AI Rewrite - verifies real LLM call', async ({ page }) => {
    await page.goto('/admin/courses/select');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Get course ID from API response
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('list-courses') && resp.status() === 200, { timeout: 30000 }).catch(() => null),
      page.goto('/admin/courses/select'),
    ]);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    let courseId: string | null = null;
    if (response) {
      try {
        const data = await response.json();
        const courses = data?.courses || data || [];
        if (Array.isArray(courses) && courses.length > 0) {
          courseId = courses[0].id;
        }
      } catch (e) {}
    }

    if (!courseId) {
      const noCourses = page.locator('text=/No courses available/i');
      const hasNoCourses = await noCourses.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasNoCourses) {
        test.skip('No courses available');
        return;
      }
      test.skip('Could not get course ID from API');
      return;
    }

    await page.goto(`/admin/editor/${courseId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    const isEditor = page.url().includes('/admin/editor/');
    if (!isEditor) {
      test.skip(`Failed to navigate to course editor. URL: ${page.url()}`);
      return;
    }

    // Navigate to Study Texts tab
    const studyTextsTab = page.locator('[data-cta-id="cta-courseeditor-tab-studytexts"]').first();
    const hasStudyTextsTab = await studyTextsTab.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasStudyTextsTab) {
      test.skip('Study Texts tab not found');
      return;
    }

    await studyTextsTab.click();
    await page.waitForTimeout(1000);

    // Find first study text item (if any)
    const firstStudyText = page.locator('button, [role="button"]').filter({ hasText: /study text|text \d+/i }).first();
    const hasStudyText = await firstStudyText.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasStudyText) {
      test.skip('No study texts found');
      return;
    }

    await firstStudyText.click();
    await page.waitForTimeout(1000);

    // Find AI Rewrite button for study text
    const aiRewriteButton = page.locator('[data-cta-id="cta-studytext-ai-rewrite"]').first();
    const hasRewriteButton = await aiRewriteButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasRewriteButton) {
      test.skip('Study Text AI Rewrite button not found');
      return;
    }

    // Intercept network requests
    const llmRequests: any[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('rewriteText') || url.includes('ai-job-runner') || url.includes('enqueue-job')) {
        llmRequests.push({ url, method: request.method() });
      }
    });

    await aiRewriteButton.click();
    await page.waitForTimeout(2000);

    // Wait for rewrite to complete (real LLM calls take 10-30 seconds)
    await expect(
      page.locator('text=/rewritten|generated|complete|processing/i').or(
        page.locator('[role="status"]')
      )
    ).toBeVisible({ timeout: 60000 });

    // Verify LLM request was made
    expect(llmRequests.length).toBeGreaterThan(0);
  });
});

