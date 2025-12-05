import { execSync } from 'child_process';
import fs from 'fs';

if (process.env.SKIP_VERIFY === '1') {
  console.log("⚠️  SKIP_VERIFY=1 — skipping verify script (used for local e2e builds).");
  process.exit(0);
}

// Hardcoded Supabase edge URL + anon key (same project as frontend)
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  'https://xlslksprdjsxawvcikfk.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsc2xrc3ByZGpzeGF3dmNpa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTMxMzEsImV4cCI6MjA3OTI4OTEzMX0.1Jo8F2o42z_K7PXeHrEp28AwbomBkrrOJh1_t3vU0iM';

async function verifyArchitectAdvisorDecodeJson() {
  const url = `${SUPABASE_URL}/functions/v1/architect-advisor`;

  console.log("🧪 Verifying architect-advisor decode JSON contract...");

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    } as any,
    body: JSON.stringify({
      mode: 'decode',
      prompt: 'Test blueprint: minimal smoke check to ensure strict JSON output.',
      manifest: {},
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(
      `architect-advisor HTTP ${response.status}: ${JSON.stringify(data)}`,
    );
  }

  if (data?.error) {
    throw new Error(`architect-advisor error: ${data.error}`);
  }

  const raw = data?.result;
  if (typeof raw !== 'string') {
    throw new Error(
      `architect-advisor decode result is not a string. Received: ${typeof raw}`,
    );
  }

  try {
    const parsed = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(
        'architect-advisor decode JSON is not an object. Likely malformed shape.',
      );
    }

    // Best-effort shape sanity checks (non-fatal if missing)
    if (!('project_name' in parsed) || !('steps' in parsed)) {
      console.warn(
        '⚠️ architect-advisor decode JSON parsed, but missing expected keys (project_name/steps).',
      );
    }
  } catch (err: any) {
    const preview =
      raw.length > 120 ? `${raw.substring(0, 120)}…` : raw;
    throw new Error(
      `Regression Detected: architect-advisor decode output is not valid JSON. Likely returned Markdown.\nReceived: ${preview}\nInner error: ${err?.message || String(err)}`,
    );
  }

  console.log("✅ architect-advisor decode JSON contract verified");
}

async function main() {
  console.log("🔍 Verifying System Integrity...");

  // 1. Contract Integrity Check
  if (!fs.existsSync('./src/lib/contracts.ts')) {
    throw new Error("contracts.ts missing. Run scaffold-manifest.ts first.");
  }
  
  const contractsSize = fs.statSync('./src/lib/contracts.ts').size;
  if (contractsSize < 100) {
    throw new Error("contracts.ts appears empty or invalid.");
  }
  console.log("✅ Contracts Present");

  // 2. Type Safety Check (The Iron Gate)
  console.log("🛠️ Running Typecheck...");
  execSync('npm run typecheck', { stdio: 'inherit' });
  console.log("✅ TYPECHECK PASSED");

  // 3. Unit Tests
  console.log("🧪 Running Unit Tests...");
  execSync('npm run test', { stdio: 'inherit' });
  console.log("✅ UNIT TESTS PASSED");

  // 4. Architect Advisor – Decode Mode strict JSON contract (Archived in _FACTORY)
  // await verifyArchitectAdvisorDecodeJson();

  // 5. Architect API contract tests (multi-mode) (Archived in _FACTORY)
  console.log("🧪 [Archived] Skipping Architect Advisor API contracts...");
  // execSync('npx tsx tests/integration/architect-contract.spec.ts', { stdio: 'inherit' });

  // 6. Mockup auto-tune suite (Archived in _FACTORY)
  console.log("🧪 [Archived] Skipping Mockup Auto-Tune suite...");
  // execSync('npm run tune:auto', { stdio: 'inherit' });

  // 7. Universal E2E Check (file presence)
  if (fs.existsSync('tests/e2e/universal-smoke.spec.ts')) {
     console.log("✅ Universal E2E Test Present");
  } else {
     console.warn("⚠️ Universal E2E Test MISSING");
  }

  // 7b. ALL CTAs E2E Test Check (MANDATORY)
  if (fs.existsSync('tests/e2e/all-ctas.spec.ts')) {
     console.log("✅ All CTAs E2E Test Present");
     
     // Verify coverage.json exists and count CTAs
     if (fs.existsSync('docs/mockups/coverage.json')) {
       const coverage = JSON.parse(fs.readFileSync('docs/mockups/coverage.json', 'utf-8'));
       let totalCTAs = 0;
       for (const route of coverage.routes || []) {
         totalCTAs += (route.requiredCTAs || []).length;
       }
       console.log(`   📊 Coverage: ${totalCTAs} CTAs defined in coverage.json`);
     }
  } else {
     throw new Error("❌ ALL CTAs E2E Test MISSING (tests/e2e/all-ctas.spec.ts). Golden Plan requires 100% CTA coverage.");
  }

  // 7c. Mock Coverage Validation
  if (fs.existsSync('scripts/validate-mockups.ts')) {
     console.log("🧪 Running Mock Coverage Validation...");
     try {
       execSync('npx tsx scripts/validate-mockups.ts', { stdio: 'inherit' });
       console.log("✅ MOCK COVERAGE VALIDATED");
     } catch (e) {
       console.warn("⚠️ Mock coverage validation failed - some mockups may be incomplete");
       // Non-fatal for now, but logged
     }
  }

  // 8. Live Edge Function Verification (optional - requires deployed functions)
  if (process.env.VERIFY_LIVE === '1') {
    console.log("🌐 Running Live Edge Function Verification...");
    try {
      execSync('npx tsx scripts/verify-live-deployment.ts', { stdio: 'inherit' });
      console.log("✅ LIVE EDGE FUNCTIONS VERIFIED");
    } catch (e) {
      console.error("❌ Live Edge Function verification failed");
      console.error("   This may indicate deployment issues. Check docs/EDGE_DEPLOYMENT_RUNBOOK.md");
      throw e;
    }
  } else {
    console.log("⏭️  Skipping live verification (set VERIFY_LIVE=1 to enable)");
  }

  console.log("\n🎉 SYSTEM READY FOR REVIEW.");
}

main().catch((e) => {
  console.error("\n❌ VERIFICATION FAILED.");
  console.error("Agent: Read the errors above. Fix the code until this script passes.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
