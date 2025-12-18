/**
 * Debug test for course selector navigation
 */
import { test, expect } from '@playwright/test';

test.describe('Debug: Course Selector', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('debug course selector page', async ({ page }) => {
    // Capture console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Capture network requests
    const networkRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('supabase') || request.url().includes('functions')) {
        networkRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    // Navigate to course selector
    console.log('Navigating to /admin/courses/select...');
    await page.goto('/admin/courses/select');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000); // Wait for everything to load

    // Take a screenshot
    await page.screenshot({ path: 'reports/debug-course-selector.png', fullPage: true });

    // Log page URL
    console.log('Current URL:', page.url());

    // Log page title
    const title = await page.title();
    console.log('Page title:', title);

    // Check for loading spinner
    const loadingSpinner = page.locator('text=/Loading courses/i');
    const isLoading = await loadingSpinner.isVisible().catch(() => false);
    console.log('Loading spinner visible:', isLoading);

    // Check for "No courses available"
    const noCourses = page.locator('text=/No courses available/i');
    const hasNoCourses = await noCourses.isVisible().catch(() => false);
    console.log('No courses message visible:', hasNoCourses);

    // Check for "Select Course to Edit" heading
    const selectHeading = page.locator('text=/Select Course to Edit/i');
    const hasSelectHeading = await selectHeading.isVisible().catch(() => false);
    console.log('Select heading visible:', hasSelectHeading);

    // Check for Edit buttons
    const editButtons = page.locator('button:has-text("Edit")');
    const editButtonCount = await editButtons.count();
    console.log('Edit buttons found:', editButtonCount);

    // Check for course cards (divs with border and rounded-lg)
    const courseCards = page.locator('div.border.rounded-lg');
    const courseCardCount = await courseCards.count();
    console.log('Course card divs found:', courseCardCount);

    // Get all visible text on the page (first 2000 chars)
    const bodyText = await page.locator('body').textContent();
    console.log('Page content (first 2000 chars):', bodyText?.substring(0, 2000));

    // Log network requests
    console.log('\nNetwork requests to Supabase:');
    networkRequests.forEach((req) => console.log('  ', req));

    // Log console messages that mention courses
    console.log('\nConsole logs mentioning courses:');
    consoleLogs
      .filter((log) => log.toLowerCase().includes('course'))
      .forEach((log) => console.log('  ', log));

    // Log any errors
    console.log('\nConsole errors:');
    consoleLogs
      .filter((log) => log.includes('[error]'))
      .forEach((log) => console.log('  ', log));

    // Try to find any interactive elements
    const allButtons = page.locator('button');
    const buttonCount = await allButtons.count();
    console.log('\nTotal buttons on page:', buttonCount);

    // List first 10 buttons
    for (let i = 0; i < Math.min(10, buttonCount); i++) {
      const button = allButtons.nth(i);
      const text = await button.textContent();
      const isVisible = await button.isVisible();
      console.log(`  Button ${i}: "${text?.trim()}" - visible: ${isVisible}`);
    }

    // Check if we're on the right page or redirected
    if (!page.url().includes('/admin/courses/select')) {
      console.log('WARNING: Redirected from /admin/courses/select to', page.url());
    }

    // Assert something so test doesn't fail silently
    expect(page.url()).toContain('/admin');
  });
});

