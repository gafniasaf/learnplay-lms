import { test, expect } from '@playwright/test';
import { gotoStable, assertNotAuthRedirect, getDemoCourseId } from './journeyAdapter';

test.describe('legacy parity: MCP metrics proxy wiring', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('admin pages can call mcp-metrics-proxy from the browser (no CORS block)', async ({ page }) => {
    const courseId = getDemoCourseId();
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('BLOCKED: missing VITE_SUPABASE_URL for mcp-metrics-proxy parity');
    }

    await gotoStable(page, `/admin/editor/${courseId}`);
    await assertNotAuthRedirect(page);

    // Explicitly fetch from the browser context (don't rely on any route to auto-call it).
    const res = await page.evaluate(async ({ supabaseUrl }) => {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/mcp-metrics-proxy?type=summary`, { method: 'GET' });
        const json = await r.json().catch(() => null);
        return { ok: true, status: r.status, json };
      } catch (e: any) {
        return { ok: false, reason: 'fetch_failed' as const, message: String(e?.message || e) };
      }
    }, { supabaseUrl });

    if (!res.ok) {
      throw new Error(`BLOCKED: browser fetch to mcp-metrics-proxy failed (${res.reason})${(res as any).message ? `: ${(res as any).message}` : ''}`);
    }

    expect(res.status, 'mcp-metrics-proxy should respond with 200 from browser context').toBe(200);
    expect(res.json && typeof res.json === 'object' ? (res.json as any).ok : false).toBe(true);
  });
});

