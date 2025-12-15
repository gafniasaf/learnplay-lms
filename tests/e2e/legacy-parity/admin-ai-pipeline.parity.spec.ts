import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect } from './journeyAdapter';

test.describe('legacy parity: AI Pipeline (V2 generator)', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('loads AI Course Generator and shows creation form', async ({ page }) => {
    await gotoStable(page, '/admin/ai-pipeline');
    await assertNotAuthRedirect(page);

    await expect(page.getByRole('heading', { name: 'AI Course Generator' })).toBeVisible();
    await expect(page.getByText('Create New Course', { exact: true })).toBeVisible();
    await expect(page.locator('[data-cta-id="ai-course-subject"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="ai-course-generate"]')).toBeVisible();
  });

  test('can enqueue a course job from generator', async ({ page }) => {
    await gotoStable(page, '/admin/ai-pipeline');
    await assertNotAuthRedirect(page);

    const subjectInput = page.locator('[data-cta-id="ai-course-subject"]');
    await subjectInput.fill('Parity Smoke Course');

    const createBtn = page.locator('[data-cta-id="ai-course-generate"]');
    await expect(createBtn).toBeEnabled({ timeout: 10_000 });

    await createBtn.click();

    // Assert we enter a creating state and/or show an explicit toast.
    await expect(page.getByText(/Creating\\.{3}/i).or(page.getByText(/Course generation started!/i))).toBeVisible({ timeout: 30_000 });
  });
});
