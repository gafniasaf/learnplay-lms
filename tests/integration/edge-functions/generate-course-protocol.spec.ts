// Integration tests for protocol routing in generate-course

import { describe, test, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { loadLearnPlayEnv } from '../../helpers/parse-learnplay-env';

loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env`);
  }
  return String(v).trim();
}

describe('Protocol Integration', () => {
  let supabaseUrl: string;
  let agentToken: string;
  let orgId: string;
  let serviceRoleKey: string;

  beforeAll(() => {
    supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || requireEnv('SUPABASE_URL');
    agentToken = requireEnv('AGENT_TOKEN');
    orgId = requireEnv('ORGANIZATION_ID');
    serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  });

  test('enqueue-job should accept protocol parameter', async () => {
    const courseId = `test-protocol-${Date.now()}`;
    const response = await fetch(`${supabaseUrl}/functions/v1/enqueue-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': agentToken,
        'x-organization-id': orgId,
      },
      body: JSON.stringify({
        jobType: 'ai_course_generate',
        payload: {
          course_id: courseId,
          subject: 'Test Protocol',
          grade_band: '3-5',
          grade: '3-5',
          items_per_group: 3,
          mode: 'options',
          protocol: 'standard',
        },
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.jobId).toBeDefined();
  });

  test('enqueue-job should persist protocol to storage', async () => {
    const courseId = `test-protocol-storage-${Date.now()}`;
    const protocol = 'ec-expert';
    const studyText = 'Dit is een test-studietekst voor het EC Expert protocol.';
    
    const enqueueResponse = await fetch(`${supabaseUrl}/functions/v1/enqueue-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': agentToken,
        'x-organization-id': orgId,
      },
      body: JSON.stringify({
        jobType: 'ai_course_generate',
        payload: {
          course_id: courseId,
          subject: 'Test Protocol Storage',
          grade_band: '3-5',
          grade: '3-5',
          // Must be divisible by 3 for EC Expert cluster variants (1/2/3)
          items_per_group: 3,
          mode: 'options',
          protocol,
          notes: 'Protocol integration test (special requests)',
          study_text: studyText,
        },
      }),
    });

    expect(enqueueResponse.ok).toBe(true);
    const enqueueData = await enqueueResponse.json();
    expect(enqueueData.ok).toBe(true);
    const jobId = enqueueData.jobId;

    // Verify protocol was persisted to storage
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: file, error } = await supabase.storage
      .from('courses')
      .download(`debug/jobs/${jobId}/special_requests.json`);

    expect(error).toBeNull();
    expect(file).toBeDefined();
    
    const text = await file!.text();
    const parsed = JSON.parse(text);
    expect(parsed.protocol).toBe(protocol);
    expect(parsed.studyText).toBe(studyText);
  });
});

