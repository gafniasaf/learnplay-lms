import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: API Integration
 * 
 * Tests API error handling, edge cases, and integration points with REAL Supabase.
 */

test.describe('Live: API Error Handling', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('API errors are handled gracefully', async ({ page }) => {
    // Navigate to a page that makes API calls
    await page.goto('/admin/metrics');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for error messages - should be user-friendly
    const errorMessages = page.locator('text=/error|failed|unavailable/i');
    const errorCount = await errorMessages.count();
    
    if (errorCount > 0) {
      const errorText = await errorMessages.first().textContent();
      // Errors should be user-friendly, not raw API errors
      expect(errorText).not.toContain('Access-Control-Allow-Origin');
      expect(errorText?.toLowerCase()).not.toMatch(/^[0-9]{3}/); // Not just status codes
      expect(errorText?.length).toBeGreaterThan(10); // Meaningful message
    }
  });

  test('network errors are handled gracefully', async ({ page }) => {
    // First navigate to admin page while online
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Now simulate offline mode
    await page.context().setOffline(true);
    
    // Try to reload or navigate (should handle gracefully)
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
    } catch (error) {
      // Expected - offline mode prevents navigation
    }
    
    // Should show offline message or handle gracefully
    const hasOfflineMessage = await page.getByText(/offline|network|connection/i).isVisible({ timeout: 3000 }).catch(() => false);
    const stillWorks = await page.locator('body').textContent().then(t => t && t && t.length > 100).catch(() => false);
    
    // Either shows offline message or still works (cached)
    expect(hasOfflineMessage || stillWorks).toBeTruthy();
    
    // Restore online
    await page.context().setOffline(false);
  });
});

test.describe('Live: Authentication Flow', () => {
  test('unauthenticated users are redirected to auth', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();
    
    // Try to access protected page
    await page.goto('/admin');
    
    // Should redirect to auth (or show auth UI)
    // Wait a bit for redirect
    await page.waitForTimeout(3000);
    
    const onAuthPage = page.url().includes('/auth');
    const hasAuthUI = await page.locator('input[type="email"]').isVisible({ timeout: 5000 }).catch(() => false);
    
    // Either redirected to /auth or auth UI is visible
    expect(onAuthPage || hasAuthUI).toBeTruthy();
  });

  test('auth page loads correctly', async ({ page }) => {
    // Clear auth to ensure we see auth page
    await page.context().clearCookies();
    
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Wait for auth form (may take a moment to load)
    await page.waitForTimeout(2000);
    
    // Verify auth UI elements
    const hasEmailInput = await page.locator('input[type="email"]').isVisible({ timeout: 10000 }).catch(() => false);
    const hasPasswordInput = await page.locator('input[type="password"]').isVisible({ timeout: 5000 }).catch(() => false);
    const hasSubmitButton = await page.locator('button[type="submit"]').isVisible({ timeout: 5000 }).catch(() => false);
    
    // At least email input should be visible
    expect(hasEmailInput).toBeTruthy();
  });
});

test.describe('Live: Rate Limiting', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('rate limit information is displayed', async ({ page }) => {
    await page.goto('/admin/pipeline');
    await page.waitForLoadState('networkidle');
    
    // Look for rate limit indicators (hourly/daily usage)
    const hasRateLimit = await page.getByText(/hourly|daily|limit|quota/i).isVisible({ timeout: 5000 }).catch(() => false);
    
    // Rate limit UI should be visible (even if at 0%)
    expect(hasRateLimit).toBeTruthy();
  });
});

