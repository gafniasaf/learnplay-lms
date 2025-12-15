import { test, expect } from '@playwright/test';

test.describe('legacy parity: admin catalog edit link', () => {
  test('clicking Edit on a course card opens /admin/editor/:courseId', async ({ page }) => {
    // Admin needs storageState from setup project
    await page.goto('/courses');
    await page.waitForLoadState('domcontentloaded');

    // Find any visible "edit" affordance shown for admins in the catalog UI.
    const editBtn = page.locator('button[title="Edit this course"]').first();
    await expect(editBtn).toBeVisible({ timeout: 20_000 });

    // Click and ensure we land in the editor route (not 404).
    await editBtn.click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/admin\/editor\/[^/]+/);
    await expect(page.getByText('Something went wrong')).toBeHidden();
  });
});

