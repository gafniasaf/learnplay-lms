import { test, expect } from '@playwright/test';

test.describe('Mini-CRM Demo flow', () => {
  test('dashboard and contacts journey', async ({ page }) => {
    // Navigate to the mounted CRM dashboard
    await page.goto('/crm/dashboard');

    // Step 1: Dashboard overview
    await expect(page.getByRole('heading', { name: /Pipeline Overview/i })).toBeVisible();
    await expect(page.getByText('Active Leads', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sync Inbox/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Contact/i })).toBeVisible();

    // Step 2: Navigate to contacts and open modal
    await page.getByRole('link', { name: /View Contacts/i }).click();
    
    // Verify navigation to contacts page
    await expect(page.getByRole('heading', { name: /Pipeline Contacts/i })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    
    await page.getByRole('button', { name: /Add Contact/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
