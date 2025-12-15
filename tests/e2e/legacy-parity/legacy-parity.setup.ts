import { test as setup, expect } from '@playwright/test';
import { getDemoCourseId, requireEnvVar } from './journeyAdapter';
import { loadLearnPlayEnv } from '../../helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../../helpers/load-local-env';

/**
 * Setup: verify deterministic fixtures exist for legacy-parity journeys.
 * Runs in the Playwright "setup" project (matches *.setup.ts).
 */
setup('verify demo course fixture exists', async ({ request }) => {
  // Attempt to auto-resolve required env vars from local env files (learnplay.env), without printing secrets.
  loadLocalEnvForTests();
  loadLearnPlayEnv();

  const supabaseUrl = requireEnvVar('VITE_SUPABASE_URL');
  const courseId = getDemoCourseId();

  const url = `${supabaseUrl}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`;
  const res = await request.get(url);

  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `❌ BLOCKED: Demo course '${courseId}' is not available in the linked Supabase project.\n` +
        `   GET ${url} → ${res.status()}\n` +
        (body ? `   Body: ${body.slice(0, 300)}\n` : '') +
        `\n` +
        `Fix: seed the canonical course, then re-run e2e.\n` +
        ` - Recommended seed: npx tsx scripts/seed-english-grammar-course.ts\n` +
        ` - Or set E2E_DEMO_COURSE_ID to an existing playable course id.`
    );
  }

  const json = await res.json().catch(() => null);
  expect(json).toBeTruthy();
});
