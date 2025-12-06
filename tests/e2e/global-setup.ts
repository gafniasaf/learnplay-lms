import { chromium, FullConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Global Setup for Live E2E Tests
 * 
 * Creates authenticated session for admin user
 */

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  
  // Read admin credentials from learnplay.env or use defaults
  const envFile = path.resolve(__dirname, '../../learnplay.env');
  let adminEmail = 'admin@learnplay.dev';
  let adminPassword = 'AdminPass123!';
  
  try {
    const envContent = readFileSync(envFile, 'utf-8');
    // Could parse admin credentials from env file if needed
  } catch (error) {
    console.warn('Could not read learnplay.env, using default admin credentials');
  }

  // Override with environment variables if provided
  adminEmail = process.env.E2E_ADMIN_EMAIL || adminEmail;
  adminPassword = process.env.E2E_ADMIN_PASSWORD || adminPassword;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log(`🔐 Logging in as admin: ${adminEmail}`);
    
    // Navigate to auth page
    await page.goto(baseURL + '/auth');
    
    // Wait for auth form
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Fill in credentials
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', adminPassword);
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Wait for navigation (should go to dashboard or home)
    await page.waitForURL(/\/(dashboard|admin|courses)/, { timeout: 15000 });
    
    // Save authenticated state
    await page.context().storageState({ path: 'playwright/.auth/admin.json' });
    
    console.log('✅ Admin authentication successful');
  } catch (error) {
    console.error('❌ Failed to authenticate admin:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;

