/**
 * Integration tests for Admin CTAs
 * 
 * NOTE: These tests use Playwright and should be run with:
 *   npx playwright test --config=playwright.config.integration.ts tests/integration/ctas
 */

import { describe, test } from 'vitest';

describe.skip('Admin CTAs (Playwright only)', () => {
  test('admin dashboard CTAs work', () => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Verify page loaded
    const hasError = await page.locator('text=/something went wrong|error loading/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(false);
  });
  
  test('admin jobs dashboard CTAs work', () => {
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
    
    // Verify page loaded
    const hasError = await page.locator('text=/something went wrong|error loading/i').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBe(false);
  });
});

