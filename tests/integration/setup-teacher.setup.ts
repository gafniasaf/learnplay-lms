import { test as setup, expect } from '@playwright/test';

/**
 * Setup: Authenticate as Teacher
 * 
 * Creates authenticated state for teacher role tests.
 */

const authFile = 'playwright/.auth/teacher.json';

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

setup('authenticate as teacher', async ({ page }) => {
  const teacherEmail = requireEnvVar('E2E_TEACHER_EMAIL');
  const teacherPassword = requireEnvVar('E2E_TEACHER_PASSWORD');

  await page.goto('/auth');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  await page.fill('input[type="email"]', teacherEmail);
  await page.fill('input[type="password"]', teacherPassword);
  await page.click('button[type="submit"]');
  
  await page.waitForURL(/\/(dashboard|teacher|admin|courses|\?|$)/, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  
  const currentUrl = page.url();
  expect(currentUrl).not.toContain('/auth');
  
  await page.context().storageState({ path: authFile });
  console.log('✅ Teacher authentication setup complete');
});

