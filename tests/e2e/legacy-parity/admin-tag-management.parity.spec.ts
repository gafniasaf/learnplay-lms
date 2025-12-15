import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect } from './journeyAdapter';

test.describe('legacy parity: tag management', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('tag management pages load', async ({ page }) => {
    await gotoStable(page, '/admin/tags');
    await assertNotAuthRedirect(page);
    await expect(page.locator('body')).toBeVisible();

    await gotoStable(page, '/admin/tags/approve');
    await assertNotAuthRedirect(page);
    await expect(page.locator('body')).toBeVisible();
  });
});
