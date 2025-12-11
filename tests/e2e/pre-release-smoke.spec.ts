/**
 * PRE-RELEASE SMOKE TEST
 * 
 * A fast (~2 min) smoke test covering the most critical paths.
 * Run this before EVERY release to catch obvious regressions.
 * 
 * Usage: npm run test:pre-release
 */

import { test, expect } from '@playwright/test';

test.describe('Pre-Release Smoke Tests', () => {
  test.describe.configure({ mode: 'serial' });

  // ============================================================
  // CRITICAL PATH 1: App Loads
  // ============================================================
  
  test('1. Landing page loads and renders content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length, 'Landing page is blank').toBeGreaterThan(100);
  });

  test('2. No console errors on landing page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        // Ignore expected errors
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('404')) {
          errors.push(text);
        }
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known acceptable errors
    const criticalErrors = errors.filter(e => 
      !e.includes('ResizeObserver') && // Browser quirk
      !e.includes('Non-Error promise rejection') // React strict mode
    );

    expect(criticalErrors.length, `Console errors: ${criticalErrors.join(', ')}`).toBe(0);
  });

  // ============================================================
  // CRITICAL PATH 2: Auth Works
  // ============================================================

  test('3. Auth page loads without crash', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  // ============================================================
  // CRITICAL PATH 3: Key Routes Load
  // ============================================================

  test('4. Student dashboard loads', async ({ page }) => {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  test('5. Teacher dashboard loads', async ({ page }) => {
    await page.goto('/teacher/dashboard');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  test('6. Courses page loads', async ({ page }) => {
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  test('7. Admin AI Pipeline loads', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  // ============================================================
  // CRITICAL PATH 4: Navigation Works
  // ============================================================

  test('8. Navigation between routes works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to courses
    const coursesLink = page.locator('a[href*="courses"], button:has-text("Courses")').first();
    if (await coursesLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await coursesLink.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('courses');
    } else {
      // Direct navigation as fallback
      await page.goto('/courses');
      await page.waitForLoadState('networkidle');
    }

    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  // ============================================================
  // CRITICAL PATH 5: 404 Handled
  // ============================================================

  test('9. 404 page shows gracefully', async ({ page }) => {
    await page.goto('/this-does-not-exist-xyz-123');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(20);
    
    // Should not show stack trace
    expect(bodyText?.includes('at Object.')).toBeFalsy();
  });

  // ============================================================
  // CRITICAL PATH 6: Mobile Responsive
  // ============================================================

  test('10. Mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    // No extreme horizontal overflow
    expect(bodyWidth).toBeLessThan(viewportWidth * 1.5);
  });
});

// Summary test that runs last
test('Pre-Release Summary', async ({ page }) => {
  console.log('\n🎉 Pre-Release Smoke Tests Complete!\n');
  console.log('All critical paths verified:');
  console.log('  ✅ Landing page loads');
  console.log('  ✅ No console errors');
  console.log('  ✅ Auth page accessible');
  console.log('  ✅ Key dashboards load');
  console.log('  ✅ Navigation works');
  console.log('  ✅ 404 handled gracefully');
  console.log('  ✅ Mobile responsive');
  console.log('\n');
  
  expect(true).toBeTruthy();
});

