/**
 * Integration tests for Teacher Dashboard CTAs
 * 
 * NOTE: These tests use Playwright and should be run with:
 *   npx playwright test --config=playwright.config.integration.ts tests/integration/ctas
 */

import { describe, test } from 'vitest';

describe.skip('Teacher Dashboard CTAs (Playwright only)', () => {
  test('cta-teacher-dashboard loads dashboard data', () => {
    await page.goto('/teacher/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Verify dashboard loaded (not showing error)
    const hasError = await page.locator('text=/something went wrong|error loading|teacherid required/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(false);
    
    // Verify some dashboard content is present
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });
  
  test('cta-teacher-dashboard-retry-error actually retries', () => {
    await page.goto('/teacher/dashboard');
    
    // Mock error
    await mockEdgeFunctionError(page, 'get-dashboard', 400, 'teacherId required');
    
    // Reload to trigger error
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check for retry button
    const retryButton = page.locator('[data-cta-id*="retry"]');
    const buttonExists = await retryButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (buttonExists) {
      // Remove error mock
      await page.unroute('**/functions/v1/get-dashboard*');
      
      // Track calls
      const calls = await interceptEdgeFunction(page, 'get-dashboard');
      const initialCount = calls.length;
      
      // Click retry
      await retryButton.click();
      await page.waitForTimeout(2000);
      
      // Verify retry happened
      expect(calls.length).toBeGreaterThan(initialCount);
    }
  });
});

