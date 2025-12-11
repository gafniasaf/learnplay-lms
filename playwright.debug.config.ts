/**
 * Debug config - reuses existing dev server
 * Usage: npx playwright test --config=playwright.debug.config.ts --headed
 */
import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  // NO webServer - reuses whatever is running on 8080
};

export default config;


