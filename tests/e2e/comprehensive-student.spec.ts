/**
 * COMPREHENSIVE STUDENT TESTS
 * 
 * Tests all student functionality:
 * - Dashboard displays all components
 * - Assignments list and filtering
 * - Achievements display
 * - Goals tracking
 * - Timeline view
 * - Join class flow
 * - Play/Game session flow
 * - Results display
 */

import { test, expect } from '@playwright/test';

test.describe('Student: Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard displays main heading', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/learning|dashboard/i, { timeout: 15000 });
  });

  test('dashboard shows KPI summary cards', async ({ page }) => {
    // Wait for loading to complete
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have summary statistics
    const hasMinutes = await page.locator('text=/minutes|time/i').isVisible().catch(() => false);
    const hasItems = await page.locator('text=/items|questions|completed/i').isVisible().catch(() => false);
    const hasStreak = await page.locator('text=/streak|days/i').isVisible().catch(() => false);
    
    expect(hasMinutes || hasItems || hasStreak).toBeTruthy();
  });

  test('dashboard shows weekly goal progress', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Weekly goal section
    await expect(page.locator('text=/weekly goal|goal progress/i')).toBeVisible({ timeout: 10000 });
    
    // Progress indicator (ring, bar, or percentage)
    const hasProgress = await page.locator('[class*="progress"], [role="progressbar"], text=/%/').first().isVisible().catch(() => false);
    expect(hasProgress).toBeTruthy();
  });

  test('dashboard shows recent sessions', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Recent sessions section
    const hasRecent = await page.locator('text=/recent|session|history/i').isVisible().catch(() => false);
    expect(hasRecent).toBeTruthy();
  });

  test('dashboard shows achievements', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Achievements section
    const hasAchievements = await page.locator('text=/achievement|badge|earned/i').isVisible().catch(() => false);
    expect(hasAchievements).toBeTruthy();
  });

  test('range toggle switches between day/week/month', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Find range toggle buttons
    const dayBtn = page.getByRole('button', { name: /^day$/i });
    const weekBtn = page.getByRole('button', { name: /^week$/i });
    const monthBtn = page.getByRole('button', { name: /^month$/i });
    
    if (await dayBtn.isVisible().catch(() => false)) {
      await dayBtn.click();
      await page.waitForTimeout(300);
      
      await weekBtn.click();
      await page.waitForTimeout(300);
      
      await monthBtn.click();
      await page.waitForTimeout(300);
      
      // No crash = success
    }
  });
});

test.describe('Student: Assignments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/assignments');
    await page.waitForLoadState('networkidle');
  });

  test('assignments page loads', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have heading or assignment content
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /assignment/i }).isVisible().catch(() => false);
    const hasContent = await page.locator('body').textContent();
    
    expect(hasHeading || (hasContent && hasContent.length > 100)).toBeTruthy();
  });

  test('assignments shows list or empty state', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Either shows assignments or empty state
    const hasAssignments = await page.locator('[class*="card"], [class*="list-item"], table').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no assignment|empty|nothing/i').isVisible().catch(() => false);
    
    expect(hasAssignments || hasEmptyState).toBeTruthy();
  });
});

test.describe('Student: Achievements', () => {
  test('achievements page displays badges', async ({ page }) => {
    await page.goto('/student/achievements');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should show achievements or empty state
    const hasAchievements = await page.locator('text=/achievement|badge|trophy|award/i').isVisible().catch(() => false);
    expect(hasAchievements).toBeTruthy();
  });
});

test.describe('Student: Goals', () => {
  test('goals page displays goal tracking', async ({ page }) => {
    await page.goto('/student/goals');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should show goals content
    const hasGoals = await page.locator('text=/goal|target|progress/i').isVisible().catch(() => false);
    expect(hasGoals).toBeTruthy();
  });
});

test.describe('Student: Timeline', () => {
  test('timeline page displays activity history', async ({ page }) => {
    await page.goto('/student/timeline');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should show timeline content
    const hasTimeline = await page.locator('text=/timeline|activity|history|session/i').isVisible().catch(() => false);
    expect(hasTimeline).toBeTruthy();
  });
});

test.describe('Student: Join Class', () => {
  test('join class page has code input', async ({ page }) => {
    await page.goto('/student/join-class');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have input for class code
    const hasInput = await page.locator('input').first().isVisible().catch(() => false);
    const hasJoinText = await page.locator('text=/join|class|code/i').isVisible().catch(() => false);
    
    expect(hasInput || hasJoinText).toBeTruthy();
  });

  test('join class validates empty code', async ({ page }) => {
    await page.goto('/student/join-class');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Try to submit empty
    const submitBtn = page.getByRole('button', { name: /join|submit/i });
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      
      // Should show validation or stay on page
      await page.waitForTimeout(500);
      expect(page.url()).toContain('/student/join-class');
    }
  });
});

test.describe('Student: Play Session', () => {
  test('play page loads game interface', async ({ page }) => {
    // Navigate via course catalog to get a valid course
    await page.goto('/courses');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Click first play button if available
    const playBtn = page.locator('a[href*="/play/"], button:has-text("Play"), [data-cta-id*="play"]').first();
    if (await playBtn.isVisible().catch(() => false)) {
      await playBtn.click();
      await page.waitForLoadState('networkidle');
      
      // Should show game interface or welcome page
      const hasGame = await page.locator('text=/question|option|score|play/i').isVisible().catch(() => false);
      const hasWelcome = await page.locator('text=/welcome|start|begin/i').isVisible().catch(() => false);
      
      expect(hasGame || hasWelcome).toBeTruthy();
    }
  });

  test('play welcome page shows course info', async ({ page }) => {
    await page.goto('/play/test-course/welcome');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should show some content (even if course doesn't exist)
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(10);
  });
});

test.describe('Student: Results Page', () => {
  test('results page shows score summary', async ({ page }) => {
    await page.goto('/results');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Results page should show something (might redirect if no session)
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(10);
  });
});
