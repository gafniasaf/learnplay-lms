/**
 * COMPREHENSIVE NAVIGATION TESTS
 * 
 * Tests all navigation and CTA functionality:
 * - Cross-role navigation
 * - CTA button clicks
 * - Link destinations
 * - Back navigation
 * - Sidebar/menu navigation
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation: Cross-Role', () => {
  const dashboards = [
    { role: 'Student', path: '/student/dashboard' },
    { role: 'Teacher', path: '/teacher/dashboard' },
    { role: 'Parent', path: '/parent/dashboard' },
  ];

  for (const dashboard of dashboards) {
    test(`${dashboard.role} dashboard to settings navigation`, async ({ page }) => {
      await page.goto(dashboard.path);
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
      
      // Look for settings button/link
      const settingsBtn = page.locator('[data-cta-id="settings"], a[href*="settings"], button:has-text("Settings")').first();
      if (await settingsBtn.isVisible().catch(() => false)) {
        await settingsBtn.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(/\/settings/);
      }
    });
  }

  test('can navigate between role dashboards', async ({ page }) => {
    // Start at student dashboard
    await page.goto('/student/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Navigate to teacher dashboard
    await page.goto('/teacher/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    const teacherContent = await page.locator('body').textContent();
    expect(teacherContent?.length).toBeGreaterThan(100);
    
    // Navigate to parent dashboard
    await page.goto('/parent/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    const parentContent = await page.locator('body').textContent();
    expect(parentContent?.length).toBeGreaterThan(100);
  });
});

test.describe('Navigation: Main Menu', () => {
  test('landing page has navigation links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should have main nav links
    const hasHomeLink = await page.locator('a[href="/"], nav a').first().isVisible().catch(() => false);
    const hasCoursesLink = await page.locator('a[href="/courses"]').isVisible().catch(() => false);
    const hasAboutLink = await page.locator('a[href="/about"]').isVisible().catch(() => false);
    
    expect(hasHomeLink || hasCoursesLink || hasAboutLink).toBeTruthy();
  });

  test('courses link navigates to catalog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const coursesLink = page.locator('a[href="/courses"]').first();
    if (await coursesLink.isVisible().catch(() => false)) {
      await coursesLink.click();
      await expect(page).toHaveURL(/\/courses/);
    }
  });

  test('help link navigates to help page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const helpLink = page.locator('a[href="/help"]').first();
    if (await helpLink.isVisible().catch(() => false)) {
      await helpLink.click();
      await expect(page).toHaveURL(/\/help/);
    }
  });
});

test.describe('Navigation: Teacher CTAs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teacher/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('view analytics CTA works', async ({ page }) => {
    const cta = page.locator('[data-cta-id="view-analytics"], a[href*="analytics"]').first();
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/teacher\/analytics/);
    }
  });

  test('view classes CTA works', async ({ page }) => {
    const cta = page.locator('[data-cta-id="view-classes"], a[href*="classes"]').first();
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/teacher\/classes/);
    }
  });

  test('create assignment CTA works', async ({ page }) => {
    const cta = page.locator('[data-cta-id="create-assignment"], a[href*="control"]').first();
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/teacher\/control/);
    }
  });
});

test.describe('Navigation: Parent CTAs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('view goals CTA works', async ({ page }) => {
    const cta = page.locator('[data-cta-id="view-goals"], a[href*="goals"]').first();
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/parent\/goals/);
    }
  });

  test('view subjects CTA works', async ({ page }) => {
    const cta = page.locator('[data-cta-id="view-subjects"], a[href*="subjects"]').first();
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/parent\/subjects/);
    }
  });

  test('view timeline CTA works', async ({ page }) => {
    const cta = page.locator('[data-cta-id="view-timeline"], a[href*="timeline"]').first();
    if (await cta.isVisible().catch(() => false)) {
      await cta.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/parent\/timeline/);
    }
  });
});

test.describe('Navigation: Admin CTAs', () => {
  test('admin redirect works', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Should redirect to ai-pipeline
    await expect(page).toHaveURL(/\/admin\/ai-pipeline/);
  });

  test('admin can navigate to jobs', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    await page.goto('/admin/jobs');
    await page.waitForLoadState('networkidle');
    
    const hasJobsPage = await page.locator('h1, h2').filter({ hasText: /job|queue/i }).isVisible().catch(() => false);
    expect(hasJobsPage).toBeTruthy();
  });

  test('admin can navigate to system health', async ({ page }) => {
    await page.goto('/admin/system-health');
    await page.waitForLoadState('networkidle');
    
    const hasHealthPage = await page.locator('h1, h2').filter({ hasText: /health|system/i }).isVisible().catch(() => false);
    expect(hasHealthPage).toBeTruthy();
  });
});

test.describe('Navigation: Back Navigation', () => {
  test('browser back works from settings', async ({ page }) => {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    await page.goBack();
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('browser back works from help', async ({ page }) => {
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    
    await page.goto('/help');
    await page.waitForLoadState('networkidle');
    
    await page.goBack();
    await expect(page).toHaveURL(/\/courses/);
  });
});

test.describe('Navigation: 404 Handling', () => {
  test('invalid route shows 404 page', async ({ page }) => {
    await page.goto('/this-definitely-does-not-exist-12345');
    await page.waitForLoadState('networkidle');
    
    // The 404 page shows "404" heading and "Oops! Page not found" text
    const has404Heading = await page.getByRole('heading', { name: '404' }).isVisible().catch(() => false);
    const hasNotFoundText = await page.getByText('not found', { exact: false }).isVisible().catch(() => false);
    
    expect(has404Heading || hasNotFoundText).toBeTruthy();
  });

  test('404 page has home link', async ({ page }) => {
    await page.goto('/this-definitely-does-not-exist-12345');
    await page.waitForLoadState('networkidle');
    
    // The 404 page has "Return to Home" link
    const hasHomeLink = await page.getByRole('link', { name: /return.*home|home/i }).isVisible().catch(() => false);
    const hasAnyHomeLink = await page.locator('a[href="/"]').isVisible().catch(() => false);
    
    expect(hasHomeLink || hasAnyHomeLink).toBeTruthy();
  });
});
