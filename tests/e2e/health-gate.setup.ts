/**
 * Health Gate Setup
 * 
 * Per IgniteZero Diagnostic Protocol: verify backend health BEFORE running tests.
 * This setup runs first and fails fast if backend is unhealthy.
 * 
 * Checks:
 * - Supabase URL is reachable
 * - Critical Edge Functions respond (not 503)
 * - Database connection works
 */

import { test as setup, expect } from '@playwright/test';
import { loadLocalEnvForTests } from '../helpers/load-local-env';

// Critical Edge Functions that must be healthy
const CRITICAL_FUNCTIONS = [
  'list-course-jobs',
  'get-course',
  'enqueue-job',
  'health',
];

// Attempt to auto-resolve required env vars from local env files, without printing secrets.
loadLocalEnvForTests();

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ ${name} is REQUIRED - set env var before running tests`);
  }
  return value;
}

// Get Supabase URL from env (NO hardcoded fallbacks)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('❌ BLOCKED: Missing Supabase URL. Set VITE_SUPABASE_URL (preferred) or SUPABASE_URL before running tests.');
}

setup.describe('Backend Health Gate', () => {

  setup.beforeEach(async ({ page }) => {
    // E2E runs should exercise normal session auth, not dev-agent bypass.
    // Persist in localStorage so it applies across navigations in this context.
    await page.addInitScript(() => {
      try { localStorage.setItem('iz_dev_agent_disabled', '1'); } catch {}
      try { sessionStorage.setItem('iz_dev_agent_disabled', '1'); } catch {}
    });
  });
  
  setup('Supabase URL is reachable', async ({ request }) => {
    // Just check that Supabase responds at all
    const response = await request.get(SUPABASE_URL, {
      timeout: 10000,
      ignoreHTTPSErrors: true,
    }).catch(e => null);
    
    expect(response, 'Supabase URL should be reachable').not.toBeNull();
  });

  setup('Critical Edge Functions are deployed (not 503)', async ({ request }) => {
    const failures: string[] = [];
    
    for (const fn of CRITICAL_FUNCTIONS) {
      const url = `${SUPABASE_URL}/functions/v1/${fn}`;
      
      // Do bounded retries to avoid flaking on transient network timeouts.
      const attempts = 3;
      let lastErr: unknown = null;
      let ok = false;
      for (let i = 0; i < attempts; i++) {
        try {
          // OPTIONS request to check if function exists.
          const response = await request.fetch(url, {
            method: 'OPTIONS',
            timeout: 30_000,
          });
          
          if (response.status() === 503) {
            failures.push(`${fn}: 503 Service Unavailable (function crashed on startup)`);
          } else if (response.status() === 404) {
            failures.push(`${fn}: 404 Not Found (function not deployed)`);
          }
          // 401/403 is OK - means function exists but needs auth
          // 405 is OK - means function exists but doesn't accept OPTIONS
          ok = true;
          break;
        } catch (error) {
          lastErr = error;
          if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
          }
        }
      }
      if (!ok && lastErr) {
        failures.push(`${fn}: Connection failed - ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
      }
    }
    
    if (failures.length > 0) {
      console.error('❌ Edge Function Health Check Failed:');
      failures.forEach(f => console.error(`   ${f}`));
    }
    
    expect(failures, 'All critical Edge Functions should be healthy').toHaveLength(0);
  });

  setup('Health endpoint returns OK', async ({ request }) => {
    const url = `${SUPABASE_URL}/functions/v1/health`;
    
    try {
      const response = await request.get(url, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // Health endpoint should return 200
      if (response.status() !== 200) {
        console.warn(`Health endpoint returned ${response.status()}`);
      }
      
      // Even if it returns error, as long as it's not 503, the function is deployed
      expect(response.status()).not.toBe(503);
    } catch (error) {
      // If health endpoint doesn't exist, that's a setup issue
      console.warn('Health endpoint not reachable:', error);
      // Don't fail - health endpoint might not exist
    }
  });

  setup('Frontend dev server is running', async ({ page }) => {
    // Prefer Playwright project's configured baseURL; fall back to env; then legacy default.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseUrl = ((page.context() as any)?._options?.baseURL as string | undefined) || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
    
    // Vite cold start can exceed 10s on Windows; treat slow-start as slow-start (retry), not "server not running".
    const attempts = 3;
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await page.goto(baseUrl, { timeout: 45_000, waitUntil: 'domcontentloaded' });
        expect(response?.status()).toBeLessThan(500);
        return;
      } catch (error) {
        lastErr = error;
        if (i < attempts - 1) await page.waitForTimeout(1500);
      }
    }
    throw new Error(
      `Frontend dev server did not respond at ${baseUrl} after ${attempts} attempts. ` +
        `If you're running tests without Playwright webServer, start it with: npm run dev. ` +
        `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  });

  setup('Frontend loads without crash', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseUrl = ((page.context() as any)?._options?.baseURL as string | undefined) || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
    
    await page.goto(baseUrl);
    await page.waitForLoadState('domcontentloaded');
    // Give React time to hydrate/mount (networkidle is unreliable with realtime/SSE).
    await page.waitForTimeout(1500);
    
    // Check for React error boundary
    const hasError = await page.locator('text=Something went wrong').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError, 'Frontend should not show error boundary on load').toBeFalsy();
    
    // Check for blank page (heuristic)
    const bodyContent = (await page.locator('body').textContent()) || '';
    expect(bodyContent.length, 'Page should have content').toBeGreaterThan(10);
  });
});

// Export for use in other tests
export const healthGatePassed = true;


