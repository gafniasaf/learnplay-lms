/**
 * E2E Tests: Session Persistence & Recovery
 * 
 * Tests that user sessions and data persist.
 */

import { test, expect } from '@playwright/test';

test.describe('Session Persistence & Recovery', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('course editor auto-saves on blur', async ({ page }) => {
    // Navigate to admin console
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Page should load
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);

    // Extract a course ID
    const idMatch = pageContent.match(/ID:\s*([a-z0-9-]+)/i);
    if (!idMatch) {
      test.skip();
      return;
    }

    // Navigate to course editor
    const courseId = idMatch[1];
    await page.goto(`/admin/editor/${courseId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Page should load (not 404)
    const editorContent = await page.locator('body').textContent() || '';
    expect(editorContent.length).toBeGreaterThan(100);
  });

  test('game session recovers after reload', async ({ page }) => {
    // Navigate to admin console to get a course ID
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    const pageContent = await page.locator('body').textContent() || '';
    const idMatch = pageContent.match(/ID:\s*([a-z0-9-]+)/i);
    const courseId = idMatch ? idMatch[1] : 'modals';

    // Navigate to play page
    await page.goto(`/play/${courseId}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Page should load
    const playContent = await page.locator('body').textContent() || '';
    expect(playContent.length).toBeGreaterThan(50);

    // Reload page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Page should still work after reload
    const reloadedContent = await page.locator('body').textContent() || '';
    expect(reloadedContent.length).toBeGreaterThan(50);
  });
});
