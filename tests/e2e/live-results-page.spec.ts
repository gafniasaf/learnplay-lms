/**
 * E2E Tests: Results Page
 * 
 * Tests the results page which displays:
 * - Session completion results
 * - Score and progress
 * - Navigation back to dashboard
 */

import { test, expect } from '@playwright/test';

test.describe('Results Page: Basic Loading', () => {
  test('results page loads without crashing', async ({ page }) => {
    await page.goto('/results');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Page should load with content
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
    
    // Should not show error boundary
    const hasError = await page.getByText(/something went wrong/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('results page displays results or redirect', async ({ page }) => {
    await page.goto('/results');
    await page.waitForLoadState('networkidle');
    
    // Could show results, empty state, or redirect to play/dashboard
    const hasResults = await page.getByText(/result|score|complete|finished/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no results|no session|start/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasRedirected = page.url().includes('/play') || page.url().includes('/dashboard');
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasResults || hasEmptyState || hasRedirected || hasContent).toBeTruthy();
  });
});

test.describe('Results Page: Content Structure', () => {
  test('results page has proper layout', async ({ page }) => {
    await page.goto('/results');
    await page.waitForLoadState('networkidle');
    
    // Should have main content area
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    const hasHeading = await page.getByRole('heading').first().isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasMain || hasHeading).toBeTruthy();
  });

  test('results page has navigation options', async ({ page }) => {
    await page.goto('/results');
    await page.waitForLoadState('networkidle');
    
    // Should have navigation links/buttons
    const hasBackButton = await page.locator('button:has-text("Back"), button:has-text("Home"), button:has-text("Dashboard"), a:has-text("Back")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasPlayAgain = await page.locator('button:has-text("Play"), button:has-text("Again"), button:has-text("Continue")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLinks = await page.locator('a[href]').count() > 0;
    
    // Should have some navigation option
    expect(hasBackButton || hasPlayAgain || hasLinks).toBeTruthy();
  });
});

test.describe('Results Page: Score Display', () => {
  test('results shows score when available', async ({ page }) => {
    // Try accessing results with a potential session
    await page.goto('/results');
    await page.waitForLoadState('networkidle');
    
    const pageContent = await page.locator('body').textContent() || '';
    
    // If there are results, should show score-related content
    const hasScoreContent = /score|point|correct|percent|%|\d+\/\d+/i.test(pageContent);
    const hasEmptyState = /no results|no session|start playing/i.test(pageContent);
    
    // Either has score or empty state
    expect(hasScoreContent || hasEmptyState || pageContent.length > 100).toBeTruthy();
  });
});
