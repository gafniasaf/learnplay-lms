import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect, getDemoCourseId } from './journeyAdapter';

test.describe('legacy parity: MCP metrics proxy wiring', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('admin pages can call mcp-metrics-proxy from the browser (no CORS block)', async ({ page }) => {
    const courseId = getDemoCourseId();

    await gotoStable(page, `/admin/editor/${courseId}`);
    await assertNotAuthRedirect(page);

    // Explicitly fetch from the browser context (don't rely on any route to auto-call it).
    const res = await page.evaluate(async () => {
      const supabaseUrl =
        (window as any)?.__runtimeConfig?.supabase?.url ||
        (window as any)?.runtimeConfig?.supabase?.url ||
        null;
      // Fallback: scrape from env banner logs is not reliable; this should be present in real-db runs.
      if (!supabaseUrl) return { ok: false, reason: 'missing_supabase_url' as const };
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/mcp-metrics-proxy?type=summary`, { method: 'GET' });
        const json = await r.json().catch(() => null);
        return { ok: true, status: r.status, json };
      } catch (e: any) {
        return { ok: false, reason: 'fetch_failed' as const, message: String(e?.message || e) };
      }
    });

    if (!res.ok) {
      throw new Error(`BLOCKED: browser fetch to mcp-metrics-proxy failed (${res.reason})${(res as any).message ? `: ${(res as any).message}` : ''}`);
    }

    expect(res.status, 'mcp-metrics-proxy should respond with 200 from browser context').toBe(200);
    expect(res.json && typeof res.json === 'object' ? (res.json as any).ok : false).toBe(true);
  });
});

