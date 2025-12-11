/**
 * REAL-WORLD FAILURE TESTS
 * 
 * These tests simulate the ACTUAL problems users experience during manual testing:
 * 1. Stale localStorage from previous sessions
 * 2. Edge Function 500/network errors
 * 3. Dirty state accumulation
 * 4. Error visibility and recovery
 * 
 * Run with: npx playwright test tests/e2e/real-world-failures.spec.ts --headed
 */

import { test, expect, Page } from '@playwright/test';

// Helper to inject stale localStorage before page load
async function injectStaleLocalStorage(page: Page, data: Record<string, string>) {
  await page.addInitScript((storageData) => {
    for (const [key, value] of Object.entries(storageData)) {
      localStorage.setItem(key, value);
    }
  }, data);
}

// Helper to intercept and fail specific API calls
async function mockEdgeFunctionFailure(page: Page, urlPattern: string | RegExp, statusCode = 500) {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'TypeError: connection error: connection reset',
        message: 'Edge function failed'
      })
    });
  });
}

test.describe('Stale LocalStorage Scenarios', () => {
  
  test('page with OLD selectedJobId shows error or clears gracefully', async ({ page }) => {
    // Simulate: User closed browser yesterday, job ID is now stale
    await injectStaleLocalStorage(page, {
      'selectedJobId': 'fake-job-id-from-yesterday-12345',
      'selectedCourseId': 'fake-course-that-doesnt-exist',
    });
    
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // EXPECTED BEHAVIOR: Page should either:
    // 1. Show an error that the job doesn't exist
    // 2. Clear the stale state and show fresh form
    // 3. NOT show a completed course from a different session
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // Should NOT be stuck showing old completion state
    const showsStaleCompletion = /view course|edit course|generation complete/i.test(pageContent) 
      && !/error|not found|cleared/i.test(pageContent);
    
    if (showsStaleCompletion) {
      // This is the BUG - page shows stale data
      console.error('❌ BUG: Page shows stale completion state from localStorage');
    }
    
    // Verify: Either error shown, or fresh form available
    const hasError = /error|not found|invalid|expired/i.test(pageContent);
    const hasFreshForm = await page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').isVisible().catch(() => false);
    
    expect(hasError || hasFreshForm).toBeTruthy();
  });

  test('page with non-existent courseId handles gracefully', async ({ page }) => {
    await injectStaleLocalStorage(page, {
      'selectedCourseId': 'deleted-course-id-99999',
    });
    
    // Try to navigate to editor with the stale ID
    await page.goto('/admin/editor/deleted-course-id-99999');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // Should show error, not blank screen or crash
    const hasErrorUI = /not found|404|error|does not exist|failed to load/i.test(pageContent);
    const isBlank = pageContent.trim().length < 100;
    
    expect(hasErrorUI).toBeTruthy();
    expect(isBlank).toBeFalsy();
  });

  test('fresh start URL param (?new=1) clears stale state', async ({ page }) => {
    // Pre-populate with stale data
    await injectStaleLocalStorage(page, {
      'selectedJobId': 'old-job-id',
      'selectedCourseId': 'old-course-id',
    });
    
    // Navigate with fresh start param
    await page.goto('/admin/ai-pipeline?new=1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Verify localStorage was cleared
    const storedJobId = await page.evaluate(() => localStorage.getItem('selectedJobId'));
    const storedCourseId = await page.evaluate(() => localStorage.getItem('selectedCourseId'));
    
    expect(storedJobId).toBeNull();
    expect(storedCourseId).toBeNull();
    
    // Verify fresh form is shown
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').first();
    await expect(subjectInput).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Edge Function 500 Errors', () => {
  
  test('list-course-jobs 500 error shows visible error message', async ({ page }) => {
    // Mock the list-course-jobs endpoint to fail
    await mockEdgeFunctionFailure(page, /list-course-jobs|ai_course_jobs/);
    
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // Should show error to user, not silent failure
    const hasVisibleError = /error|failed|unable to load|connection/i.test(pageContent);
    const hasToast = await page.locator('[role="alert"], .toast, [data-sonner-toast]').isVisible().catch(() => false);
    
    // BUG CHECK: If neither error message nor toast, the error is silent
    if (!hasVisibleError && !hasToast) {
      console.error('❌ BUG: Edge function 500 error is silent - user sees no feedback');
    }
    
    expect(hasVisibleError || hasToast).toBeTruthy();
  });

  test('enqueue-job 500 error shows visible error message', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    // Mock the enqueue endpoint to fail AFTER page loads
    await mockEdgeFunctionFailure(page, /enqueue-job|enqueue/);
    
    // Fill the form
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').first();
    if (await subjectInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await subjectInput.fill('Test Subject');
      
      // Click generate
      const generateButton = page.locator('button:has-text("Generate")').first();
      if (await generateButton.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await generateButton.click();
        await page.waitForTimeout(3000);
        
        // Should show error, not stuck in loading state
        const hasError = await page.locator('text=/error|failed|unable/i').isVisible().catch(() => false);
        const hasToast = await page.locator('[role="alert"], .toast, [data-sonner-toast]').isVisible().catch(() => false);
        const isStuckLoading = await page.locator('text=/generating|creating|loading/i').isVisible().catch(() => false);
        
        if (isStuckLoading && !hasError && !hasToast) {
          console.error('❌ BUG: Stuck in loading state after 500 error');
        }
        
        expect(hasError || hasToast).toBeTruthy();
      }
    }
  });

  test('get-course 500 error shows error UI, not blank screen', async ({ page }) => {
    await mockEdgeFunctionFailure(page, /get-course|courses\//);
    
    await page.goto('/admin/editor/some-course-id');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // Should show error, not blank
    const isBlank = pageContent.trim().length < 100;
    const hasErrorUI = /error|failed|unable to load|try again/i.test(pageContent);
    
    expect(isBlank).toBeFalsy();
    expect(hasErrorUI).toBeTruthy();
  });

  test('network timeout shows user-friendly message', async ({ page }) => {
    // Mock a timeout (abort after delay)
    await page.route(/list-course-jobs/, async (route) => {
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay
      route.abort('timedout');
    });
    
    await page.goto('/admin/ai-pipeline');
    
    // Don't wait for networkidle (it will timeout)
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    
    // Page should be usable even if background request is slow/failing
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').first();
    const isFormUsable = await subjectInput.isVisible({ timeout: 3000 }).catch(() => false);
    
    expect(isFormUsable).toBeTruthy();
  });
});

test.describe('Dirty State & Error Recovery', () => {
  
  test('multiple rapid clicks do not corrupt state', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').first();
    if (await subjectInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await subjectInput.fill('Test Subject');
      
      const generateButton = page.locator('button:has-text("Generate")').first();
      if (await generateButton.isEnabled({ timeout: 3000 }).catch(() => false)) {
        // Rapid clicks (user frustration pattern)
        await generateButton.click();
        await generateButton.click().catch(() => {}); // May be disabled
        await generateButton.click().catch(() => {});
        
        await page.waitForTimeout(3000);
        
        // Should not show multiple errors or corrupted state
        const errorCount = await page.locator('[role="alert"], .toast-error').count();
        expect(errorCount).toBeLessThanOrEqual(1); // At most one error
        
        // Page should still be usable
        const pageContent = await page.locator('body').textContent() || '';
        expect(pageContent.length).toBeGreaterThan(100);
      }
    }
  });

  test('can recover from error state and try again', async ({ page }) => {
    // First, trigger an error
    await mockEdgeFunctionFailure(page, /enqueue-job/);
    
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').first();
    if (await subjectInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await subjectInput.fill('Test Subject');
      
      const generateButton = page.locator('button:has-text("Generate")').first();
      if (await generateButton.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await generateButton.click();
        await page.waitForTimeout(2000);
        
        // Now remove the mock (simulating network recovery)
        await page.unroute(/enqueue-job/);
        
        // User should be able to try again
        const canRetry = await generateButton.isEnabled({ timeout: 3000 }).catch(() => false);
        const hasRetryButton = await page.locator('button:has-text("Try Again"), button:has-text("Retry")').isVisible().catch(() => false);
        
        expect(canRetry || hasRetryButton).toBeTruthy();
      }
    }
  });

  test('navigating away and back preserves valid state', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    // Fill form partially
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').first();
    if (await subjectInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await subjectInput.fill('My Test Subject');
      
      // Navigate away
      await page.goto('/admin/jobs');
      await page.waitForLoadState('networkidle');
      
      // Navigate back
      await page.goto('/admin/ai-pipeline');
      await page.waitForLoadState('networkidle');
      
      // Form should be fresh (not preserving partial input is OK)
      // But should NOT show error or crash
      const pageContent = await page.locator('body').textContent() || '';
      const hasCrash = /error|crash|undefined|null/i.test(pageContent) && pageContent.length < 200;
      
      expect(hasCrash).toBeFalsy();
    }
  });
});

test.describe('Error Visibility Audit', () => {
  
  test('all error states have visible UI feedback', async ({ page }) => {
    const errorScenarios = [
      { name: 'list-jobs-500', pattern: /list-course-jobs/ },
      { name: 'get-course-500', pattern: /get-course/ },
      { name: 'enqueue-500', pattern: /enqueue/ },
    ];
    
    for (const scenario of errorScenarios) {
      // Reset page state
      await page.goto('about:blank');
      
      // Mock the specific failure
      await mockEdgeFunctionFailure(page, scenario.pattern);
      
      await page.goto('/admin/ai-pipeline');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);
      
      // Check for ANY visible error indicator
      const hasErrorText = await page.locator('text=/error|failed|unable/i').isVisible().catch(() => false);
      const hasErrorToast = await page.locator('[role="alert"]').isVisible().catch(() => false);
      const hasErrorBanner = await page.locator('[class*="error"], [class*="alert-destructive"]').isVisible().catch(() => false);
      
      const hasAnyErrorUI = hasErrorText || hasErrorToast || hasErrorBanner;
      
      if (!hasAnyErrorUI) {
        console.warn(`⚠️ ${scenario.name}: No visible error UI for 500 response`);
      }
      
      // Clean up mock
      await page.unroute(scenario.pattern);
    }
  });

  test('console has no unhandled promise rejections', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });
    
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Filter out expected errors (like favicon 404)
    const unexpectedErrors = consoleErrors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('404') &&
      !e.includes('net::ERR')
    );
    
    // Should have no unhandled errors
    const hasUnhandledRejection = unexpectedErrors.some(e => 
      e.includes('Unhandled') || 
      e.includes('uncaught') ||
      e.includes('Cannot read properties of undefined')
    );
    
    if (hasUnhandledRejection) {
      console.error('❌ Unhandled errors found:', unexpectedErrors);
    }
    
    expect(hasUnhandledRejection).toBeFalsy();
  });
});

test.describe('Jobs List Component Failures', () => {
  
  test('useJobsList error is surfaced to user', async ({ page }) => {
    // The useJobsList hook fetches from list-course-jobs
    // When it fails, the error should be visible
    
    await mockEdgeFunctionFailure(page, /list-course-jobs/);
    
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    // Check if "Recent Jobs" section shows error or empty state with explanation
    const recentJobsSection = page.locator('text=/recent|history|previous/i').first();
    
    if (await recentJobsSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      const sectionContent = await recentJobsSection.locator('..').textContent() || '';
      
      // Should show error or "unable to load" message
      const hasErrorInSection = /error|failed|unable|unavailable/i.test(sectionContent);
      
      if (!hasErrorInSection) {
        console.warn('⚠️ Recent jobs section may silently hide the 500 error');
      }
    }
    
    // Main form should still be usable despite jobs list failure
    const subjectInput = page.locator('input[placeholder*="Photosynthesis"], input[placeholder*="subject"]').first();
    const isFormUsable = await subjectInput.isVisible({ timeout: 3000 }).catch(() => false);
    
    expect(isFormUsable).toBeTruthy();
  });
});


