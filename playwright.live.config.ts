import type { PlaywrightTestConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

// Read environment variables from learnplay.env
const envFile = path.resolve(__dirname, 'learnplay.env');
let supabaseUrl = process.env.VITE_SUPABASE_URL;
let supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  try {
    const envContent = readFileSync(envFile, 'utf-8');
    const lines = envContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('Project url') && i + 1 < lines.length) {
        supabaseUrl = lines[i + 1].trim();
      }
      if (line.includes('anon public') && i + 1 < lines.length) {
        supabaseKey = lines[i + 1].trim();
      }
    }
  } catch (error) {
    console.warn('Could not read learnplay.env, using environment variables');
  }
}

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
 *   - VITE_SUPABASE_URL set (or in learnplay.env)
 *   - VITE_SUPABASE_ANON_KEY set (or in learnplay.env)
 *   - Admin account created (run scripts/create-admin.ts first)
 */
const config: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  testMatch: ['**/*live*.spec.ts', '**/live-*.spec.ts'],
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
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_ANON_KEY: supabaseKey,
      // Use real LLM APIs (no mocking)
      VITE_OPENAI_API_KEY: process.env.VITE_OPENAI_API_KEY || '',
      VITE_ANTHROPIC_API_KEY: process.env.VITE_ANTHROPIC_API_KEY || '',
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'authenticated',
      use: {
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
};

export default config;

