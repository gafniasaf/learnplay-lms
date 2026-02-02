/**
 * E2E test script for multi-week lesson plan generation
 * Tests the full flow: teacher-chat-assistant -> enqueue-job -> ai-job-runner
 */
import { parseLearnPlayEnv } from '../tests/helpers/parse-learnplay-env';

const env = parseLearnPlayEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const AGENT_TOKEN = env.AGENT_TOKEN || '';

// Teacher organization for testing
const ORG_ID = '4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58'; // LearnPlay Demo Organization

async function enqueueJob(jobType: string, payload: unknown): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Agent-Token': AGENT_TOKEN,
      'X-Organization-Id': ORG_ID,
    },
    body: JSON.stringify({
      jobType,
      payload,
    }),
  });
  
  const data = await response.json();
  if (!data.ok) {
    return { ok: false, error: data.error?.message || JSON.stringify(data.error) };
  }
  
  return { ok: true, jobId: data.jobId };
}

async function triggerWorker(jobId?: string): Promise<void> {
  // Trigger the ai-job-runner in worker mode to process pending jobs
  const body: Record<string, unknown> = {
    worker: true,
    queue: 'agent', // Process agent jobs (ai_agent_jobs)
  };
  if (jobId) {
    body.jobId = jobId; // Target specific job
  }
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-job-runner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Agent-Token': AGENT_TOKEN,
      'X-Organization-Id': ORG_ID,
    },
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  console.log('Worker response:', data.status || data.error || 'processed');
}

async function callTeacherChat(query: string): Promise<{ ok: boolean; jobId?: string; answer?: string; error?: string }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/teacher-chat-assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Agent-Token': AGENT_TOKEN,
      'X-Organization-Id': ORG_ID,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }],
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `HTTP ${response.status}: ${text}` };
  }
  
  return response.json();
}

async function pollJob(jobId: string, maxWaitMs = 300000): Promise<{ status: string; result?: unknown; error?: string }> {
  const startTime = Date.now();
  let pollCount = 0;
  
  while (Date.now() - startTime < maxWaitMs) {
    pollCount++;
    
    // Trigger worker to process this specific job (it might need to be resumed after yield)
    if (pollCount > 1) {
      console.log(`[Poll ${pollCount}] Triggering worker...`);
      await triggerWorker(jobId);
      await sleep(2000); // Give worker time to process
    }
    
    // Use get-job endpoint (GET with query param)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'X-Agent-Token': AGENT_TOKEN,
        'X-Organization-Id': ORG_ID,
      },
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      console.log(`[Poll ${pollCount}] Error: ${data.error?.message || JSON.stringify(data.error)}`);
      await sleep(5000);
      continue;
    }
    
    const job = data.job;
    const jobStatus = job?.status || 'unknown';
    const stepKey = job?.payload?.step || 'N/A';
    console.log(`[Poll ${pollCount}] Status: ${jobStatus}, Step: ${stepKey}`);
    
    if (jobStatus === 'done') {
      return { status: 'complete', result: job.result };
    }
    
    if (jobStatus === 'failed' || jobStatus === 'dead_letter') {
      return { status: 'failed', error: job.error || 'Job failed' };
    }
    
    // Show partial progress if available
    const partialPlan = job?.payload?.partialPlan;
    if (partialPlan) {
      if (partialPlan.overview) {
        console.log(`  Overview: ${partialPlan.overview.weekCount} weeks, theme: ${partialPlan.overview.programTitle}`);
      }
      if (partialPlan.weeks?.length) {
        console.log(`  Weeks generated: ${partialPlan.weeks.length}`);
      }
    }
    
    await sleep(3000);
  }
  
  return { status: 'timeout', error: `Job did not complete within ${maxWaitMs / 1000}s` };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Multi-Week Lesson Plan E2E Test ===\n');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Organization: ${ORG_ID}\n`);
  
  // Test query for multi-week plan
  const query = 'maak een lesplan over zorgplan opstellen voor 4 weken, 2 uur per week, niveau 3';
  console.log(`Query: "${query}"\n`);
  
  // Try direct enqueue first
  console.log('--- Step 0: Test direct enqueue-job ---');
  const directPayload = {
    step: 'init',
    queryText: query,
    messages: [{ role: 'user', content: query }],
    scope: 'all',
    materialId: null,
    topK: 8,
    weeks: 4,
    hoursPerWeek: 2,
    level: '3',
  };
  
  const enqueueResult = await enqueueJob('generate_multi_week_plan', directPayload);
  if (!enqueueResult.ok) {
    console.error('Direct enqueue failed:', enqueueResult.error);
    console.log('Trying teacher-chat-assistant route instead...\n');
    
    // Fall back to teacher-chat-assistant
    console.log('--- Step 1: Call teacher-chat-assistant ---');
    const chatResponse = await callTeacherChat(query);
    
    if (!chatResponse.ok) {
      console.error('ERROR: Chat request failed:', chatResponse.error);
      process.exit(1);
    }
    
    console.log('Response OK:', chatResponse.ok);
    console.log('Answer:', chatResponse.answer?.substring(0, 200) + '...');
    
    if (!chatResponse.jobId) {
      console.error('ERROR: No jobId returned - multi-week detection may have failed');
      console.log('Full response:', JSON.stringify(chatResponse, null, 2));
      process.exit(1);
    }
    
    console.log('Job ID:', chatResponse.jobId);
    return pollAndValidate(chatResponse.jobId);
  }
  
  console.log('Direct enqueue succeeded!');
  console.log('Job ID:', enqueueResult.jobId);
  
  // Trigger worker to start processing
  console.log('\nTriggering worker to start processing...');
  await triggerWorker(enqueueResult.jobId);
  
  return pollAndValidate(enqueueResult.jobId!);
}

