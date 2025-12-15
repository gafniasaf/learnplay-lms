import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect, getDemoCourseId } from './journeyAdapter';

test.describe('legacy parity: Editor diff → approve', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('Audit Variants opens a diff viewer and can be approved', async ({ page }) => {
    const courseId = getDemoCourseId();

    await page.setViewportSize({ width: 1600, height: 1000 });

    await gotoStable(page, `/admin/editor/${courseId}`);
    await assertNotAuthRedirect(page);

    const auditBtn = page.getByTestId('btn-variants-audit');
    await expect(auditBtn).toBeVisible({ timeout: 20000 });
    const [auditResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/functions/v1/editor-variants-audit') && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      auditBtn.click(),
    ]);

    if (auditResp.status() !== 200) {
      const body = await auditResp.text().catch(() => '');
      throw new Error(
        `Variants audit failed (${auditResp.status()}). ` +
          `This is a REAL backend gap (Edge Function / CORS / proxy). ` +
          (body ? `Body: ${body.slice(0, 400)}` : '')
      );
    }

    // Diff overlay should appear (even if diff is empty) for variants audit.
    await expect(page.getByText(/Proposed Patch/i)).toBeVisible({ timeout: 20000 });

    const approve = page.getByRole('button', { name: /Approve/i });
    await expect(approve).toBeVisible();
    await approve.click();

    await expect(page.getByText(/Proposed Patch/i)).toBeHidden({ timeout: 20000 });
  });
});
