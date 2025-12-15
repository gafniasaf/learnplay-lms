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
      // Prefer explicit ORGANIZATION_ID (canonical seeded org for tests).
      const adminOrgId = process.env.ORGANIZATION_ID;
      if (!adminOrgId) {
        throw new Error('❌ ORGANIZATION_ID is REQUIRED to seed a publishable course (and match publish-course authorization)');
      }

      const clusterId = `${courseId}-cluster-1`;
      const seed = {
        id: courseId,
        title: `E2E Publish Parity ${courseId}`,
        organization_id: adminOrgId,
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

      // Publish triggers a preflight:
      // - validate-course-structure
      // - generate-variants-audit
      // - publish-course
      const [vResp, aResp, pResp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/functions/v1/validate-course-structure') && r.request().method() === 'POST',
          { timeout: 60_000 }
        ),
        page.waitForResponse(
          (r) => r.url().includes('/functions/v1/generate-variants-audit') && r.request().method() === 'POST',
          { timeout: 60_000 }
        ),
        page.waitForResponse(
          (r) => r.url().includes('/functions/v1/publish-course') && r.request().method() === 'POST',
          { timeout: 60_000 }
        ),
        publishBtn.click(),
      ]);

      if (vResp.status() !== 200) {
        throw new Error(`BLOCKED: validate-course-structure failed (${vResp.status()}). Body: ${(await vResp.text().catch(() => '')).slice(0, 400)}`);
      }
      const vJson = await vResp.json().catch(() => null);
      if (!vJson || (vJson as any).ok !== true) {
        throw new Error(`BLOCKED: validate-course-structure returned ok=false. Body: ${JSON.stringify(vJson).slice(0, 500)}`);
      }

      if (aResp.status() !== 200) {
        throw new Error(`BLOCKED: generate-variants-audit failed (${aResp.status()}). Body: ${(await aResp.text().catch(() => '')).slice(0, 400)}`);
      }
      const aJson = await aResp.json().catch(() => null);
      if (!aJson || (aJson as any).ok !== true) {
        throw new Error(`BLOCKED: generate-variants-audit returned ok=false. Body: ${JSON.stringify(aJson).slice(0, 500)}`);
      }

      if (pResp.status() !== 200) {
        throw new Error(`BLOCKED: publish-course failed (${pResp.status()}). Body: ${(await pResp.text().catch(() => '')).slice(0, 400)}`);
      }
      const pJson = await pResp.json().catch(() => null);
      if (!pJson || typeof (pJson as any).version === 'undefined') {
        throw new Error(`BLOCKED: publish-course returned unexpected payload. Body: ${JSON.stringify(pJson).slice(0, 500)}`);
      }
      const publishedVersion = Number((pJson as any).version);
      if (!Number.isFinite(publishedVersion) || publishedVersion <= 0) {
        throw new Error(`BLOCKED: publish-course returned invalid version: ${String((pJson as any).version)}`);
      }

      // Extra verification: ensure the published snapshot is actually available (storage-backed via course_versions.storage_path).
      // This hits the backend endpoint which authorizes via user session + org, and downloads from Storage when needed.
      const snap = await page.evaluate(async ({ supabaseUrl, courseId, version }) => {
        try {
          const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
          const storageKey = `sb-${projectRef}-auth-token`;
          const raw = window.localStorage.getItem(storageKey);
          if (!raw) return { ok: false, error: 'missing_admin_session' };
          const session = JSON.parse(raw);
          const token = session?.access_token;
          if (!token) return { ok: false, error: 'missing_access_token' };

          const url = `${supabaseUrl}/functions/v1/get-course-version-snapshot?courseId=${encodeURIComponent(courseId)}&version=${encodeURIComponent(String(version))}`;
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const json = await resp.json().catch(() => null);
          return { ok: resp.ok, status: resp.status, json };
        } catch (e: any) {
          return { ok: false, error: String(e?.message || e) };
        }
      }, { supabaseUrl, courseId, version: publishedVersion });

      if (!snap || (snap as any).ok !== true) {
        throw new Error(`BLOCKED: get-course-version-snapshot failed. Details: ${JSON.stringify(snap).slice(0, 600)}`);
      }
      const snapshot = (snap as any).json?.snapshot;
      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error(`BLOCKED: missing snapshot in get-course-version-snapshot response. Body: ${JSON.stringify((snap as any).json).slice(0, 600)}`);
      }

      // Success: app should redirect after publishing (best-effort; don't block success if SPA routing doesn't emit a load event).
      await page.waitForURL(/\/admin\/courses\/select/, { timeout: 10_000 }).catch(() => undefined);
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

