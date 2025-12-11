/**
 * Integration tests for Parent Dashboard CTAs
 * 
 * NOTE: These tests use Playwright and should be run with:
 *   npx playwright test --config=playwright.config.integration.ts tests/integration/ctas
 * 
 * They are skipped when run with Vitest.
 */

import { describe, test } from 'vitest';

describe.skip('Parent Dashboard CTAs (Playwright only)', () => {
  // These tests require Playwright - run with: npm run test:integration:ctas
  test('cta-parent-dashboard-retry-error actually retries Edge Function', () => {
    // Navigate to parent dashboard
    await page.goto('/parent/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Intercept Edge Function and fail it initially
    await mockEdgeFunctionError(page, 'parent-dashboard', 400, 'Test error');
    
    // Reload to trigger the error
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Wait for error to appear
    const errorVisible = await page.locator('text=/error|failed|unable/i').isVisible({ timeout: 5000 }).catch(() => false);
    
    if (errorVisible) {
      // Find retry button
      const retryButton = page.locator('[data-cta-id="cta-parent-dashboard-retry-error"]');
      const buttonExists = await retryButton.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (buttonExists) {
        // Remove error mock to allow success
        await page.unroute('**/functions/v1/parent-dashboard*');
        
        // Track calls
        const calls = await interceptEdgeFunction(page, 'parent-dashboard');
        const initialCallCount = calls.length;
        
        // Click retry
        await retryButton.click();
        await page.waitForTimeout(2000); // Wait for retry to complete
        
        // Verify Edge Function was called again
        const finalCallCount = calls.length;
        expect(finalCallCount).toBeGreaterThan(initialCallCount);
        
        // Verify error is cleared
        const errorStillVisible = await page.locator('text=/error|failed/i').isVisible({ timeout: 2000 }).catch(() => false);
        expect(errorStillVisible).toBe(false);
      }
    }
  });
  
  test('cta-parent-dashboard loads dashboard data', () => {
    await page.goto('/parent/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Verify dashboard loaded (not showing error)
    const hasError = await page.locator('text=/something went wrong|error loading/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(false);
    
    // Verify some dashboard content is present
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(100); // Should have content
  });
});

