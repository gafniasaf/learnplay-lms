import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * Playwright Configuration for Integration Tests
 * 
 * This config runs tests against PRODUCTION Supabase (no mocks).
 * Tests verify real API calls, authentication, and Edge Function behavior.
 * 
 * Run with: npx playwright test --config=playwright.config.integration.ts
 */

const PORT = process.env.PORT ? Number(process.env.PORT) : 8081; // Different port from E2E

const config: PlaywrightTestConfig = {
  testDir: 'tests/integration',
  testMatch: ['**/*.spec.ts'],
  timeout: 120_000, // 2 minutes for real API calls
  retries: process.env.CI ? 1 : 0, // No retries in CI, one retry locally
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/playwright-integration-junit.xml' }],
    ['html', { outputFolder: 'reports/playwright-integration-html', open: 'never' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 30_000, // Wait up to 30s for actions (real APIs are slower)
  },
  webServer: {
    // Build WITHOUT mock mode - use real APIs
    command: 'npx cross-env VITE_USE_MOCK=false SKIP_VERIFY=1 npm run build && npm run preview -- --port 8081 --host',
    port: PORT,
    reuseExistingServer: !process.env.CI, // Reuse in local dev, always fresh in CI
    timeout: 180_000, // 3 minutes for build + preview startup
    env: {
      VITE_USE_MOCK: 'false', // CRITICAL: Use real APIs
      SKIP_VERIFY: '1',
    },
  },
  // Projects for different roles
  projects: [
    {
      name: 'setup-admin',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'setup-teacher',
      testMatch: /.*\.setup\.ts/,
      dependencies: ['setup-admin'],
    },
    {
      name: 'setup-parent',
      testMatch: /.*\.setup\.ts/,
      dependencies: ['setup-admin'],
    },
    {
      name: 'setup-student',
      testMatch: /.*\.setup\.ts/,
      dependencies: ['setup-admin'],
    },
    {
      name: 'integration-tests',
      testMatch: /.*\.spec\.ts/,
      use: {
        // Use authenticated state from setup
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup-admin', 'setup-teacher', 'setup-parent', 'setup-student'],
    },
  ],
};

export default config;

