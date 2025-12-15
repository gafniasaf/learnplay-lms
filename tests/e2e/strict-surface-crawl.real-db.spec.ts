/**
 * STRICT SURFACE CRAWL (Real DB)
 *
 * Goal: reduce "human playwright" feeling by catching:
 * - runtime console/page errors
 * - failing Edge Function calls (5xx)
 * - broken routes / stuck loading
 *
 * This is intentionally conservative about mutations: it only performs safe navigations
 * and (optionally) clicks non-destructive CTAs.
 */
import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';

type Guard = { dispose(): void; assertOk(label: string): Promise<void> };

function requireEnvVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} environment variable is required`);
  return v;
}

function getEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function installGuards(page: Page): Guard {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const http5xx: string[] = [];
  const requestFailed: string[] = [];

  const onDialog = (d: any) => d.dismiss().catch(() => undefined);
  const onConsole = (msg: any) => {
    if (msg.type() !== 'error') return;
    const text = String(msg.text() || '');
    // Ignore browser noise / extensions.
    if (text.includes('favicon') || text.includes('ERR_BLOCKED_BY_CLIENT')) return;
    consoleErrors.push(text);
  };
  const onPageError = (err: any) => pageErrors.push(String(err?.message || err));
  const onResponse = (res: any) => {
    const status = res.status();
    if (status < 500) return;
    const url = res.url();
    // Ignore telemetry / external noise.
    if (url.includes('sentry') || url.includes('rudderstack')) return;
    http5xx.push(`${status} ${url}`);
  };
  const onRequestFailed = (req: any) => {
    requestFailed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'requestfailed'}`);
  };

  page.on('dialog', onDialog);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  return {
    dispose() {
      page.off('dialog', onDialog);
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
    },
    async assertOk(label: string) {
      if (pageErrors.length) throw new Error(`[${label}] pageerror: ${pageErrors[0]}`);

      const criticalConsole = consoleErrors.filter((t) =>
        t.includes('TypeError') ||
        t.includes('ReferenceError') ||
        t.includes('Maximum update depth exceeded') ||
        t.includes('ChunkLoadError') ||
        t.includes('Failed to fetch dynamically imported module') ||
        t.includes('Cannot read properties of undefined')
      );
      if (criticalConsole.length) throw new Error(`[${label}] console error: ${criticalConsole[0]}`);

      if (http5xx.length) throw new Error(`[${label}] 5xx response: ${http5xx[0]}`);

      const fatalReq = requestFailed.find((t) => t.includes('ERR_CONNECTION_REFUSED') || t.includes('net::ERR_CONNECTION_REFUSED'));
      if (fatalReq) throw new Error(`[${label}] requestfailed: ${fatalReq}`);
    },
  };
}

async function gotoStable(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  // Common Suspense fallback.
  const suspenseFallback = page.getByText('Loading...').first();
  if (await suspenseFallback.isVisible().catch(() => false)) {
    await suspenseFallback.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }
}

async function expectNotBlank(page: Page, label: string) {
  const bodyText = await page.locator('body').textContent().catch(() => '');
  if ((bodyText || '').trim().length > 10) return;

  const hasAnyUi = await page
    .locator('main, [role="main"], nav, header, [data-cta-id], button, a, input, textarea, select')
    .first()
    .isVisible()
    .catch(() => false);
  if (hasAnyUi) return;

  const childCount = await page.evaluate(() => document.body?.children?.length ?? 0).catch(() => 0);
  expect(childCount, `[${label}] body has no children`).toBeGreaterThan(0);
}

const UNSAFE_CTA_ID = /(delete|remove|destroy|archive|publish|approve|reject|save|create|generate|enqueue|run|submit|upload|import|seed|repair|fix|restore|link|unlink)/i;
// Conservative allowlist: only clicks CTAs that look like navigation/toggles (non-destructive).
const SAFE_CTA_ID = /(view|open|toggle|filter|sort|tab|expand|collapse|show|hide|more|help|back|next|prev|refresh|retry|copy|download)/i;
const UNSAFE_TEXT = /(delete|remove|destroy|archive|publish|approve|reject|save|create|generate|enqueue|run|submit|upload|import|seed|repair|fix|restore|link|unlink|send|confirm|assign|requeue|invalidate)/i;
const SAFE_TEXT = /(view|open|toggle|filter|sort|expand|collapse|show|hide|more|help|back|next|previous|refresh|retry|copy|download)/i;

