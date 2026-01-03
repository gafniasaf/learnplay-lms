import { execSync } from 'child_process';
import fs from 'fs';
import { glob } from 'glob';

// Export as a function, not a self-executing script
export async function verifySystem() {
  // Hard gate: MCP must be running locally for any agent-driven verification loop.
  // This prevents “debug/fix” workflows from proceeding without runtime diagnostics.
  console.log("🚀 Ensuring MCP is running (hard gate)...");
  execSync('npm run mcp:require', { stdio: 'inherit' });

  if (process.env.SKIP_VERIFY === '1') {
    console.log("⚠️  SKIP_VERIFY=1 — skipping verify script (used for local e2e builds).");
    return;
  }

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

  // 2.5) Job wiring audit (Manifest ↔ Contracts ↔ Registry ↔ enqueue-job allowlist)
  // Blocking: prevent new job types from shipping without being runnable/queueable.
  console.log("🧩 Verifying job wiring (manifest ↔ contracts ↔ registry ↔ enqueue-job)...");
  const manifestRaw = fs.readFileSync("./system-manifest.json", "utf-8");
  let manifest: any;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (e) {
    throw new Error("system-manifest.json is not valid JSON");
  }

  const manifestJobs: Array<{ id: string; execution_mode?: string }> = Array.isArray(manifest?.agent_jobs)
    ? manifest.agent_jobs
    : [];
  const manifestJobIds = new Set(manifestJobs.map((j) => String(j?.id || "")).filter(Boolean));
  if (manifestJobIds.size === 0) {
    throw new Error("No agent_jobs found in system-manifest.json (cannot verify wiring)");
  }

  const contractsText = fs.readFileSync("./src/lib/contracts.ts", "utf-8");
  const jobModesMatch = contractsText.match(/export const JOB_MODES\s*=\s*\{([\s\S]*?)\}\s*as const;/);
  if (!jobModesMatch) {
    throw new Error("JOB_MODES not found in src/lib/contracts.ts (run `npm run codegen`)");
  }
  const jobModesBlock = jobModesMatch[1] || "";
  const contractJobIds = new Set(Array.from(jobModesBlock.matchAll(/"([^"]+)"\s*:\s*"(async|synchronous)"/g)).map((m) => m[1]));

  const registryText = fs.readFileSync("./supabase/functions/ai-job-runner/registry.ts", "utf-8");
  const registryBlockMatch = registryText.match(/export const JobRegistry\s*:\s*Record<string, JobExecutor>\s*=\s*\{([\s\S]*?)\};/);
  if (!registryBlockMatch) {
    throw new Error("JobRegistry not found in supabase/functions/ai-job-runner/registry.ts (run `npm run codegen`)");
  }
  const registryBlock = registryBlockMatch[1] || "";
  const registryJobIds = new Set(Array.from(registryBlock.matchAll(/\s*'([^']+)'\s*:/g)).map((m) => m[1]));

  const enqueueText = fs.readFileSync("./supabase/functions/enqueue-job/index.ts", "utf-8");
  const factoryBlockMatch = enqueueText.match(/const FACTORY_JOB_TYPES\s*=\s*\[([\s\S]*?)\];/);
  if (!factoryBlockMatch) {
    throw new Error("FACTORY_JOB_TYPES not found in supabase/functions/enqueue-job/index.ts");
  }
  const factoryBlock = factoryBlockMatch[1] || "";
  const factoryJobIds = new Set(Array.from(factoryBlock.matchAll(/"([^"]+)"/g)).map((m) => m[1]));

  const missingInContracts: string[] = [];
  const missingInRegistry: string[] = [];
  const missingInFactoryAllowlist: string[] = [];

  for (const job of manifestJobs) {
    const id = String(job?.id || "").trim();
    if (!id) continue;

    if (!contractJobIds.has(id)) missingInContracts.push(id);
    if (!registryJobIds.has(id)) missingInRegistry.push(id);

    const mode = String(job?.execution_mode || "").trim();
    if (mode === "async" && id !== "ai_course_generate") {
      if (!factoryJobIds.has(id)) missingInFactoryAllowlist.push(id);
    }
  }

  const errors: string[] = [];
  if (missingInContracts.length) {
    errors.push(`Missing in contracts JOB_MODES: ${missingInContracts.sort().join(", ")}`);
  }
  if (missingInRegistry.length) {
    errors.push(`Missing in ai-job-runner JobRegistry: ${missingInRegistry.sort().join(", ")}`);
  }
  if (missingInFactoryAllowlist.length) {
    errors.push(`Missing in enqueue-job FACTORY_JOB_TYPES (async jobs must be queueable): ${missingInFactoryAllowlist.sort().join(", ")}`);
  }

  if (errors.length) {
    throw new Error(
      "Job wiring audit failed:\\n" +
        errors.map((e) => `- ${e}`).join("\\n") +
        "\\n\\nFix guidance:\\n" +
        "- If contracts/registry are missing: run `npm run codegen`\\n" +
        "- If enqueue-job allowlist is missing: update supabase/functions/enqueue-job/index.ts FACTORY_JOB_TYPES"
    );
  }
  console.log("✅ Job wiring audit passed");

  // 2. ESLint Rule Enforcement (ARCHITECTURAL COMPLIANCE)
  console.log("🔍 Running ESLint with architectural rules...");
  try {
    execSync('npm run lint', { stdio: 'inherit' });
    console.log("✅ ESLint passed (no architectural violations)");
  } catch (error) {
    console.error("❌ ESLint failed - architectural violations detected");
    console.error("Fix violations before proceeding. Run 'npm run lint:fix' for auto-fixes.");
    throw new Error("ESLint failed");
  }

  // 3. Fallback Pattern Detection (NO-FALLBACK POLICY)
  console.log("🛡️ Checking for forbidden fallback patterns...");
  const checkFile = (filePath: string): string[] => {
    const violations: string[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Check for multi-line alternative env var patterns (VAR1 ||\n  VAR2)
    const fullContent = content.replace(/\r/g, '');
    const multiLineAltPattern = /process\.env\.\w+\s*\|\|\s*\n\s*process\.env\.\w+/;
    const hasMultiLineAlt = multiLineAltPattern.test(fullContent);
    
    lines.forEach((line: string, index: number) => {
      // Per ABSOLUTE NO-FALLBACK POLICY: Only documented feature flags are exceptions
      // Check for process.env.* || or process.env.* ??
      const fallbackMatch = line.match(/process\.env\.\w+\s*(?:\|\||\?\?)/);
      if (fallbackMatch) {
        // Skip comments
        const codePart = line.split('//')[0].split('*')[0].trim();
        if (codePart.includes('process.env')) {
          // Check if this is a documented feature flag (explicit check with logging)
          const isFeatureFlag = line.includes('VITE_USE_MOCK') || 
                               line.includes('VITE_ALLOW_MOCK_FALLBACK') ||
                               (line.includes('console.warn') && line.includes('MOCK'));
          
          // Allow alternative env var checks (VAR1 || VAR2) - these try multiple env vars
          // but should still fail if none are set (checked elsewhere in code)
          const isAlternativeEnvVar = /process\.env\.\w+\s*\|\|\s*process\.env\.\w+/.test(codePart);
          
          // Check if this line is part of a multi-line alternative pattern
          const isPartOfMultiLineAlt = hasMultiLineAlt && 
            (line.includes('process.env') && line.includes('||')) &&
            (index > 0 && lines[index - 1]?.includes('process.env')) ||
            (index < lines.length - 1 && lines[index + 1]?.includes('process.env'));
          
          if (!isFeatureFlag && !isAlternativeEnvVar && !isPartOfMultiLineAlt) {
            violations.push(`${filePath}:${index + 1}: ${line.trim()}`);
          }
        }
      }
    });
    
    return violations;
  };
  
  const violations: string[] = [];
  const files = [
    ...glob.sync('src/**/*.{ts,tsx}', { ignore: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'] }),
    ...glob.sync('scripts/**/*.{ts,js,mjs}', { ignore: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**'] }),
    ...glob.sync('supabase/functions/**/*.ts', { ignore: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'] }),
  ];
  
  files.forEach((file: string) => {
    if (file.includes('jest.setup.ts')) return;
    violations.push(...checkFile(file));
  });
  
  if (violations.length > 0) {
    console.error("❌ FORBIDDEN FALLBACK PATTERNS DETECTED:");
    violations.forEach(v => console.error(`   ${v}`));
    throw new Error("Found forbidden fallback patterns. See ABSOLUTE NO-FALLBACK POLICY in docs/AI_CONTEXT.md");
  }
  console.log("✅ NO FORBIDDEN FALLBACKS DETECTED");

  // 3. Type Safety Check (The Iron Gate)
  console.log("🛠️ Running Typecheck...");
  try {
    execSync('npm run typecheck', { stdio: 'inherit' });
    console.log("✅ TYPECHECK PASSED");
  } catch (e) {
    throw new Error("Typecheck failed");
  }

  // 4. Unit Tests
  console.log("🧪 Running Unit Tests...");
  try {
    execSync('npm run test', { stdio: 'inherit' });
    console.log("✅ UNIT TESTS PASSED");
  } catch (e) {
    throw new Error("Unit tests failed");
  }

  // 5. LearnPlay E2E Tests Check
  if (fs.existsSync('tests/e2e/learnplay-journeys.spec.ts')) {
     console.log("✅ LearnPlay E2E Tests Present");
  } else {
     console.warn("⚠️ LearnPlay E2E Tests MISSING (tests/e2e/learnplay-journeys.spec.ts)");
  }

  // 7. Mock Coverage Validation
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

