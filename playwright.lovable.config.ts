/**
 * Playwright config for Lovable smoke tests
 * 
 * Runs against deployed Lovable preview instead of local server
 * Usage: npx playwright test --config=playwright.lovable.config.ts
 */

import type { PlaywrightTestConfig } from '@playwright/test';

const LOVABLE_URL = process.env.LOVABLE_URL || 'https://preview--learnplay-lms.lovable.app';

const config: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  testMatch: ['lovable-smoke.spec.ts'], // Only run Lovable-specific tests
  timeout: 60_000,
  retries: 1, // One retry for network flakiness
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/lovable-smoke', open: 'never' }],
  ],
  use: {
    baseURL: LOVABLE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000, // Longer timeout for remote server
    // Real browser user agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  // NO webServer - we're testing against deployed Lovable
  webServer: undefined,
  
  // Projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
    // Optionally test on other browsers
    // {
    //   name: 'firefox',
    //   use: { browserName: 'firefox' },
    // },
  ],
};

export default config;

