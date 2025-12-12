/**
 * Configuration for integration tests
 * 
 * Loads environment variables and provides configuration constants.
 */

/**
 * Per NO-FALLBACK policy: require env vars explicitly
 * But allow graceful degradation for tests that can skip if vars are missing
 */
function requireEnvVar(name: string, allowMissing = false): string {
  const value = process.env[name];
  if (!value && !allowMissing) {
    console.error(`❌ ${name} is REQUIRED for integration tests`);
    throw new Error(`${name} environment variable is required`);
  }
  if (!value && allowMissing) {
    console.warn(`⚠️  ${name} is not set - some tests may be skipped`);
  }
  return value || '';
}

// Supabase configuration
// Per repo policy: NO hardcoded defaults. Load from env or learnplay.env.
import { loadLearnPlayEnv } from '@/../tests/helpers/parse-learnplay-env';
loadLearnPlayEnv();

const isLiveTest = process.env.RUN_LIVE_INTEGRATION === 'true';

export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  requireEnvVar('SUPABASE_URL', !isLiveTest);

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  requireEnvVar('SUPABASE_ANON_KEY', !isLiveTest);

// Agent token for service-level authentication
export const AGENT_TOKEN = process.env.AGENT_TOKEN;

// Organization ID for multi-tenant functions
export const ORGANIZATION_ID = process.env.ORGANIZATION_ID || 
                               process.env.VITE_ORGANIZATION_ID;

// Test timeouts
export const DEFAULT_TIMEOUT = 30000; // 30 seconds
export const LONG_TIMEOUT = 180000; // 3 minutes for slow operations

// Test account configuration
export interface TestAccountConfig {
  email: string;
  password: string;
}

export function getTestAccount(role: 'admin' | 'teacher' | 'parent' | 'student'): TestAccountConfig {
  const emailEnv = `E2E_${role.toUpperCase()}_EMAIL`;
  const passwordEnv = `E2E_${role.toUpperCase()}_PASSWORD`;
  
  return {
    email: requireEnvVar(emailEnv),
    password: requireEnvVar(passwordEnv),
  };
}

