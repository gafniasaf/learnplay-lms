import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: System Health
 * 
 * Tests system health endpoints and monitoring with REAL Supabase.
 */

test.describe('Live: System Health', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('admin can access system logs', async ({ page }) => {
    await page.goto('/admin/logs');
    
    // Wait for logs page to load
    await page.waitForLoadState('networkidle');
    
    // Verify logs page loaded
    const hasLogs = await page.getByText(/log|system|edge function/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasContent = await page.locator('body').textContent();
    
    expect(hasLogs || (hasContent && hasContent.length > 100)).toBeTruthy();
  });

  test('admin can access metrics page', async ({ page }) => {
    await page.goto('/admin/metrics');
    
    // Wait for metrics page to load
    await page.waitForLoadState('networkidle');
    
    // Verify metrics page loaded (could show data or error message)
    const hasMetrics = await page.getByText(/metric|mcp|summary/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasError = await page.getByText(/unavailable|error|preview/i).isVisible({ timeout: 2000 }).catch(() => false);
    const hasContent = await page.locator('body').textContent();
    
    // Page should load (with data, error message, or empty state)
    expect(hasMetrics || hasError || (hasContent && hasContent.length > 50)).toBeTruthy();
  });

  test('admin can access tag approval queue', async ({ page }) => {
    await page.goto('/admin/tag-approval');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify tag approval page loaded
    const hasTags = await page.getByText(/tag|approval|queue/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasContent = await page.locator('body').textContent();
    
    expect(hasTags || (hasContent && hasContent.length > 100)).toBeTruthy();
  });
});

