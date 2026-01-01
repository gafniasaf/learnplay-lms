import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../helpers/load-local-env';

/**
 * Setup: Authenticate as Parent
 * 
 * This runs before authenticated parent dashboard tests to create a valid session.
 */

const authFile = 'playwright/.auth/parent.json';

const LOGIN_FORM_TIMEOUT_MS = 10000;
const LOGIN_REDIRECT_TIMEOUT_MS = 20000;

// Attempt to auto-resolve required env vars from local env files (learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

setup('authenticate as parent', async ({ page }) => {
  const parentEmail = requireEnvVar('E2E_PARENT_EMAIL');
  const parentPassword = requireEnvVar('E2E_PARENT_PASSWORD');
  const orgId = requireEnvVar('ORGANIZATION_ID');

  const supabaseUrl = requireEnvVar('VITE_SUPABASE_URL');
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  if (!supabaseAnonKey) {
    throw new Error('Supabase anon key is required (VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY)');
  }

  await page.addInitScript(() => {
    try { window.localStorage.setItem('iz_dev_agent_disabled', '1'); } catch {}
    try { window.sessionStorage.setItem('iz_dev_agent_disabled', '1'); } catch {}
    try { window.localStorage.setItem('role', 'parent'); } catch {}
  });

  const login = async () => {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parentEmail,
      password: parentPassword,
    });
    if (error || !data?.session) throw new Error(error?.message || 'no session returned');
    return data.session;
  };

  let session;
  try {
    session = await login();
  } catch (e) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error(`Parent programmatic login failed and SUPABASE_SERVICE_ROLE_KEY is missing (${String((e as any)?.message || e)})`);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: parentEmail,
      password: parentPassword,
      email_confirm: true,
      user_metadata: { role: 'parent', organization_id: orgId },
    });
    if (createErr) {
      const msg = createErr.message || '';
      const alreadyExists = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists');
      if (!alreadyExists) throw new Error(`Failed to auto-provision parent user: ${createErr.message}`);
    }

    // Ensure org claim is present in auth metadata (required by RLS / auth hook).
    const userId = created?.user?.id;
    if (userId) {
      const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { organization_id: orgId },
        user_metadata: { organization_id: orgId, role: 'parent' },
      });
      if (metaErr) throw new Error(`Failed to set parent organization_id: ${metaErr.message}`);

      const { data: existingRoles, error: rolesErr } = await (admin as any)
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .eq('role', 'viewer')
        .limit(1);
      if (rolesErr) throw new Error(`Failed to query parent user_roles: ${rolesErr.message}`);
      if (!Array.isArray(existingRoles) || existingRoles.length === 0) {
        const { error: insErr } = await (admin as any)
          .from('user_roles')
          .insert({ user_id: userId, organization_id: orgId, role: 'viewer' });
        if (insErr) throw new Error(`Failed to insert parent viewer role: ${insErr.message}`);
      }
    }
    session = await login();
  }

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;

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

  await page.goto('/parent/dashboard');
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).not.toContain('/auth');
  
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Parent authentication setup complete');
});

