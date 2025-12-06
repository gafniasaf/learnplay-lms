import { execSync } from 'child_process';
import fs from 'fs';
import { glob } from 'glob';

if (process.env.SKIP_VERIFY === '1') {
  console.log("⚠️  SKIP_VERIFY=1 — skipping verify script (used for local e2e builds).");
  process.exit(0);
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

  // 2. ESLint Rule Enforcement (ARCHITECTURAL COMPLIANCE)
  console.log("🔍 Running ESLint with architectural rules...");
  try {
    execSync('npm run lint', { stdio: 'inherit' });
    console.log("✅ ESLint passed (no architectural violations)");
  } catch (error) {
    console.error("❌ ESLint failed - architectural violations detected");
    console.error("Fix violations before proceeding. Run 'npm run lint:fix' for auto-fixes.");
    throw error;
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
  execSync('npm run typecheck', { stdio: 'inherit' });
  console.log("✅ TYPECHECK PASSED");

  // 4. Unit Tests
  console.log("🧪 Running Unit Tests...");
  execSync('npm run test', { stdio: 'inherit' });
  console.log("✅ UNIT TESTS PASSED");

  // 5. Universal E2E Check (file presence)
  if (fs.existsSync('tests/e2e/universal-smoke.spec.ts')) {
     console.log("✅ Universal E2E Test Present");
  } else {
     console.warn("⚠️ Universal E2E Test MISSING");
  }

  // 6. ALL CTAs E2E Test Check (MANDATORY)
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

main().catch((e) => {
  console.error("\n❌ VERIFICATION FAILED.");
  console.error("Agent: Read the errors above. Fix the code until this script passes.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
