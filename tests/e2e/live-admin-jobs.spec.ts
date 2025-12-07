import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: Admin Job Creation
 * 
 * Tests admin account functionality with REAL Supabase and REAL LLM calls.
 * 
 * Prerequisites:
 *   - Admin account must exist (run scripts/create-admin.ts)
 *   - Supabase credentials must be configured (in learnplay.env or env vars)
 *   - LLM API keys must be configured (for job creation)
 * 
 * Run with: npm run e2e:live
 * 
 * These tests use REAL services - they will:
 *   - Make actual API calls to Supabase
 *   - Create real jobs in the database
 *   - Call real LLM APIs (OpenAI/Anthropic)
 *   - Test actual user workflows
 */

test.describe('Live Admin: Job Creation', () => {
  // Use authenticated state from setup project
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('admin can create a job via Quick Start panel', async ({ page }) => {
    // Navigate to admin AI pipeline page (AIPipelineV2)
    await page.goto('/admin/ai-pipeline');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Look for the subject input field (has id="subject" in AIPipelineV2)
    const subjectInput = page.locator('input#subject');
    await subjectInput.waitFor({ timeout: 15000 });
    
    // Fill in subject (required field)
    await subjectInput.fill('Test Subject E2E');
    
    // Grade dropdown is optional, but let's set it
    const gradeSelect = page.locator('select').first();
    if (await gradeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await gradeSelect.selectOption({ index: 1 }); // Select second option (3-5)
    }
    
    // Click create/generate button (AIPipelineV2 uses "Generate Course" button)
    const createButton = page.locator('button:has-text("Generate"), button:has-text("Create Course"), button:has-text("Create")').first();
    await createButton.waitFor({ timeout: 5000 });
    await createButton.click();
    
    // Wait for job to be created (should show success toast or job ID)
    // Look for toast notification or job progress indicator
    await expect(
      page.locator('text=/job|success|created|started|processing/i').or(
        page.locator('[data-testid*="job"], [data-cta-id*="job"], .toast, [role="status"]')
      )
    ).toBeVisible({ timeout: 90000 }); // 90s timeout for real LLM calls
    
    // Verify no critical error messages (401, CORS, etc.)
    const criticalErrors = page.locator('text=/unauthorized|401|cors|blocked/i');
    const criticalErrorCount = await criticalErrors.count();
    expect(criticalErrorCount).toBe(0);
  });

  test('admin can view job status', async ({ page }) => {
    await page.goto('/admin/jobs');
    
    // Wait for jobs page to load
    await page.waitForLoadState('networkidle');
    
    // Verify jobs page loaded (check for common elements)
    // Could be a table, list, or empty state
    const hasTable = await page.locator('table').isVisible({ timeout: 2000 }).catch(() => false);
    const hasJobText = await page.getByText(/job/i).isVisible({ timeout: 2000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no jobs|empty/i).isVisible({ timeout: 2000 }).catch(() => false);
    const hasContent = await page.locator('body').textContent();
    
    // Page should have loaded with some content
    expect(hasTable || hasJobText || hasEmptyState || (hasContent && hasContent.length > 100)).toBeTruthy();
  });

  test('admin can access admin-only pages', async ({ page }) => {
    const adminPages = [
      '/admin',
      '/admin/courses',
      '/admin/jobs',
      '/admin/metrics',
    ];

    for (const adminPage of adminPages) {
      await page.goto(adminPage);
      await page.waitForLoadState('networkidle');
      
      // Verify we're not redirected to auth page
      await expect(page).not.toHaveURL(/\/auth/);
      
      // Verify page loaded (check for common admin UI elements)
      const hasContent = await page.locator('body').textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent?.length).toBeGreaterThan(100); // Page has content
    }
  });
});

test.describe('Live Admin: Authentication', () => {
  // These tests need to run without the authenticated storage state
  test.use({ storageState: { cookies: [], origins: [] } });
  
  test('admin can log in with correct credentials', async ({ page }) => {
    // Start fresh (no storage state)
    await page.goto('/auth');
    
    // Wait for auth form to load
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Fill in admin credentials
    await page.fill('input[type="email"]', 'admin@learnplay.dev');
    await page.fill('input[type="password"]', 'AdminPass123!');
    
    // Submit login
    await page.click('button[type="submit"]');
    
    // Wait for redirect (should go to dashboard, not stay on auth)
    await page.waitForURL(/\/(dashboard|admin|courses|\?|$)/, { timeout: 20000 });
    
    // Verify we're logged in
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/auth');
  });

  test('admin cannot log in with wrong password', async ({ page }) => {
    await page.goto('/auth');
    
    // Wait for auth form
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    await page.fill('input[type="email"]', 'admin@learnplay.dev');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    
    await page.click('button[type="submit"]');
    
    // Should show error or stay on auth page
    await page.waitForTimeout(3000);
    
    const errorMessage = page.locator('text=/invalid|incorrect|error/i');
    const stillOnAuth = page.url().includes('/auth');
    const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false);
    
    expect(hasError || stillOnAuth).toBeTruthy();
  });
});

test.describe('Live: API Error Handling', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('401 errors show user-friendly messages', async ({ page }) => {
    // This test verifies that 401 errors are handled gracefully
    // We'll trigger a 401 by trying to access something without proper auth
    // or by using an expired session
    
    // Clear auth state to simulate expired session
    await page.context().clearCookies();
    
    // Try to access admin page (should redirect to auth or show error)
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Should either redirect to auth or show error message
    await page.waitForTimeout(2000); // Wait for any redirects
    const onAuthPage = page.url().includes('/auth');
    const hasError = await page.locator('text=/authentication|log in|unauthorized/i').isVisible({ timeout: 3000 }).catch(() => false);
    
    // If we're still on /admin, check for error messages in the page
    if (!onAuthPage && !hasError) {
      const pageContent = await page.locator('body').textContent();
      const hasErrorText = pageContent?.toLowerCase().includes('auth') || 
                          pageContent?.toLowerCase().includes('login') ||
                          pageContent?.toLowerCase().includes('unauthorized');
      expect(onAuthPage || hasError || hasErrorText).toBeTruthy();
    } else {
      expect(onAuthPage || hasError).toBeTruthy();
    }
  });

  test('CORS errors are handled gracefully in preview environments', async ({ page }) => {
    // This test verifies that CORS errors don't crash the app
    // In Lovable preview, some Edge Functions may have CORS issues
    
    await page.goto('/admin/metrics');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for error messages - should be user-friendly, not raw CORS errors
    const errorMessages = page.locator('text=/CORS|blocked|preflight/i');
    const errorCount = await errorMessages.count();
    
    // If there are CORS errors, they should be handled gracefully
    if (errorCount > 0) {
      // Check that error messages are user-friendly
      const errorText = await errorMessages.first().textContent();
      expect(errorText).not.toContain('Access-Control-Allow-Origin');
      expect(errorText?.toLowerCase()).toMatch(/unavailable|preview|environment/i);
    }
  });
});

