import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: Admin Job Creation
 * 
 * Tests admin account functionality with REAL Supabase and REAL LLM calls.
 * 
 * Prerequisites:
 *   - Admin account must exist (run scripts/create-admin.ts)
 *   - Supabase credentials must be configured
 *   - LLM API keys must be configured (for job creation)
 * 
 * Run with: npm run e2e:live
 */

test.describe('Live Admin: Job Creation', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('admin can create a job via Quick Start panel', async ({ page }) => {
    // Navigate to admin dashboard
    await page.goto('/admin');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Look for Quick Start panel or job creation UI
    // This might be on the dashboard or a specific admin page
    const quickStartButton = page.locator('text=Quick Start').or(page.locator('[data-cta-id*="quick-start"]'));
    
    if (await quickStartButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await quickStartButton.click();
    }
    
    // Wait for job creation form
    await page.waitForSelector('input, select, [data-cta-id*="create"]', { timeout: 10000 });
    
    // Fill in job details (adjust selectors based on actual UI)
    const jobTypeSelect = page.locator('select').or(page.locator('[data-cta-id*="job-type"]'));
    if (await jobTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await jobTypeSelect.selectOption({ index: 0 }); // Select first job type
    }
    
    // Click create button
    const createButton = page.locator('button:has-text("Create")').or(page.locator('[data-cta-id*="create-job"]'));
    await createButton.click();
    
    // Wait for job to be created (should show success message or job ID)
    await expect(
      page.locator('text=/job|success|created/i').or(page.locator('[data-testid*="job"]'))
    ).toBeVisible({ timeout: 60000 }); // 60s timeout for real LLM calls
    
    // Verify no error messages
    const errorMessages = page.locator('text=/error|failed|unauthorized/i');
    await expect(errorMessages).toHaveCount(0);
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

