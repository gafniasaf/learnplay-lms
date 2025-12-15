import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect, installPromptStub } from './journeyAdapter';

test.describe('legacy parity: admin publish flow', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('publish is possible after saving draft (no contradictory gating)', async ({ page }) => {
    test.skip(!process.env.E2E_ALLOW_PUBLISH_MUTATION, 'Set E2E_ALLOW_PUBLISH_MUTATION=1 to run (publishing mutates real DB).');
    const courseId = process.env.E2E_PUBLISH_COURSE_ID;
    if (!courseId) {
      throw new Error('❌ E2E_PUBLISH_COURSE_ID is REQUIRED when E2E_ALLOW_PUBLISH_MUTATION=1');
    }

    await gotoStable(page, `/admin/editor/${courseId}`);
    await assertNotAuthRedirect(page);

    // Make a tiny edit to create an unsaved change, then save.
    const stemTab = page.getByRole('tab', { name: 'Stem' }).first();
    await stemTab.click().catch(() => undefined);

    const stemPanel = page.getByRole('tabpanel', { name: 'Stem' }).first();
    const editorBox = stemPanel.getByRole('textbox').first();
    await expect(editorBox).toBeVisible({ timeout: 20_000 });
    await editorBox.fill(`E2E publish parity edit ${Date.now()}`);

    const saveDraft = page.getByRole('button', { name: /Save Draft/i });
    await expect(saveDraft).toBeEnabled({ timeout: 20_000 });
    await saveDraft.click();

    // Expect a save confirmation toast.
    await expect(page.getByText(/Draft saved/i)).toBeVisible({ timeout: 30_000 });

    // After saving, publish should be enabled and should proceed.
    const publishBtn = page.getByTestId('btn-publish');
    await expect(publishBtn).toBeEnabled({ timeout: 10_000 });

    // Stub prompt for changelog (Publish asks for it).
    await installPromptStub(page, `E2E publish parity ${new Date().toISOString()}`);
    await publishBtn.click();

    // Success can be either a toast or a redirect back to course selector.
    await expect(
      page.getByText(/Course published/i).or(page.getByText(/Publishing course/i)).or(page.locator('text=/admin/courses/select/'))
    ).toBeVisible({ timeout: 60_000 });
  });
});

