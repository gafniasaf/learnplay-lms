import { test as setup, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Setup: Authenticate as Admin
 * 
 * This runs before authenticated tests to create a valid session.
 */

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Get base URL from config
  const baseURL = process.env.BASE_URL || 'http://localhost:8082';
  
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
  // Could redirect to /, /dashboard, /admin, or /courses
  await page.waitForURL(/\/(dashboard|admin|courses|\?|$)/, { timeout: 20000 });
  
  // Wait a bit for any client-side redirects
  await page.waitForTimeout(2000);
  
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

