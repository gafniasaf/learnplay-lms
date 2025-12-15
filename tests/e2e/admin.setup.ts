import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../helpers/load-local-env';

/**
 * Setup: Authenticate as Admin
 * 
 * This runs before authenticated tests to create a valid session.
 */

const authFile = 'playwright/.auth/admin.json';

// Timeout constants for E2E tests
const LOGIN_FORM_TIMEOUT_MS = 10000; // 10 seconds
const LOGIN_REDIRECT_TIMEOUT_MS = 20000; // 20 seconds

// Attempt to auto-resolve required env vars from local env files (learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

/**
 * Validates that a required environment variable is set
 * Throws with a clear error message if missing (NO-FALLBACK policy)
 */
function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

setup('authenticate as admin', async ({ page }) => {
  // Read admin credentials - REQUIRED env vars per NO-FALLBACK policy
  const adminEmail = requireEnvVar('E2E_ADMIN_EMAIL');
  const adminPassword = requireEnvVar('E2E_ADMIN_PASSWORD');
  const supabaseUrl = requireEnvVar('VITE_SUPABASE_URL');
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!supabaseAnonKey) {
    console.error(`❌ VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY) is REQUIRED - set env var before running tests`);
    throw new Error('Supabase anon key environment variable is required');
  }

  // Live/localhost runs should use real Supabase session auth (NOT dev-agent mode).
  // Disable dev-agent overlays before any navigation.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('iz_dev_agent_disabled', '1'); } catch {}
    try { window.sessionStorage.setItem('iz_dev_agent_disabled', '1'); } catch {}
    // Role is used by some admin pages as a guard (devOverrideRole).
    try { window.localStorage.setItem('role', 'admin'); } catch {}
  });

  // Programmatic login (avoids UI flake / loading hangs on /auth).
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (error || !data?.session) {
    throw new Error(`Admin programmatic login failed: ${error?.message || 'no session returned'}`);
  }
  const session = data.session;
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  // Visit any page on our origin so localStorage is available, then inject session.
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(
    ({ k, s }) => {
      try {
        // Supabase Auth (auth-js) stores the Session directly under storageKey.
        window.localStorage.setItem(k, JSON.stringify(s));
      } catch {
        // ignore
      }
    },
    { k: storageKey, s: session }
  );
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // Save authenticated state
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Admin authentication setup complete');
});

