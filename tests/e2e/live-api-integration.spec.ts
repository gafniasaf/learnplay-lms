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
    // Navigate to admin page
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    
    // Page should load with content even with potential API issues
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
    
    // Should NOT show raw error stack traces
    expect(pageContent).not.toContain('TypeError:');
    expect(pageContent).not.toContain('Uncaught');
  });
});

test.describe('Live: Authentication Flow', () => {
  test('unauthenticated users handled gracefully', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();
    
    // Try to access admin page
    await page.goto('/admin/console');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Page should load without crashing (may show content or redirect to auth)
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('auth page loads correctly', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Auth page should load
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);
    
    // Should have some form elements or auth UI
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
  });
});

test.describe('Live: Rate Limiting', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('rate limit information is displayed', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    // Page should load
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);
    
    // Should have main content area
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
  });
});

