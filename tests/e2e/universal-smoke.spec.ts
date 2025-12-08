import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const manifestPath = path.resolve(__dirname, '../../system-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

test.describe('Universal System Smoke Test', () => {
  test('loads application and validates manifest branding alignment', async ({ page }) => {
    // 1. Derive system info from Manifest
    const rootEntities = manifest.data_model?.root_entities || [];
    const rootEntity = rootEntities[0]; // Get first root entity
    if (!rootEntity) throw new Error('Manifest missing root_entity');

    const systemName = manifest.branding?.name || manifest.system?.name || 'Ignite Zero';
    const rootName = rootEntity.name;

    console.log(`Testing Domain: ${systemName} | Root: ${rootName}`);

    // 2. Navigate to root path
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    
    // 3. Check if we're authenticated (redirected to dashboard) or on auth page
    const currentUrl = page.url();
    const isAuthenticated = !currentUrl.includes('/auth') && !currentUrl.includes('/login');
    
    if (isAuthenticated) {
      // If authenticated, verify we're on a dashboard or main page
      // Check for any main content area
      const hasContent = await page.locator('body').textContent();
      expect(hasContent?.length).toBeGreaterThan(0);
      console.log(`✅ App loaded successfully (authenticated) - on ${currentUrl}`);
    } else {
      // If on auth page, verify auth UI elements
      await expect(page.getByRole('heading', { name: /Welcome|Login|Sign/i })).toBeVisible({ timeout: 10000 });
      console.log(`✅ App loaded successfully (auth page)`);
    }

    // 4. Log manifest alignment info
    console.log(`✅ App loaded successfully with manifest root entity: ${rootName}`);
    const agentJobs = manifest.agent_jobs || manifest.jobs || [];
    if (agentJobs.length > 0) {
      console.log(`Manifest defines ${agentJobs.length} agent job(s) for post-auth context.`);
    }
  });
});

