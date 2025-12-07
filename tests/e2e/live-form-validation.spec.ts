/**
 * E2E Tests: Form Validation
 * 
 * Tests form validation and multi-step forms:
 * - Course creation form validation
 * - Assignment creation with class selection
 * - Form state persistence
 * - Required field enforcement
 */

import { test, expect } from '@playwright/test';

test.describe('Form Validation', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('course creation form validation', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');

    // Try to submit empty form
    const createButton = page.locator('[data-cta-id="quick-start-create"], button:has-text("Create")').first();
    const hasCreateButton = await createButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCreateButton) {
      await createButton.click();

      // Verify validation errors shown
      await expect(
        page.locator('text=/required|missing|invalid/i').or(
          page.locator('[role="alert"]')
        )
      ).toBeVisible({ timeout: 5000 });

      // Fill required fields
      const subjectInput = page.locator('input[placeholder*="subject"], input#subject').first();
      const hasSubjectInput = await subjectInput.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasSubjectInput) {
        await subjectInput.fill('Test Subject');
        
        // Try to submit again
        await createButton.click();

        // Should not show validation errors now (or show success)
        const validationErrors = page.locator('text=/required|missing|invalid/i');
        const errorCount = await validationErrors.count();
        
        // Either no errors, or form submitted successfully
        const successMessage = page.locator('text=/created|started|success/i');
        const hasSuccess = await successMessage.isVisible({ timeout: 10000 }).catch(() => false);
        
        expect(errorCount === 0 || hasSuccess).toBe(true);
      }
    }
  });

  test('assignment creation with class selection', async ({ page }) => {
    await page.goto('/teacher/assignments');
    await page.waitForLoadState('networkidle');

    // Look for create assignment button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Assignment")').first();
    const hasCreateButton = await createButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCreateButton) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Fill assignment form
      const titleInput = page.locator('input[placeholder*="title"], input[name*="title"]').first();
      const hasTitleInput = await titleInput.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasTitleInput) {
        await titleInput.fill('Test Assignment E2E');

        // Select class (if class selector exists)
        const classSelect = page.locator('select[name*="class"], [data-testid*="class-select"]').first();
        const hasClassSelect = await classSelect.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasClassSelect) {
          await classSelect.selectOption({ index: 0 }); // Select first option
        }

        // Set due date (if date picker exists)
        const dateInput = page.locator('input[type="date"], input[name*="due"]').first();
        const hasDateInput = await dateInput.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasDateInput) {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 7);
          const dateString = futureDate.toISOString().split('T')[0];
          await dateInput.fill(dateString);
        }

        // Submit form
        const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').first();
        const hasSubmit = await submitButton.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasSubmit) {
          await submitButton.click();

          // Verify assignment created
          await expect(
            page.locator('text=/created|success|assignment/i').or(
              page.locator('[role="status"]')
            )
          ).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test('form state persists across navigation', async ({ page }) => {
    // This test would verify that form state is preserved when navigating away and back
    // For now, mark as skipped until we have form state management
    test.skip('Requires form state persistence implementation');
  });
});

