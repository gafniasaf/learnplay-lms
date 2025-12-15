import { test, expect } from '@playwright/test';
import { gotoStable } from './journeyAdapter';

test('legacy parity: portals show Kids/Parents/Schools', async ({ page }) => {
  await gotoStable(page, '/');

  await expect(page.getByRole('heading', { name: 'Welcome to LearnPlay' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kids', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Parents', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Schools', exact: true })).toBeVisible();
});
