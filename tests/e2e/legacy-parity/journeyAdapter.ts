import { expect, type Page } from '@playwright/test';

export function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ ${name} is REQUIRED - set env var before running parity journeys`);
  }
  return value;
}

export function getEnvVar(name: string): string | undefined {
  return process.env[name];
}

/**
 * Deterministic demo fixture for parity tests.
 * Prefer explicit E2E_DEMO_COURSE_ID, otherwise use the seeded canonical course id.
 */
export function getDemoCourseId(): string {
  return process.env.E2E_DEMO_COURSE_ID || 'english-grammar-foundations';
}

/**
 * Installs a deterministic window.prompt implementation.
 * Must be called before navigation to pages that call prompt().
 */
export async function installPromptStub(page: Page, responseText: string): Promise<void> {
  await page.addInitScript(({ responseText }) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).prompt = () => responseText;
    } catch {
      // ignore
    }
  }, { responseText });
}

/**
 * Navigate with a resilient wait strategy (networkidle can hang on SSE/realtime).
 */
export async function gotoStable(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });

  // Avoid hanging indefinitely on routes that use realtime/SSE.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

  // Many routes are lazy-loaded under Suspense; wait for the global fallback to clear.
  const suspenseFallback = page.getByText('Loading...').first();
  const fallbackVisible = await suspenseFallback.isVisible().catch(() => false);
  if (fallbackVisible) {
    try {
      await suspenseFallback.waitFor({ state: 'hidden', timeout: 45_000 });
    } catch {
      throw new Error(
        `Route did not finish loading within 45s (still showing 'Loading...'). ` +
          `Tried: ${path}. Current URL: ${page.url()}`
      );
    }
  }
}

export async function assertNotAuthRedirect(page: Page): Promise<void> {
  const url = page.url();
  expect(url.includes('/auth') || url.includes('/login'), `Unexpected auth redirect to: ${url}`).toBeFalsy();
}
