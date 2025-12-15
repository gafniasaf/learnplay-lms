import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect } from './journeyAdapter';

test.describe('legacy parity: student assignments', () => {
  test.use({ storageState: 'playwright/.auth/student.json' });

  test('assignments page loads', async ({ page }) => {
    await gotoStable(page, '/student/assignments');
    await assertNotAuthRedirect(page);

    // Heuristic: page should show title or have substantial content.
    const hasHeading = await page.getByRole('heading', { name: /Assignments/i }).isVisible().catch(() => false);
    if (hasHeading) {
      await expect(page.getByRole('heading', { name: /Assignments/i })).toBeVisible();
    } else {
      const bodyText = await page.locator('body').textContent();
      expect((bodyText?.length ?? 0)).toBeGreaterThan(50);
    }
  });
});
