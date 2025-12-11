/**
 * Integration tests for Student Dashboard CTAs
 * 
 * NOTE: These tests use Playwright and should be run with:
 *   npx playwright test --config=playwright.config.integration.ts tests/integration/ctas
 */

import { describe, test } from 'vitest';

describe.skip('Student Dashboard CTAs (Playwright only)', () => {
  test('cta-student-dashboard loads dashboard data', () => {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Verify dashboard loaded (not showing error)
    const hasError = await page.locator('text=/something went wrong|error loading|studentid required/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(false);
    
    // Verify some dashboard content is present
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });
});

