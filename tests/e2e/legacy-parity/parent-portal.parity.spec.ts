import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect } from './journeyAdapter';
import { existsSync } from 'fs';

test.describe('legacy parity: parent portal smoke', () => {
  test.skip(!existsSync('playwright/.auth/parent.json'), 'Parent auth state missing. Run tests/e2e/parent.setup.ts with E2E_PARENT_* envs to generate it.');
  test.use({ storageState: 'playwright/.auth/parent.json' });

  test('parent dashboard loads and shows core CTAs', async ({ page }) => {
    await gotoStable(page, '/parent/dashboard');
    await assertNotAuthRedirect(page);

    await expect(page.getByRole('heading', { name: /^Hello,/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-cta-id="parent-link-child"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="parent-messages"]')).toBeVisible();
  });
});

