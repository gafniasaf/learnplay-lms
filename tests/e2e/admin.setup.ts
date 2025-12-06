import { test as setup, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Setup: Authenticate as Admin
 * 
 * This runs before authenticated tests to create a valid session.
 */

const authFile = 'playwright/.auth/admin.json';

setup('authenticate as admin', async ({ page }) => {
  // Read admin credentials
  const envFile = path.resolve(__dirname, '../../learnplay.env');
  let adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@learnplay.dev';
  let adminPassword = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123!';
  
  try {
    const envContent = readFileSync(envFile, 'utf-8');
    // Could parse from env file if needed
  } catch (error) {
    console.warn('Using default admin credentials');
  }

  // Navigate to auth page
  await page.goto('/auth');
  
  // Wait for login form
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  // Fill credentials
  await page.fill('input[type="email"]', adminEmail);
  await page.fill('input[type="password"]', adminPassword);
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for successful login (redirect away from /auth)
  await page.waitForURL(/\/(dashboard|admin|courses)/, { timeout: 15000 });
  
  // Verify we're logged in
  await expect(page).not.toHaveURL(/\/auth/);
  
  // Save authenticated state
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Admin authentication setup complete');
});

