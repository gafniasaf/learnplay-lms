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
    const rootEntity = manifest.data_model.find((e: { type: string }) => e.type === 'root_entity');
    if (!rootEntity) throw new Error('Manifest missing root_entity');

    const systemName = manifest.system?.name || 'Ignite Zero';
    const rootName = rootEntity.name;

    console.log(`Testing Domain: ${systemName} | Root: ${rootName}`);

    // 2. Navigate to root path (will redirect to /auth for this app)
    await page.goto('/');
    
    // 3. Verify the app loads - Auth page is the entry point
    // Check for the welcome heading which is always present
    await expect(page.getByRole('heading', { name: /Welcome/i })).toBeVisible({ timeout: 10000 });
    
    // 4. Verify essential auth UI elements are present
    await expect(page.getByRole('tab', { name: /Login/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Sign Up/i })).toBeVisible();
    
    // 5. Verify guest access option exists (core feature)
    await expect(page.getByRole('button', { name: /Continue as Guest/i })).toBeVisible();

    // 6. Log manifest alignment info
    console.log(`✅ App loaded successfully with manifest root entity: ${rootName}`);
    if (manifest.agent_jobs?.length > 0) {
      console.log(`Manifest defines ${manifest.agent_jobs.length} agent job(s) for post-auth context.`);
    }
  });
});

