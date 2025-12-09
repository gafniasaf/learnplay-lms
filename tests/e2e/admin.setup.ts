import { test as setup, expect } from '@playwright/test';

/**
 * Setup: Authenticate as Admin
 * 
 * This runs before authenticated tests to create a valid session.
 */

const authFile = 'playwright/.auth/admin.json';

// Timeout constants for E2E tests
const LOGIN_FORM_TIMEOUT_MS = 10000; // 10 seconds
const LOGIN_REDIRECT_TIMEOUT_MS = 20000; // 20 seconds

/**
 * Validates that a required environment variable is set
 * Throws with a clear error message if missing (NO-FALLBACK policy)
 */
function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

setup('authenticate as admin', async ({ page }) => {
  // Read admin credentials - REQUIRED env vars per NO-FALLBACK policy
  const adminEmail = requireEnvVar('E2E_ADMIN_EMAIL');
  const adminPassword = requireEnvVar('E2E_ADMIN_PASSWORD');

  // Navigate to auth page (Playwright config provides baseURL)
  await page.goto('/auth');
  
  // Extract base URL from current page URL for later comparison
  const currentPageUrl = page.url();
  const urlObj = new URL(currentPageUrl);
  const baseURL = `${urlObj.protocol}//${urlObj.host}`;
  
  // Wait for login form
  await page.waitForSelector('input[type="email"]', { timeout: LOGIN_FORM_TIMEOUT_MS });
  
  // Fill credentials
  await page.fill('input[type="email"]', adminEmail);
  await page.fill('input[type="password"]', adminPassword);
  
  // Submit login form
  await page.click('button[type="submit"]');
  
  // Wait for successful login (redirect away from /auth)
  // Could redirect to /, /dashboard, /admin, or /courses
  try {
    await page.waitForURL(/\/(dashboard|admin|courses|\?|$)/, { timeout: LOGIN_REDIRECT_TIMEOUT_MS });
  } catch (_error: unknown) {
    // Capture page state for debugging if login fails
    const failedUrl = page.url();
    const errorMessage = await page.locator('[role="alert"], .error, .alert-error').first().textContent().catch(() => null);
    
    const errorDetails = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Login failed. Current URL: ${failedUrl}. ` +
      (errorMessage ? `Error message: ${errorMessage}. ` : '') +
      `Original error: ${errorDetails}`
    );
  }
  
  // Wait for navigation to complete and any client-side redirects
  await page.waitForLoadState('networkidle');
  
  // Verify we're logged in (not on auth page)
  const currentUrl = page.url();
  expect(currentUrl).not.toContain('/auth');
  
  // If we're on /, navigate to admin to verify auth works
  if (currentUrl === baseURL + '/' || currentUrl === baseURL + '/?') {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    // Should not redirect back to auth
    const adminUrl = page.url();
    expect(adminUrl).not.toContain('/auth');
  }
  
  // Save authenticated state
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Admin authentication setup complete');
});

