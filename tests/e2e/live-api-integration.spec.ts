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
    // Simulate offline mode
    await page.context().setOffline(true);
    
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Should show offline message or handle gracefully
    const hasOfflineMessage = await page.getByText(/offline|network|connection/i).isVisible({ timeout: 5000 }).catch(() => false);
    const stillWorks = await page.locator('body').textContent().then(t => t && t.length > 100);
    
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
    
    // Should redirect to auth
    await page.waitForURL(/\/auth/, { timeout: 10000 });
    expect(page.url()).toContain('/auth');
  });

  test('auth page loads correctly', async ({ page }) => {
    await page.goto('/auth');
    
    // Wait for auth form
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Verify auth UI elements
    const hasEmailInput = await page.locator('input[type="email"]').isVisible();
    const hasPasswordInput = await page.locator('input[type="password"]').isVisible();
    const hasSubmitButton = await page.locator('button[type="submit"]').isVisible();
    
    expect(hasEmailInput && hasPasswordInput && hasSubmitButton).toBeTruthy();
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

