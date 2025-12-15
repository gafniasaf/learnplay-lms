import type { PlaywrightTestConfig } from '@playwright/test';
import { loadLearnPlayEnv } from './tests/helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from './tests/helpers/load-local-env';

// Attempt to auto-resolve required env vars from local env files (learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081; // Different port to avoid conflicts

const config: PlaywrightTestConfig = {
  testDir: '.',
  testMatch: ['tests/e2e/**/*.spec.ts', 'src/e2e/**/*.spec.ts'],
  // Never collect tests from legacy snapshots / nested apps (they may carry their own Playwright dependency).
  testIgnore: ['**/dawn-react-starter/**', '**/_archive/**'],
  timeout: 180_000, // 3 minutes for tests that create real jobs
  retries: 0, // No retries for real DB tests
  reporter: [
    ['list'], 
    ['junit', { outputFile: 'reports/playwright-real-db-junit.xml' }], 
    ['html', { outputFolder: 'reports/playwright-real-db-html', open: 'never' }]
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: false, // Run headed to see what's happening
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    actionTimeout: 15_000,
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --host`,
    port: PORT,
    reuseExistingServer: !process.env.CI, // Allow reusing existing server
    timeout: 300_000, // 5 minutes to handle slow Vite builds
    env: {
      // REAL DATABASE MODE - no mocking!
      VITE_USE_MOCK: 'false',
      // Use real Supabase credentials from .env
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  },
  // Projects for different auth states
  projects: [
    {
      name: 'setup',
      /**
       * Real-DB setup is intentionally scoped.
       *
       * We only run the setup files required for admin + legacy parity + health-gate flows.
       * Role-specific setups (student/teacher/parent) are covered by the Live config (playwright.live.config.ts),
       * because Real-DB runs are often used for targeted admin debugging and shouldn't be blocked by missing role creds.
       */
      testMatch: [
        /tests[\\/]e2e[\\/]health-gate\.setup\.ts/,
        /tests[\\/]e2e[\\/]admin\.setup\.ts/,
        /tests[\\/]e2e[\\/]legacy-parity[\\/]legacy-parity\.setup\.ts/,
      ],
    },
    {
      name: 'authenticated',
      use: {
        // Default authenticated state for real-db runs (tests may override per-file).
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
};

export default config;

