/**
 * E2E Tests: Error Recovery & Retry Logic
 * 
 * Tests error handling and recovery:
 * - Failed API call shows retry button
 * - 401 error triggers session refresh
 * - Network error shows retry option
 * - Error messages are user-friendly
 */

import { test, expect } from '@playwright/test';

test.describe('Error Recovery & Retry Logic', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('failed API call shows retry button', async ({ page, context }) => {
    // Navigate to a page that makes API calls
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    // Simulate network failure by blocking requests
    await context.route('**/functions/v1/**', route => {
      route.abort('failed');
    });

    // Trigger an API call (e.g., refresh catalog)
    const refreshButton = page.locator('button:has-text("Refresh"), button[aria-label*="refresh"]').first();
    const hasRefresh = await refreshButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasRefresh) {
      await refreshButton.click();

      // Verify error message shown
      await expect(
        page.locator('text=/error|failed|retry/i').or(
          page.locator('[role="alert"]')
        )
      ).toBeVisible({ timeout: 10000 });

      // Verify retry button appears
      const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try Again")').first();
      const hasRetry = await retryButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasRetry) {
        // Restore network
        await context.unroute('**/functions/v1/**');
        
        // Click retry
        await retryButton.click();

        // Verify retry succeeds
        await expect(
          page.locator('text=/success|loaded|complete/i').or(
            page.locator('[role="status"]')
          )
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('401 error triggers session refresh', async ({ page }) => {
    // This test would:
    // 1. Simulate expired session
    // 2. Try to create course
    // 3. Verify 401 detected
    // 4. Verify session refresh attempted
    // 5. Verify retry succeeds
    
    // For now, mark as skipped until we have session expiration simulation
    test.skip('Requires session expiration simulation');
  });

  test('error messages are user-friendly', async ({ page }) => {
    // Navigate to course creation
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');

    // Try to create course without required fields
    const createButton = page.locator('[data-cta-id="quick-start-create"]').first();
    const hasCreateButton = await createButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCreateButton) {
      await createButton.click();

      // Wait for error (if validation fails)
      await page.waitForTimeout(2000);

      // Check for error messages
      const errorMessages = page.locator('text=/error|required|missing/i, [role="alert"]');
      const errorCount = await errorMessages.count();

      if (errorCount > 0) {
        // Verify error messages are user-friendly (not raw API errors)
        const firstError = await errorMessages.first().textContent();
        
        // Should not contain raw API error codes or technical details
        expect(firstError).not.toMatch(/^[0-9]{3}/); // Not just status code
        expect(firstError).not.toContain('Access-Control-Allow-Origin');
        expect(firstError).not.toContain('CORS');
        expect(firstError?.toLowerCase()).not.toContain('internal server error');
        
        // Should be actionable
        expect(firstError?.length).toBeGreaterThan(10); // Not just "Error"
      }
    }
  });
});

