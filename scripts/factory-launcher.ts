import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TARGET_DIR = process.argv[2];

if (!TARGET_DIR) {
  console.error("❌ Usage: npm run factory <input-directory>");
  console.error("Example: npm run factory tests/fixtures/golden-project");
  process.exit(1);
}

if (!fs.existsSync(TARGET_DIR)) {
  console.error(`❌ Input directory not found: ${TARGET_DIR}`);
  process.exit(1);
}

console.log(`🏭 Launching Factory Agent in: ${TARGET_DIR}`);

// 1. Run Guardrail Check
try {
  console.log("🛡️ Running Factory Guard...");
  // We assume .env.local logic is handled inside factory-guard or via user setup
  execSync(`npx tsx scripts/factory-guard.ts "${TARGET_DIR}"`, { stdio: 'inherit' });
} catch (e) {
  console.error("🛑 Factory Guard Failed. Fix the inputs before continuing.");
  process.exit(1);
}

// 2. Instructions for the Agent
const planPath = path.join(TARGET_DIR, 'PLAN.md');
const manifestPath = path.join(TARGET_DIR, 'system-manifest.json');
const journeyPath = path.join(TARGET_DIR, 'user_journey.md');

console.log("\n🤖 AGENT INSTRUCTIONS:");
console.log("1. Read the following files to understand the project:");
console.log(`   - ${manifestPath}`);
console.log(`   - ${journeyPath}`);
console.log(`   - ${planPath}`);
console.log("2. Execute the PLAN.md step-by-step.");
console.log("3. For each UI step, look at the corresponding file in `mockups/`.");
console.log("4. After each step, run `npm run test:e2e` (or specific test) to verify.");

console.log("\n🚀 Factory Ready. Handing over to Cursor Agent...");
