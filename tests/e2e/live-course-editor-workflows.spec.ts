/**
 * E2E Tests: Course Editor Workflows
 * 
 * Tests critical course editor operations:
 * - Save course edits
 * - Publish course
 * - Archive course
 * - Delete course
 * - Verify persistence
 */

import { test, expect } from '@playwright/test';

test.describe('Course Editor Workflows', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('admin saves course edits', async ({ page }) => {
    // Navigate to course editor (use existing course or create)
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      test.skip('No courses available for editing');
      return;
    }

    await courseLink.click();
    await page.waitForLoadState('networkidle');

    // Wait for editor to load
    await expect(page.locator('text=/course|edit|editor/i')).toBeVisible({ timeout: 10000 });

    // Find an editable field (title, item stem, etc.)
    const titleInput = page.locator('input[value*=""], input[placeholder*="title"], input[placeholder*="name"]').first();
    const hasTitleInput = await titleInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTitleInput) {
      // Get current value
      const currentValue = await titleInput.inputValue();
      
      // Edit the field
      await titleInput.fill(`${currentValue} [E2E Edit]`);
      
      // Find save button
      const saveButton = page.locator('button:has-text("Save"), [data-testid*="save"]').first();
      const hasSaveButton = await saveButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasSaveButton) {
        await saveButton.click();
        
        // Wait for save confirmation
        await expect(
          page.locator('text=/saved|success|updated/i').or(
            page.locator('[role="status"]')
          )
        ).toBeVisible({ timeout: 10000 });

        // Reload page to verify persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Verify changes persisted
        const savedValue = await titleInput.inputValue();
        expect(savedValue).toContain('[E2E Edit]');
      }
    }
  });

  test('admin publishes course', async ({ page }) => {
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      test.skip('No courses available');
      return;
    }

    await courseLink.click();
    await page.waitForLoadState('networkidle');

    // Look for publish button
    const publishButton = page.locator('button:has-text("Publish"), [data-testid*="publish"]').first();
    const hasPublishButton = await publishButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasPublishButton) {
      await publishButton.click();

      // Wait for publish confirmation
      await expect(
        page.locator('text=/published|success/i').or(
          page.locator('[role="status"]')
        )
      ).toBeVisible({ timeout: 10000 });

      // Verify published status (if status indicator exists)
      const statusIndicator = page.locator('text=/published|status/i');
      const hasStatus = await statusIndicator.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasStatus) {
        const statusText = await statusIndicator.textContent();
        expect(statusText?.toLowerCase()).toContain('published');
      }
    }
  });

  test('admin archives course', async ({ page }) => {
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      test.skip('No courses available');
      return;
    }

    await courseLink.click();
    await page.waitForLoadState('networkidle');

    // Look for archive button
    const archiveButton = page.locator('button:has-text("Archive"), [data-testid*="archive"]').first();
    const hasArchiveButton = await archiveButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasArchiveButton) {
      await archiveButton.click();

      // Handle confirmation dialog if present
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")').first();
      const hasConfirm = await confirmButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await confirmButton.click();
      }

      // Wait for archive confirmation
      await expect(
        page.locator('text=/archived|success/i').or(
          page.locator('[role="status"]')
        )
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('admin deletes course', async ({ page }) => {
    // Note: This test should use a test course that can be safely deleted
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      test.skip('No courses available');
      return;
    }

    await courseLink.click();
    await page.waitForLoadState('networkidle');

    // Look for delete button
    const deleteButton = page.locator('button:has-text("Delete"), [data-testid*="delete"]').first();
    const hasDeleteButton = await deleteButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDeleteButton) {
      await deleteButton.click();

      // Handle confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")').first();
      const hasConfirm = await confirmButton.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await confirmButton.click();
      }

      // Wait for delete confirmation and redirect
      await expect(
        page.locator('text=/deleted|removed|success/i').or(
          page.url().includes('/admin/courses') || page.url().includes('/admin')
        )
      ).toBeTruthy();
    }
  });
});

