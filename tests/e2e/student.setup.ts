import { test as setup, expect } from '@playwright/test';

/**
 * Setup: Authenticate as Student
 * 
 * This runs before authenticated student dashboard tests to create a valid session.
 */

const authFile = 'playwright/.auth/student.json';

const LOGIN_FORM_TIMEOUT_MS = 10000;
const LOGIN_REDIRECT_TIMEOUT_MS = 20000;

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

setup('authenticate as student', async ({ page }) => {
  const studentEmail = requireEnvVar('E2E_STUDENT_EMAIL');
  const studentPassword = requireEnvVar('E2E_STUDENT_PASSWORD');

  await page.goto('/auth');
  
  const currentPageUrl = page.url();
  const urlObj = new URL(currentPageUrl);
  const baseURL = `${urlObj.protocol}//${urlObj.host}`;
  
  await page.waitForSelector('input[type="email"]', { timeout: LOGIN_FORM_TIMEOUT_MS });
  
  await page.fill('input[type="email"]', studentEmail);
  await page.fill('input[type="password"]', studentPassword);
  
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForURL(/\/(dashboard|student|courses|\?|$)/, { timeout: LOGIN_REDIRECT_TIMEOUT_MS });
  } catch (error: unknown) {
    const failedUrl = page.url();
    const errorMessage = await page.locator('[role="alert"], .error, .alert-error').first().textContent().catch(() => null);
    
    const errorDetails = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Student login failed. Current URL: ${failedUrl}. ` +
      (errorMessage ? `Error message: ${errorMessage}. ` : '') +
      `Original error: ${errorDetails}`
    );
  }
  
  await page.waitForLoadState('networkidle');
  
  const currentUrl = page.url();
  expect(currentUrl).not.toContain('/auth');
  
  if (currentUrl === baseURL + '/' || currentUrl === baseURL + '/?') {
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    const dashboardUrl = page.url();
    expect(dashboardUrl).not.toContain('/auth');
  }
  
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Student authentication setup complete');
});

