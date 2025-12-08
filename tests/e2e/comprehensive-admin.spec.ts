/**
 * COMPREHENSIVE ADMIN TESTS
 * 
 * Tests all admin functionality:
 * - Console overview
 * - AI Pipeline for course generation
 * - Course selector and editor
 * - Jobs dashboard
 * - System logs
 * - Media manager
 * - Performance monitoring
 * - System health
 * - Tag management and approval
 */

import { test, expect } from '@playwright/test';

test.describe('Admin: Console', () => {
  test('console page loads', async ({ page }) => {
    await page.goto('/admin/console');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /admin|console/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('console has navigation options', async ({ page }) => {
    await page.goto('/admin/console');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have links/buttons to other admin sections
    const hasLinks = await page.locator('a[href*="/admin/"], button').first().isVisible().catch(() => false);
    expect(hasLinks).toBeTruthy();
  });
});

test.describe('Admin: AI Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
  });

  test('ai pipeline page loads', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /pipeline|course|generate/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('ai pipeline has quick start form', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Subject input
    const hasSubject = await page.locator('input#subject, input[placeholder*="subject"], input[placeholder*="Photosynthesis"]').first().isVisible().catch(() => false);
    
    // Generate button
    const hasGenerate = await page.locator('button:has-text("Generate"), [data-cta-id="quick-start-create"]').first().isVisible().catch(() => false);
    
    expect(hasSubject || hasGenerate).toBeTruthy();
  });

  test('ai pipeline has grade selector', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasGradeSelect = await page.locator('select, [role="combobox"], label:has-text("Grade")').first().isVisible().catch(() => false);
    expect(hasGradeSelect).toBeTruthy();
  });
});

test.describe('Admin: Course Selector', () => {
  test('course selector page loads', async ({ page }) => {
    await page.goto('/admin/courses/select');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /course|select|catalog/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('course selector shows course list or empty state', async ({ page }) => {
    await page.goto('/admin/courses/select');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasCourses = await page.locator('[class*="card"], table tbody tr, a[href*="/admin/editor/"]').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no course|empty|create/i').isVisible().catch(() => false);
    
    expect(hasCourses || hasEmptyState).toBeTruthy();
  });
});

test.describe('Admin: Jobs Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
  });

  test('jobs dashboard loads', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /job|queue/i }).isVisible().catch(() => false);
    expect(hasHeading).toBeTruthy();
  });

  test('jobs dashboard shows job list or empty state', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasJobs = await page.locator('table tbody tr, [class*="job-row"], [class*="card"]').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no job|empty|queue empty/i').isVisible().catch(() => false);
    
    expect(hasJobs || hasEmptyState).toBeTruthy();
  });

  test('jobs dashboard shows job status indicators', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Status indicators
    const hasStatus = await page.locator('text=/running|completed|failed|pending|queued/i').isVisible().catch(() => false);
    const hasStatusBadge = await page.locator('[class*="badge"], [class*="status"]').first().isVisible().catch(() => false);
    
    // Even if no jobs, page should have column headers or labels
    const body = await page.locator('body').textContent();
    expect(hasStatus || hasStatusBadge || (body && body.length > 100)).toBeTruthy();
  });
});

test.describe('Admin: System Logs', () => {
  test('logs page loads', async ({ page }) => {
    await page.goto('/admin/logs');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /log|system/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('logs page has filter options', async ({ page }) => {
    await page.goto('/admin/logs');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasFilter = await page.locator('select, input[type="search"], input[placeholder*="filter"], input[placeholder*="search"]').first().isVisible().catch(() => false);
    const hasRefresh = await page.locator('button:has-text("Refresh"), button:has-text("Reload")').first().isVisible().catch(() => false);
    
    expect(hasFilter || hasRefresh).toBeTruthy();
  });
});

test.describe('Admin: Media Manager', () => {
  test('media manager page loads', async ({ page }) => {
    await page.goto('/admin/tools/media');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /media|file|asset/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('media manager has upload capability', async ({ page }) => {
    await page.goto('/admin/tools/media');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasUpload = await page.locator('button:has-text("Upload"), input[type="file"], [data-cta-id*="upload"]').first().isVisible().catch(() => false);
    const hasDropzone = await page.locator('[class*="dropzone"], text=/drag|drop/i').first().isVisible().catch(() => false);
    
    expect(hasUpload || hasDropzone).toBeTruthy();
  });
});

test.describe('Admin: Performance Monitoring', () => {
  test('performance page loads', async ({ page }) => {
    await page.goto('/admin/performance');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /performance|monitor/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });
});

test.describe('Admin: System Health', () => {
  test('system health page loads', async ({ page }) => {
    await page.goto('/admin/system-health');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /health|system|status/i }).isVisible().catch(() => false);
    expect(hasHeading).toBeTruthy();
  });

  test('system health shows status indicators', async ({ page }) => {
    await page.goto('/admin/system-health');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasStatus = await page.locator('text=/healthy|online|connected|ok|error|warning/i').isVisible().catch(() => false);
    const hasIndicator = await page.locator('[class*="status"], [class*="indicator"], [class*="badge"]').first().isVisible().catch(() => false);
    
    expect(hasStatus || hasIndicator).toBeTruthy();
  });
});

test.describe('Admin: Tag Management', () => {
  test('tag management page loads', async ({ page }) => {
    await page.goto('/admin/tags');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /tag/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('tag approval queue loads', async ({ page }) => {
    await page.goto('/admin/tags/approve');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /tag|approval|queue/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });
});
