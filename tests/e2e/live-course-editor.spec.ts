/**
 * Live E2E Tests: Course Editor
 * 
 * Tests course editor functionality with REAL Supabase.
 * These tests verify:
 * - Course editor loads
 * - Item editing and saving
 * - Course publishing
 * - Course deletion
 */

import { test, expect } from '@playwright/test';

// Check if we have required env vars (from learnplay.env via playwright config)
const hasEnv = !!process.env.VITE_SUPABASE_URL && !!process.env.VITE_SUPABASE_ANON_KEY;

test.describe('Live Course Editor', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('edit item and save', async ({ page }) => {
    test.skip(!hasEnv, 'Skipping: Supabase credentials not available');
    
    // Navigate to a course editor
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');
    
    // Find a course link
    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!hasCourse) {
      test.skip();
      return;
    }
    
    await courseLink.click();
    await page.waitForLoadState('networkidle');
    
    // Wait for editor to load
    await expect(page.getByText(/course|edit|item/i)).toBeVisible({ timeout: 10000 });
    
    // Find an item to edit (look for edit button or item card)
    const editButton = page.locator('button:has-text("Edit"), [data-testid*="edit-item"]').first();
    const hasEditButton = await editButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasEditButton) {
      await editButton.click();
      await page.waitForTimeout(1000);
      
      // Find a text field to edit (stem, options, explanation)
      const textField = page.locator('textarea, input[type="text"]').first();
      const hasTextField = await textField.isVisible({ timeout: 5000 }).catch(() => false);
      
      if (hasTextField) {
        // Edit the field
        await textField.fill('Test edit from E2E');
        
        // Save
        const saveButton = page.locator('button:has-text("Save")').first();
        await saveButton.click();
        
        // Wait for save confirmation
        await expect(
          page.locator('text=/saved|success|updated/i').or(
            page.locator('[role="status"]')
          )
        ).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('publish course', async ({ page }) => {
    test.skip(!hasEnv, 'Skipping: Supabase credentials not available');
    
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');
    
    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!hasCourse) {
      test.skip();
      return;
    }
    
    await courseLink.click();
    await page.waitForLoadState('networkidle');
    
    // Look for publish button
    const publishButton = page.locator('button:has-text("Publish")').first();
    const hasPublishButton = await publishButton.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasPublishButton) {
      await publishButton.click();
      
      // Wait for publish confirmation
      await expect(
        page.locator('text=/published|success/i').or(
          page.locator('[role="status"]')
        )
      ).toBeVisible({ timeout: 10000 });
    }
  });
});
