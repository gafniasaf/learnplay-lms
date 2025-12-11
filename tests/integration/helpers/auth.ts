import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Authentication helpers for integration tests
 * 
 * Provides utilities to authenticate as different roles (admin, teacher, parent, student)
 * against production Supabase for integration testing.
 */

// Per NO-FALLBACK policy: require env vars explicitly
function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED for integration tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

// Get Supabase configuration from env vars
const SUPABASE_URL = process.env.SUPABASE_URL || requireEnvVar('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || requireEnvVar('VITE_SUPABASE_ANON_KEY');

export interface AuthenticatedUser {
  user: {
    id: string;
    email: string;
    role?: string;
  };
  supabase: SupabaseClient;
  accessToken: string;
}

/**
 * Authenticate as a specific role
 * 
 * Uses test accounts configured via environment variables:
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (existing)
 * - E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD (new)
 * - E2E_PARENT_EMAIL / E2E_PARENT_PASSWORD (new)
 * - E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD (new)
 */
export async function authenticateAs(role: 'admin' | 'teacher' | 'parent' | 'student'): Promise<AuthenticatedUser> {
  const emailEnv = `E2E_${role.toUpperCase()}_EMAIL`;
  const passwordEnv = `E2E_${role.toUpperCase()}_PASSWORD`;
  
  const email = requireEnvVar(emailEnv);
  const password = requireEnvVar(passwordEnv);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Sign in
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (authError || !authData.user || !authData.session) {
    throw new Error(
      `Failed to authenticate as ${role}: ${authError?.message || 'No session returned'}`
    );
  }
  
  return {
    user: {
      id: authData.user.id,
      email: authData.user.email || email,
      role: authData.user.user_metadata?.role || role,
    },
    supabase,
    accessToken: authData.session.access_token,
  };
}

/**
 * Get authentication token for a role (for direct API calls)
 */
export async function getAuthToken(role: 'admin' | 'teacher' | 'parent' | 'student'): Promise<string> {
  const { accessToken } = await authenticateAs(role);
  return accessToken;
}

/**
 * Load Playwright auth state from file
 * 
 * Reads stored authentication state from playwright/.auth/{role}.json
 */
export function loadPlaywrightAuthState(role: 'admin' | 'teacher' | 'parent' | 'student'): any {
  const authFile = join(process.cwd(), 'playwright', '.auth', `${role}.json`);
  
  if (!existsSync(authFile)) {
    throw new Error(
      `Auth state file not found: ${authFile}. Run Playwright auth setup first.`
    );
  }
  
  try {
    const content = readFileSync(authFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load auth state from ${authFile}: ${error}`);
  }
}

/**
 * Create Supabase client with authentication
 */
export function createAuthenticatedClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

