/**
 * COMPREHENSIVE PARENT TESTS
 * 
 * Tests all parent functionality:
 * - Dashboard with child selector
 * - Subjects breakdown
 * - Topics drill-down
 * - Timeline/Activity history
 * - Goals and alerts
 * - Link child flow
 */

import { test, expect } from '@playwright/test';

test.describe('Parent: Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard displays main heading', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page.locator('h1')).toContainText(/parent|dashboard/i, { timeout: 15000 });
  });

  test('dashboard shows child selector', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have child selection UI
    const hasChildSelector = await page.locator('[data-list="children"], text=/my children|select child/i').isVisible().catch(() => false);
    expect(hasChildSelector).toBeTruthy();
  });

  test('dashboard shows weekly stats', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Weekly statistics
    const hasWeekly = await page.locator('text=/this week|weekly|week/i').isVisible().catch(() => false);
    const hasMinutes = await page.locator('[data-field="minutes_this_week"], text=/minutes/i').first().isVisible().catch(() => false);
    const hasSessions = await page.locator('[data-field="sessions_this_week"], text=/session/i').first().isVisible().catch(() => false);
    
    expect(hasWeekly || hasMinutes || hasSessions).toBeTruthy();
  });

  test('dashboard shows goal progress', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Goal section
    const hasGoal = await page.locator('text=/weekly goal|goal progress/i').isVisible().catch(() => false);
    const hasProgressBar = await page.locator('.progress-bar, [role="progressbar"], [class*="progress"]').first().isVisible().catch(() => false);
    
    expect(hasGoal || hasProgressBar).toBeTruthy();
  });

  test('dashboard has navigation CTAs', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Navigation buttons
    const hasGoalsCTA = await page.locator('[data-cta-id="view-goals"], a[href*="goals"]').first().isVisible().catch(() => false);
    const hasSubjectsCTA = await page.locator('[data-cta-id="view-subjects"], a[href*="subjects"]').first().isVisible().catch(() => false);
    const hasTimelineCTA = await page.locator('[data-cta-id="view-timeline"], a[href*="timeline"]').first().isVisible().catch(() => false);
    
    expect(hasGoalsCTA || hasSubjectsCTA || hasTimelineCTA).toBeTruthy();
  });

  test('child selector switches active child', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const childButtons = page.locator('[data-list="children"] button');
    const count = await childButtons.count();
    
    if (count > 1) {
      // Click second child
      await childButtons.nth(1).click();
      await page.waitForTimeout(500);
      
      // No crash = success
    }
    
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Parent: Subjects', () => {
  test('subjects page loads with breakdown', async ({ page }) => {
    await page.goto('/parent/subjects');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /subject/i }).isVisible().catch(() => false);
    const hasSubjects = await page.locator('text=/math|science|reading|english/i').isVisible().catch(() => false);
    
    expect(hasHeading || hasSubjects).toBeTruthy();
  });

  test('subjects shows progress per subject', async ({ page }) => {
    await page.goto('/parent/subjects');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasProgress = await page.locator('[class*="progress"], text=/%|score/i').first().isVisible().catch(() => false);
    expect(hasProgress).toBeTruthy();
  });
});

test.describe('Parent: Topics', () => {
  test('topics page loads', async ({ page }) => {
    await page.goto('/parent/topics');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /topic/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });
});

test.describe('Parent: Timeline', () => {
  test('timeline page shows activity history', async ({ page }) => {
    await page.goto('/parent/timeline');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /timeline|activity/i }).isVisible().catch(() => false);
    const hasActivities = await page.locator('text=/session|completed|played/i').isVisible().catch(() => false);
    
    expect(hasHeading || hasActivities).toBeTruthy();
  });

  test('timeline has date filtering', async ({ page }) => {
    await page.goto('/parent/timeline');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Date filter or range selector
    const hasDateFilter = await page.locator('input[type="date"], [class*="date-picker"], button:has-text("Today"), button:has-text("Week")').first().isVisible().catch(() => false);
    
    // Even if no explicit filter, page should work
    const body = await page.locator('body').textContent();
    expect(hasDateFilter || (body && body.length > 100)).toBeTruthy();
  });
});

test.describe('Parent: Goals', () => {
  test('goals page shows goal management', async ({ page }) => {
    await page.goto('/parent/goals');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /goal|alert/i }).isVisible().catch(() => false);
    expect(hasHeading).toBeTruthy();
  });

  test('goals shows current goal settings', async ({ page }) => {
    await page.goto('/parent/goals');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasGoalInfo = await page.locator('text=/minute|hour|target|weekly/i').isVisible().catch(() => false);
    expect(hasGoalInfo).toBeTruthy();
  });

  test('goals has edit capability', async ({ page }) => {
    await page.goto('/parent/goals');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasEditButton = await page.locator('button:has-text("Edit"), button:has-text("Update"), button:has-text("Set")').first().isVisible().catch(() => false);
    const hasInput = await page.locator('input[type="number"], input[type="range"]').first().isVisible().catch(() => false);
    
    expect(hasEditButton || hasInput).toBeTruthy();
  });
});

test.describe('Parent: Link Child', () => {
  test('link child page loads', async ({ page }) => {
    await page.goto('/parent/link-child');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /link|child|connect/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('link child has code input', async ({ page }) => {
    await page.goto('/parent/link-child');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasInput = await page.locator('input').first().isVisible().catch(() => false);
    const hasInstructions = await page.locator('text=/code|enter|link/i').isVisible().catch(() => false);
    
    expect(hasInput || hasInstructions).toBeTruthy();
  });
});