type CtaCandidate = { id: string; action?: string; target?: string; text?: string; tag?: string; type?: string };

async function collectSafeCtas(page: Page): Promise<CtaCandidate[]> {
  const raw = await page.locator('[data-cta-id]').evaluateAll((els) =>
    els.map((n) => {
      const el = n as HTMLElement;
      const id = el.getAttribute('data-cta-id') || '';
      const action = el.getAttribute('data-action') || '';
      const target = el.getAttribute('data-target') || '';
      const tag = el.tagName.toLowerCase();
      const type = (tag === 'button' ? ((el as HTMLButtonElement).type || '') : '');
      const text = (el.textContent || '').trim().slice(0, 80);
      return { id, action, target, tag, type, text };
    })
  );

  return raw
    .filter((c) => c.id)
    .filter((c) => !UNSAFE_CTA_ID.test(c.id))
    .filter((c) => !c.action || !UNSAFE_CTA_ID.test(c.action))
    .filter((c) => !UNSAFE_TEXT.test(c.text || ''))
    .filter((c) => {
      // allow if clearly navigation or safe CTA id/text
      if (c.action === 'navigate') return true;
      if (c.target) return true;
      if (SAFE_CTA_ID.test(c.id)) return true;
      if (SAFE_TEXT.test(c.text || '')) return true;
      return false;
    });
}

async function isSubmitOrInForm(page: Page, ctaId: string): Promise<boolean> {
  const el = page.locator(`[data-cta-id="${ctaId}"]`).first();
  return await el.evaluate((node) => {
    const el = node as HTMLElement;
    if (el.tagName.toLowerCase() === 'button') {
      const type = (el as HTMLButtonElement).type;
      if (type && type.toLowerCase() === 'submit') return true;
    }
    return !!el.closest('form');
  }).catch(() => false);
}

async function clickSafeCtas(page: Page, guard: Guard, route: { path: string; name: string }) {
  const aggressive = process.env.STRICT_CRAWL_AGGRESSIVE === '1';
  const maxClicks = getEnvInt('STRICT_CRAWL_MAX_CTA_CLICKS', aggressive ? 20 : 6);
  const maxVisitedPages = getEnvInt('STRICT_CRAWL_MAX_PAGES_PER_ROUTE', aggressive ? 8 : 4);

  const clicked = new Set<string>(); // key: url|ctaId
  const visited = new Set<string>();

  // Start at the seed route and explore from there.
  await gotoStable(page, route.path);

  for (let i = 0; i < maxClicks; i++) {
    await guard.assertOk(`${route.name} (pre-cta)`);

    const currentUrl = page.url();
    visited.add(currentUrl);
    if (visited.size > maxVisitedPages) {
      await gotoStable(page, route.path);
      continue;
    }

    const candidates = await collectSafeCtas(page);
    const next = candidates.find((c) => !clicked.has(`${currentUrl}|${c.id}`));
    if (!next) break;

    clicked.add(`${currentUrl}|${next.id}`);

    const el = page.locator(`[data-cta-id="${next.id}"]`).first();
    const isVisible = await el.isVisible().catch(() => false);
    if (!isVisible) continue;
    const isEnabled = await el.isEnabled().catch(() => false);
    if (!isEnabled) continue;
    if (await isSubmitOrInForm(page, next.id)) continue;

    const popupPromise = page.waitForEvent('popup', { timeout: 1500 }).catch(() => null);
    const beforeUrl = page.url();

    await el.click({ timeout: 10_000 }).catch(() => undefined);
    const popup = await popupPromise;
    if (popup) await popup.close().catch(() => undefined);

    // Let SPA settle after click.
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    const hasBoundary = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(hasBoundary, `[${route.name}] error boundary after CTA click: ${next.id}`).toBeFalsy();
    await guard.assertOk(`${route.name} (post-cta ${next.id})`);

    // If CTA navigated off-origin, reset.
    const afterUrl = page.url();
    try {
      const b = new URL(beforeUrl);
      const a = new URL(afterUrl);
      if (a.origin !== b.origin) {
        await gotoStable(page, route.path);
      }
    } catch {
      // ignore URL parse issues; reset to be safe.
      await gotoStable(page, route.path);
    }
  }
}

