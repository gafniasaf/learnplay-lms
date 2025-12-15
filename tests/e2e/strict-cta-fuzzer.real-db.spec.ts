/**
 * STRICT CTA FUZZER (Real DB)
 *
 * Goal: increase UI-surface coverage beyond "safe navigation" by clicking a wide
 * subset of `[data-cta-id]` CTAs while preventing destructive backend mutations.
 *
 * Default behavior is conservative (limited clicks). Set env vars to turn it up:
 * - STRICT_CTA_FUZZER_AGGRESSIVE=1
 * - STRICT_CTA_FUZZER_MAX_CLICKS=120
 * - STRICT_CTA_FUZZER_MAX_PAGES_PER_ROUTE=12
 * - STRICT_CRAWL_CLEANUP_PREFIXES="e2e-publish-,e2e-temp-"
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import { existsSync } from 'node:fs';

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

type Guard = { dispose(): void; assertOk(label: string): Promise<void> };

function installGuards(page: Page): Guard {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const http5xx: string[] = [];

  const onDialog = (d: any) => d.dismiss().catch(() => undefined);
  const onConsole = (msg: any) => {
    if (msg.type() !== 'error') return;
    const text = String(msg.text() || '');
    if (text.includes('favicon') || text.includes('ERR_BLOCKED_BY_CLIENT')) return;
    consoleErrors.push(text);
  };
  const onPageError = (err: any) => pageErrors.push(String(err?.message || err));
  const onResponse = (res: any) => {
    const status = res.status();
    if (status < 500) return;
    const url = res.url();
    if (url.includes('sentry') || url.includes('rudderstack')) return;
    http5xx.push(`${status} ${url}`);
  };

  page.on('dialog', onDialog);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  return {
    dispose() {
      page.off('dialog', onDialog);
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
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
    },
  };
}

async function gotoStable(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const suspenseFallback = page.getByText('Loading...').first();
  if (await suspenseFallback.isVisible().catch(() => false)) {
    await suspenseFallback.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }
}

async function expectNoErrorBoundary(page: Page, label: string) {
  const hasBoundary = await page.locator('text=Something went wrong').isVisible().catch(() => false);
  expect(hasBoundary, `[${label}] error boundary visible`).toBeFalsy();
}

async function cleanupE2ECourseLeftovers(browser: Browser) {
  const supabaseUrl = requireEnvVar('VITE_SUPABASE_URL');
  const serviceRoleKey = requireEnvVar('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY) is required');
  if (!existsSync('playwright/.auth/admin.json')) return;

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
  if (!adminToken) return;

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
    if (!listResp.ok) continue;
    const rows = (await listResp.json().catch(() => [])) as Array<{ id: string }>;
    const ids = Array.isArray(rows) ? rows.map((r) => r.id).filter(Boolean) : [];
    for (const courseId of ids) {
      await fetch(`${supabaseUrl}/functions/v1/delete-course`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ courseId, confirm: courseId }),
      }).catch(() => undefined);
    }
  }
}

function installMutationBlocker(page: Page) {
  const UNSAFE_FUNCTION = /(\/functions\/v1\/)(save-|update-|delete-|publish-|enqueue-job|apply-job-result|archive-|restore-)/i;

  // Block in-page destructive mutations while still letting read calls happen.
  page.route('**/*', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();

    const url = req.url();

    // Block PostgREST table mutations (allow rpc calls which may be read-only).
    if (url.includes('/rest/v1/') && !url.includes('/rest/v1/rpc/')) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, blocked: true, reason: 'blocked_rest_mutation', method, url }),
      });
    }

    // Block obviously mutative Edge Functions.
    if (UNSAFE_FUNCTION.test(url)) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, blocked: true, reason: 'blocked_function_mutation', method, url }),
      });
    }

    return route.continue();
  });
}

type RouteDef = { path: string; name: string; role?: 'admin' | 'student' | 'teacher' | 'parent' | 'anon' };

