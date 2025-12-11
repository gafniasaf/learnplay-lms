import { test as setup, expect } from '@playwright/test';

/**
 * Setup: Authenticate as Parent
 */

const authFile = 'playwright/.auth/parent.json';

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

setup('authenticate as parent', async ({ page }) => {
  const parentEmail = requireEnvVar('E2E_PARENT_EMAIL');
  const parentPassword = requireEnvVar('E2E_PARENT_PASSWORD');

  await page.goto('/auth');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  await page.fill('input[type="email"]', parentEmail);
  await page.fill('input[type="password"]', parentPassword);
  await page.click('button[type="submit"]');
  
  await page.waitForURL(/\/(dashboard|parent|admin|courses|\?|$)/, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  
  const currentUrl = page.url();
  expect(currentUrl).not.toContain('/auth');
  
  await page.context().storageState({ path: authFile });
  console.log('✅ Parent authentication setup complete');
});

