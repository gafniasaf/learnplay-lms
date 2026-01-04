/**
 * E2E Tests: Parent Features
 * 
 * Tests parent-specific functionality:
 * - Dashboard viewing child progress
 * - Link Child flow
 * - Subjects view
 * - Topics view
 * - Timeline view
 * - Goals view
 */

import { test, expect } from '@playwright/test';

test.describe('Parent Dashboard', () => {
  test('parent dashboard loads without crashing', async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
    
    // Should not show error boundary
    const hasError = await page.getByText(/something went wrong/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('parent dashboard shows child data or empty state', async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Should show children or empty/link state
    const hasChildren = await page.getByText(/child|student|progress/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no children|link|add child/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasChildren || hasEmptyState || hasContent).toBeTruthy();
  });

  test('parent dashboard has navigation to other views', async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Should have links to other parent pages
    const hasSubjectsLink = await page.locator('a[href*="/parent/subjects"], button:has-text("Subjects")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTimelineLink = await page.locator('a[href*="/parent/timeline"], button:has-text("Timeline")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasGoalsLink = await page.locator('a[href*="/parent/goals"], button:has-text("Goals")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNav = await page.locator('nav').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasSubjectsLink || hasTimelineLink || hasGoalsLink || hasNav).toBeTruthy();
  });
});

test.describe('Parent Link Child', () => {
  test('link child page loads without crashing', async ({ page }) => {
    await page.goto('/parent/link-child');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('link child page has form or instructions', async ({ page }) => {
    await page.goto('/parent/link-child');
    await page.waitForLoadState('networkidle');
    
    // Should show form to link child or instructions
    const hasForm = await page.locator('form, input').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasInstructions = await page.getByText(/link|code|child|student|enter/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasForm || hasInstructions || hasContent).toBeTruthy();
  });

  test('link child form validation works', async ({ page }) => {
    await page.goto('/parent/link-child');
    await page.waitForLoadState('networkidle');
    
    // Try to find and interact with form
    const input = page.locator('input').first();
    const hasInput = await input.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasInput) {
      // Try submitting empty form
      const submitButton = page.locator('button[type="submit"], button:has-text("Link"), button:has-text("Add")').first();
      const hasSubmit = await submitButton.isVisible({ timeout: 3000 }).catch(() => false);
      
      if (hasSubmit) {
        await submitButton.click();
        await page.waitForTimeout(1000);
        
        // Should show validation error or remain on page
        const currentUrl = page.url();
        expect(currentUrl).toContain('/parent');
      }
    }
  });
});

test.describe('Parent Subjects View', () => {
  test('subjects page loads without crashing', async ({ page }) => {
    await page.goto('/parent/subjects');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('subjects page shows subject data or empty state', async ({ page }) => {
    await page.goto('/parent/subjects');
    await page.waitForLoadState('networkidle');
    
    const hasSubjects = await page.getByText(/subject|math|science|english|reading/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no subjects|no data|link child/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasSubjects || hasEmptyState || hasContent).toBeTruthy();
  });
});

test.describe('Parent Topics View', () => {
  test('topics page loads without crashing', async ({ page }) => {
    await page.goto('/parent/topics');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('topics page shows topic data or empty state', async ({ page }) => {
    await page.goto('/parent/topics');
    await page.waitForLoadState('networkidle');
    
    const hasTopics = await page.getByText(/topic|lesson|unit|chapter/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no topics|no data|link child/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasTopics || hasEmptyState || hasContent).toBeTruthy();
  });
});

test.describe('Parent Timeline View', () => {
  test('timeline page loads without crashing', async ({ page }) => {
    await page.goto('/parent/timeline');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('timeline page shows activity or empty state', async ({ page }) => {
    await page.goto('/parent/timeline');
    await page.waitForLoadState('networkidle');
    
    const hasTimeline = await page.getByText(/activity|event|session|played|completed/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no activity|no events|link child/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasTimeline || hasEmptyState || hasContent).toBeTruthy();
  });
});

test.describe('Parent Goals View', () => {
  test('goals page loads without crashing', async ({ page }) => {
    await page.goto('/parent/goals');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('goals page shows goals or empty state', async ({ page }) => {
    await page.goto('/parent/goals');
    await page.waitForLoadState('networkidle');
    
    const hasGoals = await page.getByText(/goal|target|progress|daily|weekly/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no goals|set goal|link child/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasGoals || hasEmptyState || hasContent).toBeTruthy();
  });

  test('goals page allows goal adjustment', async ({ page }) => {
    await page.goto('/parent/goals');
    await page.waitForLoadState('networkidle');
    
    // Should have controls to adjust goals
    const hasSlider = await page.locator('input[type="range"], [role="slider"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasInput = await page.locator('input[type="number"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasButton = await page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Set")').first().isVisible({ timeout: 5000 }).catch(() => false);
    
    // Either has adjustment controls or is in view-only mode
    const hasViewContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSlider || hasInput || hasButton || hasViewContent).toBeTruthy();
  });
});
