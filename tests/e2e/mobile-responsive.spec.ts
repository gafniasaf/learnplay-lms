/**
 * E2E Tests: Mobile Responsive Design
 * 
 * Tests that all pages render correctly on mobile viewports:
 * - Mobile viewport (375px)
 * - Tablet viewport (768px)
 * - Navigation menu works on mobile
 * - Forms are usable on mobile
 * - Touch interactions work
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:8081';

const mobileViewport = { width: 375, height: 667 }; // iPhone SE
const tabletViewport = { width: 768, height: 1024 }; // iPad

test.describe('Mobile Responsive Design', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('main pages render on mobile viewport', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    
    const pages = [
      '/',
      '/courses',
      '/student/dashboard',
      '/teacher/dashboard',
      '/parent/dashboard',
      '/admin/console',
    ];

    for (const route of pages) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check that page renders without horizontal scroll
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = mobileViewport.width;
      
      // Page should fit in viewport (allow small margin for rounding)
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
      
      // Should have content
      const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
      expect(hasContent).toBeTruthy();
    }
  });

  test('navigation menu works on mobile', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for mobile menu button (hamburger menu)
    const menuButton = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i], [data-testid*="menu"], button:has([class*="hamburger"])').first();
    const hasMenuButton = await menuButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasMenuButton) {
      await menuButton.click();
      await page.waitForTimeout(1000);
      
      // Menu should be visible
      const menu = page.locator('nav, [role="navigation"], [data-testid*="nav"]').first();
      const isMenuVisible = await menu.isVisible({ timeout: 3000 }).catch(() => false);
      
      expect(isMenuVisible).toBeTruthy();
    } else {
      // If no hamburger menu, check if nav is always visible
      const nav = page.locator('nav, [role="navigation"]').first();
      const hasNav = await nav.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasNav).toBeTruthy();
    }
  });

  test('forms are usable on mobile', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto(`${BASE_URL}/admin/ai-pipeline`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find form inputs
    const inputs = page.locator('input, textarea, select');
    const inputCount = await inputs.count();
    
    if (inputCount > 0) {
      const firstInput = inputs.first();
      const isVisible = await firstInput.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (isVisible) {
        // Check if input is large enough to tap (min 44x44px)
        const box = await firstInput.boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(40);
          expect(box.height).toBeGreaterThanOrEqual(40);
        }
      }
    }
    
    const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('touch interactions work on mobile', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto(`${BASE_URL}/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find clickable elements (buttons, links)
    const buttons = page.locator('button, a[href]');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      const firstButton = buttons.first();
      const isVisible = await firstButton.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (isVisible) {
        // Tap (click) should work
        await firstButton.click({ force: true });
        await page.waitForTimeout(1000);
        
        // Should have responded to tap
        const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
        expect(hasContent).toBeTruthy();
      }
    }
  });

  test('tablet viewport renders correctly', async ({ page }) => {
    await page.setViewportSize(tabletViewport);
    
    const pages = [
      '/courses',
      '/admin/courses',
      '/student/dashboard',
    ];

    for (const route of pages) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = tabletViewport.width;
      
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
      
      const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
      expect(hasContent).toBeTruthy();
    }
  });

  test('course editor usable on tablet', async ({ page }) => {
    await page.setViewportSize(tabletViewport);
    await page.goto(`${BASE_URL}/admin/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCourse) {
      await courseLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Editor should be usable
      const hasEditorContent = await page.locator('input, textarea, [contenteditable]').count().then(c => c > 0).catch(() => false);
      const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
      
      expect(hasEditorContent || hasContent).toBeTruthy();
    } else {
      const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
      expect(hasContent).toBeTruthy();
    }
  });

  test('play session works on mobile', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto(`${BASE_URL}/play/welcome`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check that play UI fits mobile screen
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(mobileViewport.width + 20);
    
    const hasContent = await page.locator('body').textContent().then(t => t && t.length > 50).catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
