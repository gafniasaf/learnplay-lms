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
    // Use cross-env for cross-platform env vars
    // The env vars are baked into the build via vite.config.ts define block
    // Use the repo's static server with explicit SPA fallback so deep links work reliably in tests.
    // IMPORTANT: Do NOT set VITE_USE_MOCK=true (the app fails loudly when mock mode is enabled).
    command: 'npx cross-env SKIP_VERIFY=1 VITE_BYPASS_AUTH=true VITE_ENABLE_DEV=true PORT=8080 npm run build && node server.mjs',
    port: PORT,
    reuseExistingServer: false, // Always use fresh server to ensure mock mode is active
    timeout: 180_000, // 3 minutes for build + preview startup
    env: {
      SKIP_VERIFY: '1',
      VITE_BYPASS_AUTH: 'true',
      VITE_ENABLE_DEV: 'true',
      PORT: String(PORT),
    },
  },
  // Global setup - ensure clean state
  globalSetup: undefined,
};

export default config;


