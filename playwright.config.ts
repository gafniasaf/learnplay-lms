import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const config: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 60_000, // Increased to 60s for slow pages
  retries: process.env.CI ? 2 : 1, // Retry once for flaky tests
  reporter: [['list'], ['junit', { outputFile: 'reports/playwright-junit.xml' }], ['html', { outputFolder: 'reports/playwright-html', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000, // Wait up to 10s for actions
  },
  webServer: {
    // Use cross-env for cross-platform env vars and build:dev to skip prebuild (verify)
    // The env vars are baked into the build via vite.config.ts define block
    command: 'npx cross-env VITE_USE_MOCK=true SKIP_VERIFY=1 VITE_BYPASS_AUTH=true npm run build:dev && npm run preview -- --port 8080 --host',
    port: PORT,
    reuseExistingServer: false, // Always use fresh server to ensure mock mode is active
    timeout: 180_000, // 3 minutes for build + preview startup
    env: {
      VITE_USE_MOCK: 'true',
      SKIP_VERIFY: '1',
      VITE_BYPASS_AUTH: 'true',
    },
  },
  // Global setup - ensure clean state
  globalSetup: undefined,
};

export default config;


