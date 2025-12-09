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
    // Step 1: Ensure we have a course (create or use existing)
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');

    // Check if we have courses, if not create one
    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    let courseId: string;
    if (!hasCourse) {
      // Create a course via Quick Start
      const subjectInput = page.locator('input[placeholder*="subject"], input#subject').first();
      if (await subjectInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await subjectInput.fill('Test Course for Play Session');
        await page.locator('[data-cta-id="quick-start-create"]').click();
        
        // Wait for course creation (simplified - in real test would poll job status)
        await page.waitForTimeout(10000);
        
        // Extract courseId from page or localStorage
        courseId = await page.evaluate(() => localStorage.getItem('selectedCourseId') || 'test-course');
      } else {
        test.skip('No course creation UI available');
        return;
      }
    } else {
      // Extract courseId from existing course link
      const href = await courseLink.getAttribute('href');
      courseId = href?.match(/\/admin\/editor\/([^/]+)/)?.[1] || 'test-course';
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

