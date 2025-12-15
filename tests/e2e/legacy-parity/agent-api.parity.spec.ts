import { test, expect } from '@playwright/test';
import { loadLocalEnvForTests } from '../../helpers/load-local-env';

loadLocalEnvForTests();

function requireEnvVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`❌ ${name} is REQUIRED - set env var before running agent API parity`);
  return v;
}

test.describe('legacy parity: agent API smoke (Edge Functions)', () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    test('BLOCKED: missing Supabase URL env', async () => {
      requireEnvVar('VITE_SUPABASE_URL');
    });
    return;
  }

  test('list-jobs returns 401 without agent token', async ({ request }) => {
    const resp = await request.get(`${supabaseUrl}/functions/v1/list-jobs`);
    expect(resp.status()).toBe(401);
  });

  test('get-job returns 400/401 on missing id without agent token', async ({ request }) => {
    const resp = await request.get(`${supabaseUrl}/functions/v1/get-job`);
    expect([400, 401]).toContain(resp.status());
  });

  test('authorized list-jobs works when AGENT_TOKEN is provided', async ({ request }) => {
    test.skip(!process.env.AGENT_TOKEN, 'AGENT_TOKEN not set (required for authorized agent API smoke)');
    const resp = await request.get(`${supabaseUrl}/functions/v1/list-jobs`, {
      headers: { 'X-Agent-Token': process.env.AGENT_TOKEN! },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json).toHaveProperty('jobs');
  });

  test('authorized enqueue-job returns jobId when AGENT_TOKEN is provided', async ({ request }) => {
    test.skip(!process.env.AGENT_TOKEN, 'AGENT_TOKEN not set (required for authorized agent API smoke)');
    const resp = await request.post(`${supabaseUrl}/functions/v1/enqueue-job`, {
      headers: { 'X-Agent-Token': process.env.AGENT_TOKEN!, 'Content-Type': 'application/json' },
      data: {
        jobType: 'ai_course_generate',
        payload: {
          courseId: `legacy-parity-agent-${Date.now()}`,
          subject: `legacy-parity-agent-${Date.now()}`,
          gradeBand: 'All Grades',
          mode: 'options',
          itemsPerGroup: 4,
        },
      },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json).toHaveProperty('jobId');
  });
});

