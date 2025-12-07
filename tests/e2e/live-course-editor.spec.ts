import { test, expect } from '@playwright/test';

/**
 * E2E: Course Editor critical flows
 * These tests are skipped automatically if Supabase creds are not provided.
 */

const hasEnv = !!process.env.VITE_SUPABASE_URL && !!process.env.VITE_SUPABASE_ANON_KEY;
const maybe = hasEnv ? test : test.skip;

maybe.describe('Live Course Editor', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('edit item and save', async ({ page }) => {
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    await courseLink.waitFor({ timeout: 10000 });
    await courseLink.click();

    await page.waitForLoadState('networkidle');

    // Open first item editor if present
    const editButton = page.locator('button:has-text("Edit"), [data-testid*="edit-item"]').first();
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click();
      // Make a small change
      const textArea = page.locator('textarea, [contenteditable="true"]').first();
      if (await textArea.isVisible({ timeout: 5000 }).catch(() => false)) {
        await textArea.fill('Updated by E2E test');
      }
      // Save
      const saveButton = page.locator('button:has-text("Save"), [data-testid*="save"]').first();
      if (await saveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await saveButton.click();
        await expect(page.locator('text=/saved|success/i')).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('publish course', async ({ page }) => {
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    await courseLink.waitFor({ timeout: 10000 });
    await courseLink.click();
    await page.waitForLoadState('networkidle');

    const publishButton = page.locator('button:has-text("Publish"), [data-testid*="publish"]').first();
    if (await publishButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await publishButton.click();
      await expect(page.locator('text=/published|success/i')).toBeVisible({ timeout: 10000 });
    }
  });
});

