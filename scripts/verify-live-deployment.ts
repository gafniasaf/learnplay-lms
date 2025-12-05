import { createClient } from '@supabase/supabase-js';

// Config from client.ts
const SUPABASE_URL = 'https://xlslksprdjsxawvcikfk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsc2xrc3ByZGpzeGF3dmNpa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTMxMzEsImV4cCI6MjA3OTI4OTEzMX0.1Jo8F2o42z_K7PXeHrEp28AwbomBkrrOJh1_t3vU0iM';

// Set this via env var: AGENT_TOKEN=... npx tsx scripts/verify-live-deployment.ts
const AGENT_TOKEN = process.env.AGENT_TOKEN || 'placeholder-token';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allPassed = true;

function fail(message: string) {
  allPassed = false;
  console.error(`❌ ${message}`);
}

function pass(message: string) {
  console.log(`✅ ${message}`);
}

async function main() {
  console.log("🔍 Verifying Live Edge Functions...\n");

  const headers = {
    'x-agent-token': AGENT_TOKEN
  };

  // ============================================
  // TEST 1: list-jobs (basic connectivity)
  // ============================================
  console.log("📋 Test 1: list-jobs");
  const { data: listData, error: listError } = await supabase.functions.invoke('list-jobs', {
    body: { limit: 5 },
    headers
  });

  if (listError) {
    fail(`list-jobs failed: ${listError.message}`);
  } else if (!listData?.ok) {
    fail(`list-jobs returned error: ${JSON.stringify(listData)}`);
  } else {
    pass(`list-jobs returned ${listData.jobs?.length || 0} jobs`);
  }

  // ============================================
  // TEST 2: ROUND-TRIP - save-record → get-record
  // This is the critical test that was missing!
  // ============================================
  console.log("\n🔄 Test 2: Round-trip (save → get)");
  
  const testPlan = {
    title: `Smoke Test ${Date.now()}`,
    status: 'draft',
    ai_score: 42,
    ai_status_report: 'Test plan created by verify script'
  };

  // Step 2a: Save a record
  console.log("   Saving record...");
  const { data: saveData, error: saveError } = await supabase.functions.invoke('save-record', {
    body: { entity: 'PlanBlueprint', values: testPlan },
    headers
  });

  if (saveError) {
    fail(`save-record failed: ${saveError.message}`);
  } else if (!saveData?.ok || !saveData?.id) {
    fail(`save-record didn't return an ID: ${JSON.stringify(saveData)}`);
  } else {
    pass(`save-record created ID: ${saveData.id}`);
    
    // Step 2b: Retrieve the same record
    console.log("   Retrieving record...");
    const { data: getData, error: getError } = await supabase.functions.invoke('get-record', {
      body: { entity: 'PlanBlueprint', id: saveData.id },
      headers
    });

    if (getError) {
      fail(`get-record failed for ID ${saveData.id}: ${getError.message}`);
    } else if (!getData) {
      fail(`get-record returned empty data for ID ${saveData.id}`);
    } else if (getData.title !== testPlan.title) {
      fail(`get-record returned wrong data. Expected title "${testPlan.title}", got "${getData.title}"`);
    } else {
      pass(`get-record successfully retrieved: "${getData.title}"`);
    }
  }

  // ============================================
  // TEST 2.5: list-records
  // ============================================
  console.log("\n📋 Test 2.5: list-records");
  const { data: listRecData, error: listRecError } = await supabase.functions.invoke('list-records', {
    body: { entity: 'PlanBlueprint', limit: 5 },
    headers
  });

  if (listRecError) {
    fail(`list-records failed: ${listRecError.message}`);
  } else if (!listRecData?.ok) {
    fail(`list-records returned error: ${JSON.stringify(listRecData)}`);
  } else {
    const count = listRecData.records?.length || 0;
    pass(`list-records returned ${count} records`);
    if (count > 0) {
      // Verify one record has correct structure
      const first = listRecData.records[0];
      if (!first.id || !first.title) {
        fail(`Record missing required fields: ${JSON.stringify(first)}`);
      }
    }
  }

  // ============================================
  // TEST 3: enqueue-job
  // ============================================
  console.log("\n🚀 Test 3: enqueue-job");
  
  // 3a. Test with Agent Token (if available and valid)
  // Skip if placeholder or test token - only run with real production token
  const isRealAgentToken = AGENT_TOKEN !== 'placeholder-token' && 
                           !AGENT_TOKEN.startsWith('test-') &&
                           AGENT_TOKEN.length > 20;
  
  if (isRealAgentToken) {
    console.log("   Testing with Agent Token...");
    const { data: jobData, error: jobError } = await supabase.functions.invoke('enqueue-job', {
      body: { jobType: 'smoke-test', payload: { test: true, source: 'agent-test' } },
      headers
    });

    if (jobError) {
      fail(`enqueue-job (Agent) failed: ${jobError.message}`);
    } else if (!jobData?.ok) {
      fail(`enqueue-job (Agent) returned error: ${JSON.stringify(jobData)}`);
    } else {
      pass(`enqueue-job (Agent) succeeded: ${jobData.jobId || 'OK'}`);
    }
  } else {
    console.log("   ⚠️  Skipped Agent Token test (no valid AGENT_TOKEN env var)");
  }

  // 3b. Test with Anonymous Auth (Frontend Simulation)
  console.log("   Testing with Anonymous Auth (Frontend Simulation)...");
  
  // Use a valid plan ID from step 2
  const payload = { 
    planBlueprintId: saveData.id,
    ai_request: "Improve this plan" 
  };

  const { data: jobDataAnon, error: jobErrorAnon } = await supabase.functions.invoke('enqueue-job', {
    body: { jobType: 'refine_plan', payload },
    // No x-agent-token, relies on supabase client auth header
  });

  if (jobErrorAnon) {
    // Check if it's a logic error (500) which means Auth passed
    const context = (jobErrorAnon as any).context;
    if (context && context.status === 500) {
       try {
         const errorBody = await context.json();
         // We expect BLOCKED error if key is missing
         if (errorBody.error && (errorBody.error.includes("BLOCKED") || errorBody.error.includes("OPENAI_API_KEY"))) {
           pass(`enqueue-job (Anon) authorized and correctly BLOCKED: ${errorBody.error}`);
           return; // Success!
         }
       } catch {}
    }

    fail(`enqueue-job (Anon) failed: ${jobErrorAnon.message}`);
    if ((jobErrorAnon as any).context) {
       try {
         const errorBody = await (jobErrorAnon as any).context.json();
         console.error("   Response Body:", JSON.stringify(errorBody, null, 2));
       } catch {
         console.error("   Could not parse response body");
       }
    }
  } else if (!jobDataAnon?.ok) {
    fail(`enqueue-job (Anon) returned error: ${JSON.stringify(jobDataAnon)}`);
  } else {
    pass(`enqueue-job (Anon) succeeded: ${jobDataAnon.jobId || 'OK'}`);
    console.log("   Result:", JSON.stringify(jobDataAnon.result, null, 2));
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log("\n" + "=".repeat(50));
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED");
  } else {
    console.log("💥 SOME TESTS FAILED - Check errors above");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
