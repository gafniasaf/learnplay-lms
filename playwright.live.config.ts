import type { PlaywrightTestConfig } from '@playwright/test';
import { parseLearnPlayEnv } from './tests/helpers/parse-learnplay-env';

// Read environment variables from learnplay.env
const env = parseLearnPlayEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
                    process.env.VITE_SUPABASE_ANON_KEY || 
                    env.SUPABASE_ANON_KEY;
const openaiKey = process.env.VITE_OPENAI_API_KEY || 
                  process.env.OPENAI_API_KEY || 
                  env.OPENAI_API_KEY;
const anthropicKey = process.env.VITE_ANTHROPIC_API_KEY || 
                     process.env.ANTHROPIC_API_KEY || 
                     env.ANTHROPIC_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or ensure learnplay.env exists.');
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 8082;

/**
 * Live E2E Test Configuration
 * 
 * Uses REAL Supabase and REAL LLM calls - no mocks!
 * 
 * Usage:
 *   npm run e2e:live
 * 
 * Make sure you have:
 *   - learnplay.env with Supabase credentials
 *   - Admin account created (run scripts/create-admin.ts first)
 */
const config: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  testMatch: ['**/*live*.spec.ts', '**/live-*.spec.ts', '**/dashboard-loading.spec.ts'],
  timeout: 180_000, // 3 minutes for tests with real LLM calls
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/playwright-live-junit.xml' }],
    ['html', { outputFolder: 'reports/playwright-live-html', open: 'never' }]
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: !process.env.HEADED, // Can be overridden with HEADED=1
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 30_000, // Longer timeout for real API calls
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --host`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // 5 minutes for Vite build
    env: {
      // LIVE MODE - no mocking!
      VITE_USE_MOCK: 'false',
      // Ensure localhost runs use real session auth (not dev agent-token mode)
      VITE_FORCE_LIVE: 'true',
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_ANON_KEY: supabaseKey,
      // Use real LLM APIs (no mocking)
      VITE_OPENAI_API_KEY: openaiKey || '',
      VITE_ANTHROPIC_API_KEY: anthropicKey || '',
      OPENAI_API_KEY: openaiKey || '',
    },
  },
  projects: [
    {
      name: 'setup-student',
      testMatch: /.*student\.setup\.ts/,
    },
    {
      name: 'setup-teacher',
      testMatch: /.*teacher\.setup\.ts/,
    },
    {
      name: 'setup-parent',
      testMatch: /.*parent\.setup\.ts/,
    },
    {
      name: 'setup-admin',
      testMatch: /.*admin\.setup\.ts/,
    },
    {
      name: 'student-tests',
      use: {
        storageState: 'playwright/.auth/student.json',
      },
      dependencies: ['setup-student'],
      testMatch: /.*dashboard-loading.*student.*spec\.ts/,
    },
    {
      name: 'teacher-tests',
      use: {
        storageState: 'playwright/.auth/teacher.json',
      },
      dependencies: ['setup-teacher'],
      testMatch: /.*dashboard-loading.*teacher.*spec\.ts/,
    },
    {
      name: 'parent-tests',
      use: {
        storageState: 'playwright/.auth/parent.json',
      },
      dependencies: ['setup-parent'],
      testMatch: /.*dashboard-loading.*parent.*spec\.ts/,
    },
    {
      name: 'authenticated',
      use: {
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup-admin'],
    },
  ],
};

export default config;
