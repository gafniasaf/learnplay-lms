/**
 * E2E Tests: Edge Function Error Handling in Real Scenarios
 * 
 * Tests that edge function failures don't crash the app:
 * - Course editor handles CORS errors gracefully
 * - Logs page handles CORS errors gracefully
 * - Student dashboard handles missing studentId
 * - Error messages are user-friendly
 */

import { test, expect } from '@playwright/test';

test.describe('Edge Function Error Handling - E2E', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('course editor handles CORS errors gracefully', async ({ page }) => {
    // Navigate to course editor
    await page.goto('/admin/editor/test-course');
    await page.waitForLoadState('networkidle');

    // Check for error handling (should not crash)
    const errorBanner = page.locator('text=/CORS|preview|unavailable/i');
    const hasError = await errorBanner.isVisible({ timeout: 5000 }).catch(() => false);

    // Either no error (function works) or graceful error message
    if (hasError) {
      const errorText = await errorBanner.textContent();
      // Should be user-friendly, not raw API error
      expect(errorText).not.toContain('Access-Control-Allow-Origin');
      expect(errorText?.toLowerCase()).not.toMatch(/^[0-9]{3}/); // Not just status code
    }

    // Page should still be functional (not blank screen)
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toBeTruthy();
    expect(pageContent?.length).toBeGreaterThan(100); // Not just error message
  });

  test('logs page handles CORS errors gracefully', async ({ page }) => {
    await page.goto('/admin/logs');
    await page.waitForLoadState('networkidle');

    // Check for error handling
    const errorBanner = page.locator('text=/CORS|preview|unavailable|failed/i');
    const hasError = await errorBanner.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasError) {
      const errorText = await errorBanner.textContent();
      // Should be user-friendly
      expect(errorText).not.toContain('Access-Control-Allow-Origin');
      expect(errorText?.toLowerCase()).not.toMatch(/^[0-9]{3}/);
    }

    // Page should still render
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toBeTruthy();
  });

  test('student dashboard handles missing studentId gracefully', async ({ page }) => {
    // Navigate to student dashboard (as admin, might not have studentId)
    await page.goto('/kids');
    await page.waitForLoadState('networkidle');

    // Should either show dashboard or graceful error
    const errorBanner = page.locator('text=/studentId|required|error/i');
    const dashboard = page.locator('text=/dashboard|assignments|performance/i');

    const hasError = await errorBanner.isVisible({ timeout: 5000 }).catch(() => false);
    const hasDashboard = await dashboard.isVisible({ timeout: 5000 }).catch(() => false);

    // Should have one or the other, not crash
    expect(hasError || hasDashboard).toBe(true);

    if (hasError) {
      const errorText = await errorBanner.textContent();
      // Should be user-friendly
      expect(errorText).not.toMatch(/^[0-9]{3}/);
      expect(errorText?.toLowerCase()).not.toContain('raw');
    }
  });

  test('course selector handles org-config CORS errors', async ({ page }) => {
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    // Course selector might fail due to CORS, but page should still work
    const errorBanner = page.locator('text=/CORS|preview|unavailable/i');
    const courseList = page.locator('[data-testid*="course"], a[href*="/editor/"]');

    const hasError = await errorBanner.isVisible({ timeout: 5000 }).catch(() => false);
    const hasCourses = await courseList.count().then(c => c > 0).catch(() => false);

    // Page should still be functional
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toBeTruthy();

    // Error should be graceful if present
    if (hasError) {
      const errorText = await errorBanner.textContent();
      expect(errorText).not.toContain('Access-Control-Allow-Origin');
    }
  });

  test('assignments page handles CORS errors', async ({ page }) => {
    await page.goto('/kids');
    await page.waitForLoadState('networkidle');

    // Check for assignments or error
    const errorBanner = page.locator('text=/CORS|preview|unavailable|failed/i');
    const assignments = page.locator('text=/assignments|homework/i');

    const hasError = await errorBanner.isVisible({ timeout: 5000 }).catch(() => false);
    const hasAssignments = await assignments.isVisible({ timeout: 5000 }).catch(() => false);

    // Should handle gracefully
    expect(hasError || hasAssignments).toBe(true);

    if (hasError) {
      const errorText = await errorBanner.textContent();
      expect(errorText).not.toContain('Access-Control-Allow-Origin');
    }
  });

  test('no blank screens on edge function failures', async ({ page }) => {
    // Test multiple pages that might have edge function failures
    const pages = [
      '/admin/editor/test-course',
      '/admin/logs',
      '/admin/courses',
      '/kids',
    ];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      // Check that page has content (not blank)
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toBeTruthy();
      expect(bodyText?.length).toBeGreaterThan(50); // Not just error message

      // Check for React root (app loaded)
      const reactRoot = await page.locator('#root, [data-reactroot]').count();
      expect(reactRoot).toBeGreaterThan(0);
    }
  });
});