async function pollAndValidate(jobId: string) {
  // Step 2: Poll the job until completion
  console.log('\n--- Step 2: Poll job for completion ---');
  const jobResult = await pollJob(jobId);
  
  if (jobResult.status !== 'complete') {
    console.error(`ERROR: Job ${jobResult.status}:`, jobResult.error);
    process.exit(1);
  }
  
  console.log('\n--- Step 3: Validate result ---');
  const result = jobResult.result as {
    type?: string;
    multiWeekPlan?: {
      overview?: { weekCount?: number; programTitle?: string };
      weeks?: Array<{ weekNumber: number; theme: string }>;
    };
  };
  
  if (result?.type !== 'multiWeekPlan') {
    console.error('ERROR: Result type is not multiWeekPlan:', result?.type);
    process.exit(1);
  }
  
  const plan = result.multiWeekPlan;
  if (!plan?.overview || !plan?.weeks?.length) {
    console.error('ERROR: Multi-week plan is incomplete');
    console.log('Plan:', JSON.stringify(plan, null, 2).substring(0, 1000));
    process.exit(1);
  }
  
  console.log('\n=== SUCCESS ===');
  console.log(`Program: ${plan.overview.programTitle}`);
  console.log(`Weeks: ${plan.overview.weekCount}`);
  console.log('\nWeek Themes:');
  for (const week of plan.weeks) {
    console.log(`  Week ${week.weekNumber}: ${week.theme}`);
  }
  
  // Output a sample of the first week for quality check
  if (plan.weeks[0]) {
    const w1 = plan.weeks[0] as { theme: string; oneliner?: string; keyConcepts?: string[] };
    console.log('\n--- Sample: Week 1 Details ---');
    console.log(`Theme: ${w1.theme}`);
    console.log(`Oneliner: ${w1.oneliner || 'N/A'}`);
    console.log(`Key Concepts: ${w1.keyConcepts?.join(', ') || 'N/A'}`);
  }
  
  console.log('\n=== TEST PASSED ===');
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
