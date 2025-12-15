import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect, getDemoCourseId } from './journeyAdapter';

test.describe('legacy parity: Course Editor basic load', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('loads for demo course and shows primary actions', async ({ page }) => {
    const courseId = getDemoCourseId();

    await gotoStable(page, `/admin/editor/${courseId}`);
    await assertNotAuthRedirect(page);

    await expect(page.getByText('Course Editor', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /Save Draft/i })).toBeVisible();
    await expect(page.getByTestId('btn-publish')).toBeVisible();
  });
});
