
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xlslksprdjsxawvcikfk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsc2xrc3ByZGpzeGF3dmNpa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTMxMzEsImV4cCI6MjA3OTI4OTEzMX0.1Jo8F2o42z_K7PXeHrEp28AwbomBkrrOJh1_t3vU0iM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("🚀 Starting Automated Document Dump Test...");

  // 1. Create a fresh plan
  const planId = crypto.randomUUID();
  const initialPlan = { id: planId, title: "Automated Test Plan", status: "draft" };
  
  // Save initial state (mocking what the UI does on create)
  await supabase.functions.invoke('save-record', {
    body: { entity: 'PlanBlueprint', values: initialPlan }
  });
  console.log(`📝 Created test plan: ${planId}`);

  // 2. Simulate the "Document Dump"
  // This is a truncated version of your doc to save token cost/time but enough to trigger the logic
  const docDump = `
# ACTIE Klinisch Redeneren - Technische Documentatie
> **Versie:** 1.0
> **Status:** Production Ready

## System Overview
**ACTIE Klinisch Redeneren** is a medical training simulation platform.

## Core Features
- AI-driven patient case simulations
- Real-time clinical reasoning guidance
- Performance tracking
- Session management

## Pixel-Perfect HTML Mockups
Here is the welcome page:
<!DOCTYPE html>
<html lang="nl">
<head>
    <title>ACTIE Klinisch Redeneren - Welkom</title>
    <style>body { background: #f0f0f0; color: #333; }</style>
</head>
<body>
    <h1>ACTIE Klinisch Redeneren</h1>
    <p>Training Simulator</p>
    <button>Start simulatie</button>
</body>
</html>
  `;

  console.log("📤 Sending document dump (~" + docDump.length + " chars)...");

  const { data, error } = await supabase.functions.invoke('enqueue-job', {
    body: { 
      jobType: 'refine_plan', 
      payload: { 
        planBlueprintId: planId, 
        ai_request: docDump 
      } 
    }
  });

  if (error) {
    console.error("❌ API Error:", error);
    process.exit(1);
  }

  if (!data.ok) {
    console.error("❌ Function Error:", data);
    process.exit(1);
  }

  const result = data.result;
  console.log("\n🤖 AI Response Summary:\n-----------------------------------");
  console.log(result.summary);
  console.log("-----------------------------------\n");

  // 3. Verification Logic
  let passed = true;

  // Check 1: Did it extract the title?
  if (result.updated_plan_fields?.title?.includes("ACTIE")) {
    console.log("✅ Title Extraction: PASS");
  } else {
    console.log("❌ Title Extraction: FAIL (Got: " + result.updated_plan_fields?.title + ")");
    passed = false;
  }

  // Check 2: Did it extract features?
  const features = result.updated_plan_fields?.features || [];
  if (features.length > 0) {
    console.log(`✅ Feature Extraction: PASS (${features.length} features found)`);
  } else {
    console.log("❌ Feature Extraction: FAIL (No features extracted)");
    passed = false;
  }

  // Check 3: Did it detect the HTML?
  // We need to fetch the plan record to verify reference_html was saved
  const { data: record } = await supabase.functions.invoke('get-record', {
    body: { entity: 'PlanBlueprint', id: planId }
  });

  if (record && record.reference_html && record.reference_html.includes("<html")) {
    console.log("✅ HTML Persistence: PASS (Reference HTML saved)");
  } else {
    console.log("❌ HTML Persistence: FAIL (reference_html missing or empty)");
    passed = false;
  }

  // Check 4: Did it trigger a mockup?
  if (result.mockup_generated) {
    console.log("✅ Mockup Generation: PASS (AI triggered build)");
  } else {
    console.log("⚠️ Mockup Generation: SKIPPED (AI decided to chat first - acceptable if it asks for confirmation)");
    // Check if it asks for confirmation
    if (result.summary.toLowerCase().includes("confirm") || result.summary.toLowerCase().includes("mock that up")) {
        console.log("   (AI correctly asked for confirmation)");
    } else {
        console.log("   (AI failed to act)");
        passed = false;
    }
  }

  if (passed) {
    console.log("\n🎉 TEST PASSED: The system correctly handles documentation dumps.");
  } else {
    console.error("\n💥 TEST FAILED: System did not behave as expected.");
    Deno.exit(1);
  }
}

run();

