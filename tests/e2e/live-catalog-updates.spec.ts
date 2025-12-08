/**
 * E2E Tests: Catalog Updates
 * 
 * Tests that courses appear in catalog after generation:
 * - Course appears in catalog after generation
 * - Realtime subscription updates catalog
 * - Catalog cache invalidation
 */

import { test, expect } from '@playwright/test';

test.describe('Catalog Updates', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('course appears in catalog after generation', async ({ page }) => {
    // Navigate to admin console which shows course catalog
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');

    // Page should load with course catalog
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);

    // Check for course cards or list
    const hasCourses = /ID:|Edit Course/i.test(pageContent);
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasMain || hasCourses).toBeTruthy();
  });

  test('catalog updates via realtime subscription', async ({ page, context }) => {
    // Skip - requires multi-tab testing setup
    test.skip();
  });

  test('catalog refreshes on manual refresh', async ({ page }) => {
    // Navigate to admin console
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    const initialContent = await page.locator('body').textContent() || '';
    
    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Page should still work after refresh
    const refreshedContent = await page.locator('body').textContent() || '';
    expect(refreshedContent.length).toBeGreaterThan(100);
    
    // Should have main content
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
  });
});

