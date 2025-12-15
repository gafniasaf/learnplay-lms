import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect, getDemoCourseId } from './journeyAdapter';
import { existsSync } from 'fs';

test.describe('legacy parity: student play flow', () => {
  test.skip(!existsSync('playwright/.auth/student.json'), 'Student auth state missing. Run tests/e2e/student.setup.ts with E2E_STUDENT_* envs to generate it.');
  test.use({ storageState: 'playwright/.auth/student.json' });

  test('can load a play session and answer at least one item', async ({ page }) => {
    const courseId = getDemoCourseId();

    let startRoundHits = 0;
    let logAttemptHits = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/functions/v1/game-start-round')) startRoundHits++;
      if (url.includes('/functions/v1/game-log-attempt')) logAttemptHits++;
    });

    await gotoStable(page, `/play/${courseId}`);
    await assertNotAuthRedirect(page);

    // Starting a round typically happens on load.
    await expect.poll(() => startRoundHits, { timeout: 20000 }).toBeGreaterThan(0);

    // Answer an item using stable accessibility names.
    const optionsGroup = page.getByRole('group', { name: 'Answer options' });
    await expect(optionsGroup).toBeVisible({ timeout: 20000 });

    const option = optionsGroup.getByRole('button', { name: /^Option \d+:/ }).first();
    await expect(option).toBeVisible({ timeout: 20000 });
    await option.click();

    // Logging should happen after answering.
    await expect.poll(() => logAttemptHits, { timeout: 20000 }).toBeGreaterThan(0);

    // Page should remain stable.
    await expect(page.locator('body')).toBeVisible();
  });
});
