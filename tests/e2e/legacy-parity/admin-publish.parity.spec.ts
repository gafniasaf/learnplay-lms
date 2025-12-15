import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect, installPromptStub } from './journeyAdapter';

test.describe('legacy parity: admin publish flow', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('publish is possible after saving draft (no contradictory gating)', async ({ page }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supabaseUrl) throw new Error('❌ VITE_SUPABASE_URL is REQUIRED for publish parity');

    const agentToken = process.env.AGENT_TOKEN;
    if (!agentToken) throw new Error('❌ AGENT_TOKEN is REQUIRED for publish parity (used to provision/cleanup fixtures)');

    const providedCourseId = process.env.E2E_PUBLISH_COURSE_ID;
    const courseId = providedCourseId || `e2e-publish-${Date.now()}`;
    const shouldCleanup = !providedCourseId;

    // Provision a minimal, publishable course fixture if none is provided.
    // This DOES write to real storage + metadata, and then the test cleans it up in a finally block.
    if (shouldCleanup) {
      const clusterId = `${courseId}-cluster-1`;
      const seed = {
        id: courseId,
        title: `E2E Publish Parity ${courseId}`,
        visibility: 'org',
        contentVersion: '1',
        groups: [{ id: 0, name: 'Group 1' }],
        levels: [{ id: 1, title: 'Level 1', start: 0, end: 2 }],
        items: [
          {
            id: 1,
            groupId: 0,
            clusterId,
            variant: '1',
            mode: 'options',
            text: 'Choose _.',
            options: ['A', 'B', 'C'],
            correctIndex: 0,
            explain: 'Because A is correct.',
          },
          {
            id: 2,
            groupId: 0,
            clusterId,
            variant: '2',
            mode: 'options',
            text: 'Pick _.',
            options: ['A', 'B', 'C'],
            correctIndex: 0,
            explain: 'Because A is correct.',
          },
          {
            id: 3,
            groupId: 0,
            clusterId,
            variant: '3',
            mode: 'options',
            text: 'Select _.',
            options: ['A', 'B', 'C'],
            correctIndex: 0,
            explain: 'Because A is correct.',
          },
        ],
        studyTexts: [],
      };

      const seedResp = await page.request.post(`${supabaseUrl}/functions/v1/save-course`, {
        headers: { 'X-Agent-Token': agentToken, 'Content-Type': 'application/json' },
        data: { id: courseId, format: 'practice', version: 1, content: seed },
      });
      if (seedResp.status() !== 200) {
        const body = await seedResp.text().catch(() => '');
        throw new Error(`BLOCKED: failed to provision publish fixture via save-course (${seedResp.status()}). Body: ${body.slice(0, 400)}`);
      }
      const seedJson = await seedResp.json().catch(() => null);
      if (!seedJson || (seedJson as any).ok !== true) {
        throw new Error(`BLOCKED: save-course returned ok=false. Body: ${JSON.stringify(seedJson).slice(0, 500)}`);
      }
    }

    try {
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

      // Success: the app navigates back to course selector after a successful publish.
      await page.waitForURL(/\/admin\/courses\/select/, { timeout: 60_000 });
    } finally {
      // Cleanup: delete the test course so we don't pollute real DB/storage.
      if (shouldCleanup) {
        const ok = await page.evaluate(async ({ supabaseUrl, courseId }) => {
          try {
            const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
            const storageKey = `sb-${projectRef}-auth-token`;
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return { ok: false, error: 'missing_admin_session' };
            const session = JSON.parse(raw);
            const token = session?.access_token;
            if (!token) return { ok: false, error: 'missing_access_token' };

            const resp = await fetch(`${supabaseUrl}/functions/v1/delete-course`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ courseId, confirm: courseId }),
            });
            const text = await resp.text().catch(() => '');
            if (!resp.ok) return { ok: false, error: `delete-course ${resp.status}: ${text.slice(0, 300)}` };
            return { ok: true };
          } catch (e: any) {
            return { ok: false, error: String(e?.message || e) };
          }
        }, { supabaseUrl, courseId });

        if (!ok || (ok as any).ok !== true) {
          throw new Error(`BLOCKED: cleanup failed for ${courseId}: ${JSON.stringify(ok).slice(0, 400)}`);
        }
      }
    }
  });
});

