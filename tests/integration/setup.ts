import { config } from 'dotenv';
import { resolve } from 'path';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';

// Load environment variables from .env.local first (if exists)
config({ path: resolve(__dirname, '../../.env.local') });

// Load from learnplay.env (takes precedence for missing vars)
loadLearnPlayEnv();

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY'
];

// Only require env vars if running live integration tests
// Skip gracefully if env vars are missing (tests will be skipped)
const isLiveTest = process.env.RUN_LIVE_INTEGRATION === 'true';
if (isLiveTest) {
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.warn(`⚠️  Missing ${envVar} - some integration tests will be skipped`);
    }
  }
}

// Set test-specific timeouts
if (!process.env.TEST_TIMEOUT) {
  process.env.TEST_TIMEOUT = '180000'; // 3 minutes
}

console.log('Integration test setup complete');
console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL || 'not set'}`);
console.log(`Test timeout: ${process.env.TEST_TIMEOUT}ms`);
