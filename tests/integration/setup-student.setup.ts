import { test as setup, expect } from '@playwright/test';

/**
 * Setup: Authenticate as Student
 */

const authFile = 'playwright/.auth/student.json';

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
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  await page.fill('input[type="email"]', studentEmail);
  await page.fill('input[type="password"]', studentPassword);
  await page.click('button[type="submit"]');
  
  await page.waitForURL(/\/(dashboard|student|admin|courses|\?|$)/, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  
  const currentUrl = page.url();
  expect(currentUrl).not.toContain('/auth');
  
  await page.context().storageState({ path: authFile });
  console.log('✅ Student authentication setup complete');
});

