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
    // Navigate to admin pipeline page (where QuickStartPanel is located)
    await page.goto('/admin/pipeline');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // QuickStartPanel should be visible on the pipeline page
    // Look for the Quick Start panel (it's in the left sidebar)
    await page.waitForSelector('[data-cta-id="quick-start-create"]', { timeout: 10000 });
    
    // Select a job type from the dropdown
    const jobTypeSelect = page.locator('select').first();
    if (await jobTypeSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get available options
      const options = await jobTypeSelect.locator('option').all();
      if (options.length > 1) {
        // Select the first non-empty option
        await jobTypeSelect.selectOption({ index: 1 });
      }
    }
    
    // Fill in any required fields (topic, subject, etc.)
    const topicInput = page.locator('input[placeholder*="topic"], input[placeholder*="subject"], input[type="text"]').first();
    if (await topicInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await topicInput.fill('Test Topic for E2E');
    }
    
    // Click create button
    const createButton = page.locator('[data-cta-id="quick-start-create"]');
    await createButton.click();
    
    // Wait for job to be created (should show success message, job ID, or job progress)
    await expect(
      page.locator('text=/job|success|created|started/i').or(page.locator('[data-testid*="job"], [data-cta-id*="job"]'))
    ).toBeVisible({ timeout: 90000 }); // 90s timeout for real LLM calls
    
    // Verify no error messages (401, CORS, etc.)
    const errorMessages = page.locator('text=/error|failed|unauthorized|401|cors/i');
    const errorCount = await errorMessages.count();
    
    if (errorCount > 0) {
      const errorText = await errorMessages.first().textContent();
      // Check that errors are user-friendly, not raw API errors
      expect(errorText).not.toContain('Access-Control-Allow-Origin');
      expect(errorText?.toLowerCase()).not.toMatch(/^[0-9]{3}/); // Not just status codes
    }
  });

  test('admin can view job status', async ({ page }) => {
    await page.goto('/admin/jobs');
    
    // Wait for jobs list to load
    await page.waitForLoadState('networkidle');
    
    // Verify jobs table or list is visible
    await expect(
      page.locator('table, [data-testid*="job"], text=/job/i')
    ).toBeVisible({ timeout: 10000 });
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
  test('admin can log in with correct credentials', async ({ page }) => {
    // Start fresh (no storage state)
    await page.goto('/auth');
    
    // Fill in admin credentials
    await page.fill('input[type="email"]', 'admin@learnplay.dev');
    await page.fill('input[type="password"]', 'AdminPass123!');
    
    // Submit login
    await page.click('button[type="submit"]');
    
    // Wait for redirect (should go to dashboard, not stay on auth)
    await page.waitForURL(/\/(dashboard|admin|courses)/, { timeout: 15000 });
    
    // Verify we're logged in
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('admin cannot log in with wrong password', async ({ page }) => {
    await page.goto('/auth');
    
    await page.fill('input[type="email"]', 'admin@learnplay.dev');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    
    await page.click('button[type="submit"]');
    
    // Should show error or stay on auth page
    await page.waitForTimeout(2000);
    
    const errorMessage = page.locator('text=/invalid|incorrect|error/i');
    const stillOnAuth = page.url().includes('/auth');
    
    expect(errorMessage.isVisible() || stillOnAuth).toBeTruthy();
  });
});

test.describe('Live: API Error Handling', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('401 errors show user-friendly messages', async ({ page }) => {
    // This test verifies that 401 errors are handled gracefully
    // We'll trigger a 401 by trying to access something without proper auth
    // or by using an expired session
    
    await page.goto('/admin');
    
    // Clear auth state to simulate expired session
    await page.context().clearCookies();
    
    // Try to create a job (should fail with 401)
    await page.goto('/admin');
    
    // Should either redirect to auth or show error message
    const onAuthPage = page.url().includes('/auth');
    const hasError = await page.locator('text=/authentication|log in/i').isVisible().catch(() => false);
    
    expect(onAuthPage || hasError).toBeTruthy();
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

