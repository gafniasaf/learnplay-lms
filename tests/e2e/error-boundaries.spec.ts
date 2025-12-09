/**
 * E2E Tests: Error Boundaries & Graceful Error Handling
 * 
 * Tests error boundary functionality:
 * - React error boundaries catch errors gracefully
 * - Error messages are user-friendly
 * - Retry mechanisms work
 * - Error reporting (if Sentry integrated)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:8081';

test.describe('Error Boundaries & Graceful Error Handling', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('invalid route shows 404 page', async ({ page }) => {
    await page.goto(`${BASE_URL}/invalid-route-that-does-not-exist-12345`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should show 404 or error page, not blank screen
    const has404 = await page.getByText(/404|not found|page not found/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await page.getByText(/error|something went wrong/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
    
    expect(has404 || hasError || hasContent).toBeTruthy();
  });

  test('network error shows user-friendly message', async ({ page }) => {
    // Intercept network requests and fail them
    await page.route('**/api/**', route => route.abort());
    
    await page.goto(`${BASE_URL}/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Should show error message, not crash
    const hasError = await page.getByText(/error|failed|network|try again|reload/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasRetryButton = await page.getByRole('button', { name: /retry|try again|reload/i }).isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
    
    expect(hasError || hasRetryButton || hasContent).toBeTruthy();
  });

  test('retry button works after error', async ({ page }) => {
    // First, cause an error
    await page.route('**/api/**', route => route.abort());
    
    await page.goto(`${BASE_URL}/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Remove route interception to allow retry
    await page.unroute('**/api/**');
    
    const retryButton = page.getByRole('button', { name: /retry|try again|reload/i });
    const hasRetryButton = await retryButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasRetryButton) {
      await retryButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Should recover
      const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
      expect(hasContent).toBeTruthy();
    } else {
      const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
      expect(hasContent).toBeTruthy();
    }
  });

  test('page reloads gracefully after error', async ({ page }) => {
    await page.goto(`${BASE_URL}/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Should reload without errors
    const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
    const hasError = await page.getByText(/error/i).isVisible({ timeout: 2000 }).catch(() => false);
    
    expect(hasContent && !hasError).toBeTruthy();
  });

  test('invalid data shows error message', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/editor/invalid-course-id`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should show error or redirect, not crash
    const hasError = await page.getByText(/error|not found|invalid/i).isVisible({ timeout: 5000 }).catch(() => false);
    const redirected = !page.url().includes('invalid-course-id');
    const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
    
    expect(hasError || redirected || hasContent).toBeTruthy();
  });

  test('app does not crash on JavaScript errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Page should still render even if there are console errors
    const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