const ROUTES: RouteDef[] = [
  { path: '/', name: 'landing', role: 'anon' },
  { path: '/courses', name: 'course catalog', role: 'anon' },
  { path: '/help', name: 'help', role: 'anon' },
  { path: '/auth', name: 'auth', role: 'anon' },

  { path: '/admin/console', name: 'admin console', role: 'admin' },
  { path: '/admin/ai-pipeline', name: 'admin ai pipeline', role: 'admin' },
  { path: '/admin/courses/select', name: 'admin course select', role: 'admin' },
  { path: '/admin/jobs', name: 'admin jobs', role: 'admin' },
  { path: '/admin/system-health', name: 'admin system health', role: 'admin' },

  { path: '/student/dashboard', name: 'student dashboard', role: 'student' },
  { path: '/student/assignments', name: 'student assignments', role: 'student' },

  { path: '/teacher/dashboard', name: 'teacher dashboard', role: 'teacher' },
  { path: '/teacher/classes', name: 'teacher classes', role: 'teacher' },

  { path: '/parent/dashboard', name: 'parent dashboard', role: 'parent' },
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

async function getCtaIds(page: Page): Promise<string[]> {
  const ids = await page.locator('[data-cta-id]').evaluateAll((els) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const el of els) {
      const id = (el as HTMLElement).getAttribute('data-cta-id') || '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  });
  return Array.isArray(ids) ? ids : [];
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

test.describe('strict cta fuzzer (real-db)', () => {
  test.describe.configure({ timeout: 12 * 60 * 1000 });

  test.beforeAll(async ({ browser }) => {
    await cleanupE2ECourseLeftovers(browser);
  });

  test('clicks many CTAs without crashing (mutations blocked)', async ({ browser }) => {
    const aggressive = process.env.STRICT_CTA_FUZZER_AGGRESSIVE === '1';
    const maxClicks = getEnvInt('STRICT_CTA_FUZZER_MAX_CLICKS', aggressive ? 120 : 40);
    const maxPagesPerRoute = getEnvInt('STRICT_CTA_FUZZER_MAX_PAGES_PER_ROUTE', aggressive ? 12 : 6);

    const roleCtx = new Map<string, { context: any; page: Page; inited: boolean }>();

    const ensure = async (role?: string) => {
      const key = role || 'anon';
      const existing = roleCtx.get(key);
      if (existing) return existing;

      const statePath = role ? roleState(role) : undefined;
      if (statePath && !existsSync(statePath)) return null;

      const context = await browser.newContext(statePath ? { storageState: statePath } : undefined);
      const page = await context.newPage();
      roleCtx.set(key, { context, page, inited: false });
      return { context, page, inited: false };
    };

    try {
      for (const r of ROUTES) {
        const env = await ensure(r.role);
        if (!env) continue;

        const tracked = roleCtx.get(r.role || 'anon')!;
        const { page } = tracked;

        if (!tracked.inited) {
          installMutationBlocker(page);
          tracked.inited = true;
        }

        const guard = installGuards(page);
        try {
          await gotoStable(page, r.path);
          await expectNoErrorBoundary(page, r.name);
          await guard.assertOk(r.name);

          const visitedUrls = new Set<string>([page.url()]);
          const clicked = new Set<string>(); // url|cta

          for (let i = 0; i < maxClicks; i++) {
            await guard.assertOk(`${r.name} (pre-click)`);
            await expectNoErrorBoundary(page, r.name);

            if (visitedUrls.size > maxPagesPerRoute) break;

            const ids = await getCtaIds(page);
            const currentUrl = page.url();

            const next = ids.find((id) => !clicked.has(`${currentUrl}|${id}`));
            if (!next) break;
            clicked.add(`${currentUrl}|${next}`);

            const el = page.locator(`[data-cta-id="${next}"]`).first();
            const isVisible = await el.isVisible().catch(() => false);
            if (!isVisible) continue;
            const isEnabled = await el.isEnabled().catch(() => false);
            if (!isEnabled) continue;
            if (await isSubmitOrInForm(page, next)) continue;

            const popupPromise = page.waitForEvent('popup', { timeout: 1500 }).catch(() => null);
            await el.click({ timeout: 10_000 }).catch(() => undefined);
            const popup = await popupPromise;
            if (popup) await popup.close().catch(() => undefined);

            await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

            visitedUrls.add(page.url());
            await expectNoErrorBoundary(page, `${r.name} (after click ${next})`);
            await guard.assertOk(`${r.name} (after click ${next})`);
          }
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

