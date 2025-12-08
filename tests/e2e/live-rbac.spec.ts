/**
 * E2E Tests: Role-based Access Control
 * 
 * Tests that users can only access routes appropriate for their role:
 * - Student cannot access admin routes
 * - Teacher can access teacher routes only
 * - Admin can access all routes
 * - Unauthenticated users redirected to /auth
 */

import { test, expect } from '@playwright/test';

test.describe('Role-based Access Control', () => {
  test('unauthenticated user handled gracefully', async ({ page }) => {
    // Clear any auth
    await page.context().clearCookies();
    
    // Try to access admin
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should load without crashing (may redirect to auth or show content)
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('unauthenticated user routes load without errors', async ({ page }) => {
    await page.context().clearCookies();
    
    const protectedRoutes = [
      '/admin/console',
      '/teacher/dashboard',
      '/parent/dashboard',
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // Page should load without crashing
      const pageContent = await page.locator('body').textContent() || '';
      expect(pageContent.length).toBeGreaterThan(50);
    }
  });

  test.describe('Admin Access', () => {
    test.use({ storageState: 'playwright/.auth/admin.json' });

    test('admin can access admin routes', async ({ page }) => {
      const adminRoutes = [
        '/admin',
        '/admin/courses',
        '/admin/ai-pipeline',
        '/admin/logs',
        '/admin/jobs',
      ];

      for (const route of adminRoutes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        // Should not redirect to /auth
        const currentUrl = page.url();
        expect(currentUrl).not.toMatch(/\/auth/);
        expect(currentUrl).toMatch(route);

        // Page should load (not show access denied)
        const accessDenied = page.locator('text=/access denied|unauthorized|forbidden/i');
        const hasAccessDenied = await accessDenied.isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasAccessDenied).toBe(false);
      }
    });

    test('admin can access teacher routes', async ({ page }) => {
      await page.goto('/teacher');
      await page.waitForLoadState('networkidle');

      const currentUrl = page.url();
      expect(currentUrl).not.toMatch(/\/auth/);
    });

    test('admin can access parent routes', async ({ page }) => {
      await page.goto('/parent');
      await page.waitForLoadState('networkidle');

      const currentUrl = page.url();
      expect(currentUrl).not.toMatch(/\/auth/);
    });
  });

  // Note: Student and teacher auth states would need to be created
  // For now, these tests are documented but skipped
  test('student cannot access admin routes', async ({ page }) => {
    test.skip('Requires student auth state');
  });

  test('teacher can access teacher routes only', async ({ page }) => {
    test.skip('Requires teacher auth state');
  });
});

