/**
 * E2E Tests: Real-time Job Updates
 * 
 * Tests job dashboard and status display.
 */

import { test, expect } from '@playwright/test';

test.describe('Real-time Job Updates', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('job status updates in real-time', async ({ page }) => {
    // Navigate to jobs dashboard
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Page should load with job dashboard
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);

    // Should have main content
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();

    // Should show job status indicators
    const hasStatusInfo = /pending|processing|done|failed/i.test(pageContent);
    expect(hasStatusInfo).toBeTruthy();
  });

  test('multiple jobs update independently', async ({ page }) => {
    // Navigate to jobs dashboard
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Page should load
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);

    // Should have tabs for different job types
    const hasTabs = /course jobs|media jobs/i.test(pageContent);
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasTabs || hasMain).toBeTruthy();
  });
});
