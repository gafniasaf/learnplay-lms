import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../helpers/load-local-env';

/**
 * Setup: Authenticate as Teacher
 * 
 * This runs before authenticated teacher dashboard tests to create a valid session.
 */

const authFile = 'playwright/.auth/teacher.json';

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

setup('authenticate as teacher', async ({ page }) => {
  const teacherEmail = requireEnvVar('E2E_TEACHER_EMAIL');
  const teacherPassword = requireEnvVar('E2E_TEACHER_PASSWORD');
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
    try { window.localStorage.setItem('role', 'teacher'); } catch {}
  });

  const login = async () => {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: teacherEmail,
      password: teacherPassword,
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
      throw new Error(`Teacher programmatic login failed and SUPABASE_SERVICE_ROLE_KEY is missing (${String((e as any)?.message || e)})`);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: teacherEmail,
      password: teacherPassword,
      email_confirm: true,
      user_metadata: { role: 'teacher', organization_id: orgId },
    });
    if (createErr) {
      const msg = createErr.message || '';
      const alreadyExists = msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists');
      if (!alreadyExists) throw new Error(`Failed to auto-provision teacher user: ${createErr.message}`);
    }

    // Ensure org claim is present in auth metadata (required by RLS / auth hook).
    const userId = created?.user?.id;
    if (userId) {
      const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { organization_id: orgId },
        user_metadata: { organization_id: orgId, role: 'teacher' },
      });
      if (metaErr) throw new Error(`Failed to set teacher organization_id: ${metaErr.message}`);

      // Ensure at least viewer role in org for deterministic access to org-scoped resources.
      const { data: existingRoles, error: rolesErr } = await (admin as any)
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .eq('role', 'viewer')
        .limit(1);
      if (rolesErr) throw new Error(`Failed to query teacher user_roles: ${rolesErr.message}`);
      if (!Array.isArray(existingRoles) || existingRoles.length === 0) {
        const { error: insErr } = await (admin as any)
          .from('user_roles')
          .insert({ user_id: userId, organization_id: orgId, role: 'viewer' });
        if (insErr) throw new Error(`Failed to insert teacher viewer role: ${insErr.message}`);
      }
    }
    session = await login();
  }

  // Ensure teacher has required org membership/roles even if the user already existed.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to provision teacher org membership for real-db e2e');
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const teacherUserId = session.user.id;

  // Ensure org claim is present in auth metadata (required by auth hook / RLS).
  const { error: metaErr } = await adminClient.auth.admin.updateUserById(teacherUserId, {
    app_metadata: { organization_id: orgId },
    user_metadata: { organization_id: orgId, role: 'teacher' },
  });
  if (metaErr) throw new Error(`Failed to set teacher organization_id: ${metaErr.message}`);

  // Ensure org membership + role exists in organization_users (required by teacher endpoints).
  const { data: orgUser, error: orgUserErr } = await (adminClient as any)
    .from('organization_users')
    .select('org_role')
    .eq('org_id', orgId)
    .eq('user_id', teacherUserId)
    .maybeSingle();
  if (orgUserErr) throw new Error(`Failed to query teacher organization_users: ${orgUserErr.message}`);
  if (!orgUser) {
    const { error: insErr } = await (adminClient as any)
      .from('organization_users')
      .insert({ org_id: orgId, user_id: teacherUserId, org_role: 'teacher' });
    if (insErr) throw new Error(`Failed to insert teacher organization_users row: ${insErr.message}`);
  } else if ((orgUser as any).org_role !== 'teacher' && (orgUser as any).org_role !== 'school_admin') {
    const { error: updErr } = await (adminClient as any)
      .from('organization_users')
      .update({ org_role: 'teacher' })
      .eq('org_id', orgId)
      .eq('user_id', teacherUserId);
    if (updErr) throw new Error(`Failed to update teacher org_role: ${updErr.message}`);
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

  await page.goto('/teacher/dashboard');
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).not.toContain('/auth');
  
  await page.context().storageState({ path: authFile });
  
  console.log('✅ Teacher authentication setup complete');
});