async function cleanupE2EPublishLeftovers(browser: import('@playwright/test').Browser) {
  const supabaseUrl = requireEnvVar('VITE_SUPABASE_URL');
  const serviceRoleKey = requireEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY) is required');

  if (!existsSync('playwright/.auth/admin.json')) {
    throw new Error('Missing playwright/.auth/admin.json (run setup project first)');
  }

  // Get admin access token from the authenticated storageState (required by delete-course).
  const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const adminToken = await page.evaluate((url) => {
    const projectRef = new URL(url).hostname.split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.access_token || null;
  }, supabaseUrl);
  await ctx.close();
  if (!adminToken) throw new Error('Could not read admin access_token from storageState');

  // Default cleanup prefixes are conservative; you can extend via STRICT_CRAWL_CLEANUP_PREFIXES="e2e-publish-,e2e-temp-"
  const extra = (process.env.STRICT_CRAWL_CLEANUP_PREFIXES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const prefixes = Array.from(new Set(['e2e-publish-', ...extra]));

  for (const prefix of prefixes) {
    const like = encodeURIComponent(`${prefix}%`);
    const listUrl = `${supabaseUrl}/rest/v1/course_metadata?select=id&deleted_at=is.null&id=like.${like}`;
    const listResp = await fetch(listUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
      },
    });
    if (!listResp.ok) {
      const text = await listResp.text().catch(() => '');
      throw new Error(`cleanup list failed for prefix=${prefix}: ${listResp.status} ${text.slice(0, 500)}`);
    }
    const rows = (await listResp.json().catch(() => [])) as Array<{ id: string }>;
    const ids = Array.isArray(rows) ? rows.map((r) => r.id).filter(Boolean) : [];
    if (ids.length === 0) continue;

    // Delete via Edge Function (requires admin JWT so it can role-check user_roles).
    for (const courseId of ids) {
      const resp = await fetch(`${supabaseUrl}/functions/v1/delete-course`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ courseId, confirm: courseId }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`cleanup delete failed for ${courseId}: ${resp.status} ${text.slice(0, 500)}`);
      }
    }
  }
}

