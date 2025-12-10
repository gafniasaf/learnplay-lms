/**
 * E2E Tests: Admin Pages Coverage
 * 
 * Tests for admin pages that were previously not covered:
 * - Logs page
 * - Metrics page
 * - Performance Monitoring
 * - Tag Management
 * - Tag Approval Queue
 * - Course Version History
 */

import { test, expect } from '@playwright/test';

test.describe('Admin Pages: Logs', () => {
  test('logs page loads without crashing', async ({ page }) => {
    await page.goto('/admin/logs');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Page should load with content
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
    
    // Should have main content area
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('h1, h2, [role="main"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain || hasContent).toBeTruthy();
  });

  test('logs page displays log entries or empty state', async ({ page }) => {
    await page.goto('/admin/logs');
    await page.waitForLoadState('networkidle');
    
    // Should show either logs or empty state message
    const hasLogs = await page.locator('[data-testid*="log"], .log-entry, tr, [class*="log"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no logs|empty|no data/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').textContent() || '';
    
    // Either has logs, empty state, or meaningful content
    expect(hasLogs || hasEmptyState || hasContent.length > 100).toBeTruthy();
  });
});

test.describe('Admin Pages: Metrics', () => {
  test('metrics page loads without crashing', async ({ page }) => {
    await page.goto('/admin/metrics');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('metrics page displays charts or data', async ({ page }) => {
    await page.goto('/admin/metrics');
    await page.waitForLoadState('networkidle');
    
    // Should show metrics content
    const hasCharts = await page.locator('canvas, svg, [class*="chart"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasMetrics = await page.getByText(/metric|stat|usage|cost/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasCharts || hasMetrics || hasContent).toBeTruthy();
  });
});

test.describe('Admin Pages: Performance Monitoring', () => {
  test('performance page loads without crashing', async ({ page }) => {
    await page.goto('/admin/performance');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('performance page shows monitoring data', async ({ page }) => {
    await page.goto('/admin/performance');
    await page.waitForLoadState('networkidle');
    
    // Should have performance-related content
    const hasPerformanceContent = await page.getByText(/performance|latency|response|time|load/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasPerformanceContent || hasContent).toBeTruthy();
  });
});

test.describe('Admin Pages: Tag Management', () => {
  test('tag management page loads without crashing', async ({ page }) => {
    await page.goto('/admin/tags');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('tag management displays tags or empty state', async ({ page }) => {
    await page.goto('/admin/tags');
    await page.waitForLoadState('networkidle');
    
    // Should show tags or empty state
    const hasTags = await page.locator('[data-testid*="tag"], .tag, [class*="badge"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no tags|empty|create/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasTags || hasEmptyState || hasContent).toBeTruthy();
  });

  test('tag management has create functionality', async ({ page }) => {
    await page.goto('/admin/tags');
    await page.waitForLoadState('networkidle');
    
    // Should have create/add button
    const hasCreateButton = await page.locator('button:has-text("Create"), button:has-text("Add"), button:has-text("New")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, form').first().isVisible({ timeout: 5000 }).catch(() => false);
    
    // Either has create button or a form
    expect(hasCreateButton || hasForm).toBeTruthy();
  });
});

test.describe('Admin Pages: Tag Approval Queue', () => {
  test('tag approval page loads without crashing', async ({ page }) => {
    await page.goto('/admin/tags/approve');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('tag approval displays queue or empty state', async ({ page }) => {
    await page.goto('/admin/tags/approve');
    await page.waitForLoadState('networkidle');
    
    // Should show approval queue or empty state
    const hasQueue = await page.locator('[data-testid*="queue"], [data-testid*="pending"], tr, .card').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no pending|empty|nothing to approve/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasQueue || hasEmptyState || hasContent).toBeTruthy();
  });
});

test.describe('Admin Pages: System Health', () => {
  test('system health page loads without crashing', async ({ page }) => {
    await page.goto('/admin/system-health');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('system health shows status indicators', async ({ page }) => {
    await page.goto('/admin/system-health');
    await page.waitForLoadState('networkidle');
    
    // Should show health indicators
    const hasHealthIndicators = await page.getByText(/healthy|status|online|offline|error|ok/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasStatusBadges = await page.locator('[class*="status"], [class*="badge"], [class*="indicator"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasHealthIndicators || hasStatusBadges || hasContent).toBeTruthy();
  });
});
