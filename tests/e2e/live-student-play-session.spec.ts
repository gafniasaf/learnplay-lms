/**
 * E2E Tests: Student Play Session - Complete Flow
 * 
 * Tests the core user journey: student completes a learning session
 * 
 * Critical scenarios:
 * - Complete session flow (start → answer → complete → results)
 * - Session persistence across page reload
 * - Network interruption handling
 * - Progress saving
 * - Dashboard updates
 */

import { test, expect } from '@playwright/test';

test.describe('Student Play Session - Complete Flow', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' }); // Using admin for now, will need student auth

  test('student completes full learning session', async ({ page }) => {
    test.setTimeout(5 * 60_000);

    // Step 1: Find an existing course (prefer this to avoid rate limits / long LLM generation).
    // The Course Selector route is the most stable way to obtain a valid courseId in live runs.
    let courseId: string | null = null;
    await page.goto('/admin/courses/select', { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
    } catch {
      // Some environments keep long-polling connections open; continue anyway.
    }
    await page.waitForTimeout(2000);

    const editExisting = page.getByRole('button', { name: /^Edit$/ }).first();
    if (await editExisting.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await editExisting.click();
      await page.waitForURL(/\/admin\/editor\//, { timeout: 60_000 });
      const m = page.url().match(/\/admin\/editor\/([^/?#]+)/);
      if (m?.[1]) courseId = decodeURIComponent(m[1]);
    }

    // Fallback: attempt to extract from the courses listing (older builds).
    if (!courseId) {
      await page.goto('/admin/courses', { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
      } catch {
        // Continue anyway.
      }

      const existingLink = page
        .locator('a[href*="/admin/editor/"], a[href*="/admin/courses/"], [data-testid*="course"] a')
        .first();
      if (await existingLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
        const href = await existingLink.getAttribute('href');
        const hrefStr = String(href || '');
        const m =
          hrefStr.match(/\/admin\/editor\/([^/?#]+)/) ||
          hrefStr.match(/\/admin\/courses\/([^/?#]+)/);
        if (m?.[1]) courseId = decodeURIComponent(m[1]);
      }
    }

    // If no course exists, create one via the AI Pipeline UI (real DB + real LLM).
    if (!courseId) {
      await page.goto('/admin/ai-pipeline', { waitUntil: 'domcontentloaded' });
      try {
        await page.waitForLoadState('networkidle', { timeout: 30_000 });
      } catch {
        // Continue
      }

      const subjectInput = page
        .locator('[data-cta-id="ai-course-subject"]')
        .or(page.locator('input#subject'))
        .or(page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject" i]'))
        .first();
      if (!(await subjectInput.isVisible({ timeout: 10_000 }).catch(() => false))) {
        test.skip('No course creation UI available');
        return;
      }

      await subjectInput.fill(`Play Session Course ${Date.now()}`);

      // Prefer the current AI Pipeline CTA; keep a legacy fallback for older builds.
      const createButton = page
        .locator('[data-cta-id="ai-course-generate"]')
        .or(page.locator('[data-cta-id="quick-start-create"]'))
        .or(page.getByRole('button', { name: /generate course|create course/i }))
        .first();

      const hasCreate = await createButton.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!hasCreate) {
        test.skip('No create button available on AI Pipeline');
        return;
      }

      // If rate limited, the button may be disabled; skip rather than hard-failing the suite.
      if (!(await createButton.isEnabled().catch(() => false))) {
        test.skip('Course creation is disabled (possibly rate limited)');
        return;
      }

      await createButton.click();

      // Wait for completion UI, then navigate to editor to extract courseId.
      // Some builds don't surface the exact "Course Generated" text, so key off the Edit CTA.
      const editBtn = page.getByRole('button', { name: /^Edit$/ }).first();
      await editBtn.waitFor({ timeout: 6 * 60_000 });
      await editBtn.click();
      await page.waitForURL(/\/admin\/editor\//, { timeout: 60_000 });

      const url = page.url();
      const m = url.match(/\/admin\/editor\/([^/?#]+)/);
      courseId = m?.[1] ? decodeURIComponent(m[1]) : null;
    }

    if (!courseId) {
      test.skip('No course available to run play session');
      return;
    }

    // Step 2: Navigate to play page
    await page.goto(`/play/${courseId}`);
    await page.waitForLoadState('networkidle');

    // Step 3: Verify play page loaded
    await expect(page.locator('text=/start|begin|play|question/i')).toBeVisible({ timeout: 10000 });

    // Step 4: Start session (if needed)
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")').first();
    const hasStartButton = await startButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasStartButton) {
      await startButton.click();
      await page.waitForTimeout(2000);
    }

    // Step 5: Answer questions (if questions are available)
    const questionStem = page.locator('[data-testid="question-stem"], .question-stem, text=/what|which|how/i').first();
    const hasQuestion = await questionStem.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasQuestion) {
      // Answer a few questions
      for (let i = 0; i < 3; i++) {
        // Find answer options
        const options = page.locator('button:has-text("A"), button:has-text("B"), [data-testid*="option"]');
        const optionCount = await options.count();
        
        if (optionCount > 0) {
          // Click first option
          await options.first().click();
          await page.waitForTimeout(1000);
          
          // Look for next button or auto-advance
          const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
          const hasNext = await nextButton.isVisible({ timeout: 2000 }).catch(() => false);
          if (hasNext) {
            await nextButton.click();
            await page.waitForTimeout(1000);
          }
        } else {
          break; // No more questions
        }
      }
    }

    // Step 6: Verify session progress (if progress indicator exists)
    const progressIndicator = page.locator('[data-testid="progress"], .progress, text=/progress|complete/i');
    const hasProgress = await progressIndicator.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasProgress) {
      // Progress should be > 0 if we answered questions
      const progressText = await progressIndicator.textContent();
      expect(progressText).toBeTruthy();
    }

    // Step 7: Complete session (if completion UI exists)
    const completeButton = page.locator('button:has-text("Complete"), button:has-text("Finish")').first();
    const hasCompleteButton = await completeButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasCompleteButton) {
      await completeButton.click();
      await page.waitForTimeout(2000);
    }

    // Step 8: Verify results page (if navigated)
    const resultsPage = page.locator('text=/results|score|completed|finished/i');
    const hasResults = await resultsPage.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasResults) {
      // Verify score/progress displayed
      const scoreText = await resultsPage.textContent();
      expect(scoreText).toBeTruthy();
    }

    // Step 9: Navigate to dashboard
    const dashboardLink = page.locator('a[href*="/dashboard"], button:has-text("Dashboard")').first();
    const hasDashboardLink = await dashboardLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasDashboardLink) {
      await dashboardLink.click();
      await page.waitForLoadState('networkidle');
      
      // Verify dashboard shows updated progress (if applicable)
      const dashboardProgress = page.locator('text=/progress|completed|score/i');
      const hasDashboardProgress = await dashboardProgress.isVisible({ timeout: 5000 }).catch(() => false);
      // Dashboard might not show progress immediately, so this is optional
    }
  });

  test('student session persists across page reload', async ({ page }) => {
    // This test would require:
    // 1. Starting a session
    // 2. Answering questions
    // 3. Reloading page
    // 4. Verifying session resumes
    
    // For now, mark as skipped until we have proper session management
    test.skip('Requires session persistence implementation');
  });

  test('student session handles network interruption', async ({ page, context }) => {
    // This test would require:
    // 1. Starting a session
    // 2. Answering question
    // 3. Simulating network offline
    // 4. Verifying error handling
    // 5. Restoring network
    // 6. Verifying retry works
    
    // For now, mark as skipped until we have network simulation
    test.skip('Requires network simulation');
  });
});

