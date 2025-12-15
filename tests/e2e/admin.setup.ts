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

  // Ensure the admin user has an org_admin role in the primary org.
  // Some backend endpoints (e.g. publish-course) validate authorization via user_roles,
  // and localStorage.role is NOT sufficient.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to provision admin user_roles for real-db e2e');
  }
  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: orgRow, error: orgErr } = await (adminClient as any)
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (orgErr || !orgRow?.id) {
      throw new Error(orgErr?.message || 'No organizations found');
    }
    const orgId = String(orgRow.id);

    const { data: existingRoles, error: rolesErr } = await (adminClient as any)
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', session.user.id);
    if (rolesErr) throw new Error(rolesErr.message || 'Failed to query user_roles');

    const hasPrivRole = Array.isArray(existingRoles) &&
      existingRoles.some((r: any) =>
        (r?.organization_id === orgId) && (r?.role === 'org_admin' || r?.role === 'editor')
      );

    if (!hasPrivRole) {
      const { error: insErr } = await (adminClient as any)
        .from('user_roles')
        .insert({ user_id: session.user.id, organization_id: orgId, role: 'org_admin' });
      if (insErr) throw new Error(insErr.message || 'Failed to insert org_admin role');
    }
  } catch (e: any) {
    throw new Error(`Failed to ensure admin user_roles: ${String(e?.message || e)}`);
  }

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

