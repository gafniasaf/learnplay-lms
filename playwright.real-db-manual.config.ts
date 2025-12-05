import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = 8081; // Use manually started dev server

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