const ROUTES: Array<{ path: string; name: string; role?: 'admin' | 'student' | 'teacher' | 'parent' | 'anon' }> = [
  { path: '/', name: 'landing', role: 'anon' },
  { path: '/about', name: 'about', role: 'anon' },
  { path: '/courses', name: 'course catalog', role: 'anon' },
  { path: '/help', name: 'help', role: 'anon' },
  { path: '/kids', name: 'kids landing', role: 'anon' },
  { path: '/parents', name: 'parents landing', role: 'anon' },
  { path: '/schools', name: 'schools landing', role: 'anon' },
  { path: '/auth', name: 'auth', role: 'anon' },
  { path: '/settings', name: 'settings', role: 'anon' },

  { path: '/admin/console', name: 'admin console', role: 'admin' },
  { path: '/admin/ai-pipeline', name: 'admin ai pipeline', role: 'admin' },
  { path: '/admin/courses/select', name: 'admin course select', role: 'admin' },
  { path: '/admin/jobs', name: 'admin jobs', role: 'admin' },
  { path: '/admin/logs', name: 'admin logs', role: 'admin' },
  { path: '/admin/tools/media', name: 'admin media', role: 'admin' },
  { path: '/admin/performance', name: 'admin performance', role: 'admin' },
  { path: '/admin/system-health', name: 'admin system health', role: 'admin' },
  { path: '/admin/tags', name: 'admin tags', role: 'admin' },
  { path: '/admin/tags/approve', name: 'admin tag approval queue', role: 'admin' },
  { path: '/messages', name: 'messages', role: 'admin' },

  { path: '/student/dashboard', name: 'student dashboard', role: 'student' },
  { path: '/student/assignments', name: 'student assignments', role: 'student' },
  { path: '/student/achievements', name: 'student achievements', role: 'student' },
  { path: '/student/goals', name: 'student goals', role: 'student' },
  { path: '/student/timeline', name: 'student timeline', role: 'student' },
  { path: '/student/join-class', name: 'student join class', role: 'student' },
  { path: '/play', name: 'play (no course)', role: 'student' },
  { path: '/play/english-grammar-foundations', name: 'play seeded demo course', role: 'student' },
  { path: '/results', name: 'results', role: 'student' },

  { path: '/teacher/dashboard', name: 'teacher dashboard', role: 'teacher' },
  { path: '/teacher/students', name: 'teacher students', role: 'teacher' },
  { path: '/teacher/classes', name: 'teacher classes', role: 'teacher' },
  { path: '/teacher/class-progress', name: 'teacher class progress', role: 'teacher' },
  { path: '/teacher/assignments', name: 'teacher assignments', role: 'teacher' },
  { path: '/teacher/analytics', name: 'teacher analytics', role: 'teacher' },
  { path: '/teacher/control', name: 'teacher control', role: 'teacher' },

  { path: '/catalog-builder', name: 'catalog builder', role: 'admin' },
  { path: '/catalog-builder/media', name: 'catalog builder media', role: 'admin' },
  { path: '/crm/dashboard', name: 'crm dashboard', role: 'admin' },
  { path: '/crm/contacts', name: 'crm contacts', role: 'admin' },

  { path: '/parent/dashboard', name: 'parent dashboard', role: 'parent' },
  { path: '/parent/subjects', name: 'parent subjects', role: 'parent' },
  { path: '/parent/topics', name: 'parent topics', role: 'parent' },
  { path: '/parent/timeline', name: 'parent timeline', role: 'parent' },
  { path: '/parent/goals', name: 'parent goals', role: 'parent' },
  { path: '/parent/link-child', name: 'parent link child', role: 'parent' },

  { path: '/this-route-does-not-exist-12345', name: '404', role: 'anon' },
];

function roleState(role: string) {
  switch (role) {
    case 'admin': return 'playwright/.auth/admin.json';
    case 'student': return 'playwright/.auth/student.json';
    case 'teacher': return 'playwright/.auth/teacher.json';
    case 'parent': return 'playwright/.auth/parent.json';
    default: return undefined;
  }
}

test.describe('strict surface crawl (real-db)', () => {
  test.describe.configure({ timeout: 10 * 60 * 1000 }); // this is intentionally large; the crawl is broad

  test.beforeAll(async ({ browser }) => {
    // Ensure we don't accumulate junk Real DB courses from old publish parity runs.
    await cleanupE2EPublishLeftovers(browser);
  });

  test('routes load without crashes / 5xx', async ({ browser }) => {
    // Reuse contexts per role to speed up the crawl.
    const roleCtx = new Map<string, { context: any; page: Page }>();

    const ensure = async (role?: string) => {
      const key = role || 'anon';
      const existing = roleCtx.get(key);
      if (existing) return existing;

      const statePath = role ? roleState(role) : undefined;
      if (statePath && !existsSync(statePath)) return null;

      const context = await browser.newContext(statePath ? { storageState: statePath } : undefined);
      const page = await context.newPage();
      roleCtx.set(key, { context, page });
      return { context, page };
    };

    try {
      for (const r of ROUTES) {
        const env = await ensure(r.role);
        if (!env) continue;

        const { page } = env;
        const guard = installGuards(page);
        try {
          await gotoStable(page, r.path);

          // No error boundary.
          const hasBoundary = await page.locator('text=Something went wrong').isVisible().catch(() => false);
          expect(hasBoundary, `[${r.name}] error boundary visible`).toBeFalsy();

          // Not blank (allow icon-heavy pages with little text).
          await expectNotBlank(page, r.name);

          await guard.assertOk(r.name);

          // Click a conservative, non-destructive subset of CTAs for extra surface coverage.
          await clickSafeCtas(page, guard, r);
        } finally {
          guard.dispose();
        }
      }
    } finally {
      for (const { context } of roleCtx.values()) {
        await context.close();
      }
      roleCtx.clear();
    }
  });
});

