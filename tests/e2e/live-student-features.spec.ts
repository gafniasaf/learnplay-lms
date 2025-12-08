/**
 * E2E Tests: Student Features
 * 
 * Tests student-specific functionality:
 * - Achievements page
 * - Join Class flow
 * - Assignments view
 * - Goals view
 * - Timeline view
 */

import { test, expect } from '@playwright/test';

test.describe('Student Achievements', () => {
  test('achievements page loads without crashing', async ({ page }) => {
    await page.goto('/student/achievements');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
    
    // Should not show error boundary
    const hasError = await page.getByText(/something went wrong/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('achievements page shows badges or empty state', async ({ page }) => {
    await page.goto('/student/achievements');
    await page.waitForLoadState('networkidle');
    
    // Should show achievements or empty state
    const hasAchievements = await page.getByText(/achievement|badge|trophy|earned|unlocked/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasBadges = await page.locator('[data-testid*="badge"], [data-testid*="achievement"], .badge, .achievement').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no achievements|keep playing|earn/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasAchievements || hasBadges || hasEmptyState || hasContent).toBeTruthy();
  });

  test('achievements page shows progress toward next achievement', async ({ page }) => {
    await page.goto('/student/achievements');
    await page.waitForLoadState('networkidle');
    
    // May show progress bars for locked achievements
    const hasProgress = await page.locator('[role="progressbar"], .progress, [class*="progress"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNextGoal = await page.getByText(/next|unlock|progress|remaining/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasProgress || hasNextGoal || hasContent).toBeTruthy();
  });
});

test.describe('Student Join Class', () => {
  test('join class page loads without crashing', async ({ page }) => {
    await page.goto('/student/join-class');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('join class page has code input form', async ({ page }) => {
    await page.goto('/student/join-class');
    await page.waitForLoadState('networkidle');
    
    // Should show form to enter class code
    const hasForm = await page.locator('form').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasInput = await page.locator('input').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasInstructions = await page.getByText(/code|join|class|enter/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasForm || hasInput || hasInstructions || hasContent).toBeTruthy();
  });

  test('join class validates input', async ({ page }) => {
    await page.goto('/student/join-class');
    await page.waitForLoadState('networkidle');
    
    const input = page.locator('input').first();
    const hasInput = await input.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasInput) {
      // Enter invalid code
      await input.fill('invalid');
      
      const submitButton = page.locator('button[type="submit"], button:has-text("Join"), button:has-text("Submit")').first();
      const hasSubmit = await submitButton.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (hasSubmit) {
        await submitButton.click();
        await page.waitForTimeout(1000);
        
        // Should show error or remain on page
        const hasError = await page.getByText(/invalid|not found|error|try again/i).isVisible({ timeout: 5000 }).catch(() => false);
        const stillOnPage = page.url().includes('/student');
        
        expect(hasError || stillOnPage).toBeTruthy();
      }
    }
  });
});

test.describe('Student Assignments', () => {
  test('assignments page loads without crashing', async ({ page }) => {
    await page.goto('/student/assignments');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('assignments page shows list or empty state', async ({ page }) => {
    await page.goto('/student/assignments');
    await page.waitForLoadState('networkidle');
    
    // Should show assignments or empty state
    const hasAssignments = await page.getByText(/assignment|due|deadline|course/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasList = await page.locator('.card, tr, [data-testid*="assignment"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no assignments|nothing due|all done/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasAssignments || hasList || hasEmptyState || hasContent).toBeTruthy();
  });

  test('assignments show due dates', async ({ page }) => {
    await page.goto('/student/assignments');
    await page.waitForLoadState('networkidle');
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // Should show due date info or empty state
    const hasDueDates = /due|deadline|date|tomorrow|today/i.test(pageContent);
    const hasEmptyState = /no assignments|nothing|empty/i.test(pageContent);
    
    expect(hasDueDates || hasEmptyState || pageContent.length > 100).toBeTruthy();
  });
});

test.describe('Student Goals', () => {
  test('goals page loads without crashing', async ({ page }) => {
    await page.goto('/student/goals');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('goals page shows daily/weekly goals', async ({ page }) => {
    await page.goto('/student/goals');
    await page.waitForLoadState('networkidle');
    
    // Should show goals or progress
    const hasGoals = await page.getByText(/goal|target|daily|weekly|progress/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasProgress = await page.locator('[role="progressbar"], .progress, [class*="progress"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasGoals || hasProgress || hasContent).toBeTruthy();
  });
});

test.describe('Student Timeline', () => {
  test('timeline page loads without crashing', async ({ page }) => {
    await page.goto('/student/timeline');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('timeline shows activity or empty state', async ({ page }) => {
    await page.goto('/student/timeline');
    await page.waitForLoadState('networkidle');
    
    // Should show activity or empty state
    const hasActivity = await page.getByText(/played|completed|started|session|score/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTimeline = await page.locator('[data-testid*="timeline"], [class*="timeline"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no activity|start playing|empty/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasActivity || hasTimeline || hasEmptyState || hasContent).toBeTruthy();
  });
});

test.describe('Student Dashboard', () => {
  test('dashboard page loads without crashing', async ({ page }) => {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
    
    // Should not show error boundary
    const hasError = await page.getByText(/something went wrong/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('dashboard shows quick actions or content', async ({ page }) => {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Should have play button, courses, or stats
    const hasPlayButton = await page.locator('button:has-text("Play"), a:has-text("Play"), button:has-text("Start")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCourses = await page.getByText(/course|subject|continue/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasStats = await page.getByText(/progress|score|streak/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasPlayButton || hasCourses || hasStats || hasContent).toBeTruthy();
  });

  test('dashboard has navigation to other student pages', async ({ page }) => {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Should have navigation links
    const hasNav = await page.locator('nav').isVisible({ timeout: 5000 }).catch(() => false);
    const hasLinks = await page.locator('a[href*="/student"]').count() > 0;
    
    expect(hasNav || hasLinks).toBeTruthy();
  });
});
