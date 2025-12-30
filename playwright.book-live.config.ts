import type { PlaywrightTestConfig } from "@playwright/test";
import { loadLocalEnvForTests } from "./tests/helpers/load-local-env";
import { loadLearnPlayEnv } from "./tests/helpers/parse-learnplay-env";

// Attempt to auto-resolve required env vars from local env files (no secret printing).
loadLocalEnvForTests();
loadLearnPlayEnv();

/**
 * Book live E2E config (API-only)
 *
 * Purpose:
 * - Run book pipeline E2E against REAL Supabase + REAL LLM without starting a local web server.
 * - Uses Playwright "request" fixture + local Prince rendering.
 */
const config: PlaywrightTestConfig = {
  testDir: ".",
  testMatch: ["tests/e2e/book-render-local-prince.live.spec.ts"],
  timeout: 600_000, // 10 minutes (real LLM + Prince render)
  retries: 0,
  reporter: [
    ["list"],
    ["junit", { outputFile: "reports/playwright-book-live-junit.xml" }],
    ["html", { outputFolder: "reports/playwright-book-live-html", open: "never" }],
  ],
  use: {
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
  },
};

export default config;


