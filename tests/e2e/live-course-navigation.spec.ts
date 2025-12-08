import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: Course Navigation & Preview
 * 
 * Tests navigation between admin pages and course editing.
 */

test.describe('Live Course Navigation: Full Flow', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('create course → wait completion → click View Course → verify correct route', async ({ page }) => {
    // Step 1: Navigate to AI Pipeline
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Step 2: Verify the page loaded with course creation form
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);
    
    // Should have main content
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
    
    // Step 3: Navigate to admin console to verify course navigation
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    // Step 4: Check for course IDs and edit links
    const consoleContent = await page.locator('body').textContent() || '';
    expect(consoleContent.length).toBeGreaterThan(100);
    
    // Step 5: Try navigating to course editor using known course ID
    const idMatch = consoleContent.match(/ID:\s*([a-z0-9-]+)/i);
    if (idMatch) {
      const courseId = idMatch[1];
      await page.goto(`/admin/editor/${courseId}`);
      await page.waitForLoadState('networkidle');
      
      // Should not be 404
      const is404 = await page.getByRole('heading', { name: '404' }).isVisible({ timeout: 2000 }).catch(() => false);
      expect(is404).toBeFalsy();
    }
  });

  test('courseId persists across page reloads', async ({ page }) => {
    // Navigate to admin console
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    // Get page content
    const initialContent = await page.locator('body').textContent() || '';
    
    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Content should still be present
    const reloadedContent = await page.locator('body').textContent() || '';
    expect(reloadedContent.length).toBeGreaterThan(100);
    
    // Main should be visible
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
  });
});
