import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081;

// Real DB/LLM config: no mock mode, assumes env vars are set by caller
const config: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['junit', { outputFile: 'reports/playwright-real-junit.xml' }], ['html', { outputFolder: 'reports/playwright-real-html', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  webServer: {
    // Do a full build (with prebuild/verify) and preview on 8081
    command: process.platform === 'win32'
      ? 'npm run build && npm run preview -- --port 8081 --host'
      : 'npm run build && npm run preview -- --port 8081 --host',
    port: PORT,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      // Caller must provide real Supabase/MCP/LLM envs; no mock here
    },
  },
};

export default config;
import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081; // Different port to avoid conflicts

const config: PlaywrightTestConfig = {
  testDir: '.',
  testMatch: ['tests/e2e/**/*.spec.ts', 'src/e2e/**/*.spec.ts'],
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
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'authenticated',
      use: {
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
};

export default config;
