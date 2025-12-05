import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SOURCE_DIR = process.argv[2];
const PROJECT_NAME = process.argv[3];

// --- IGNITE ZERO GATEKEEPER ---
try {
  // We check health. If this fails, the Factory refuses to operate.
  // This forces the Agent to be aware of the Runtime State.
  console.log('🔌 Checking MCP Control Plane connection...');
  execSync('node scripts/mcp-health.mjs', { stdio: 'ignore' });
  
  // Ensure DB is seeded (User/Org exist for E2E tests)
  execSync('npx tsx scripts/seed-local-db.ts', { stdio: 'inherit' });
} catch (e) {
  console.error('\n❌ CRITICAL ERROR: Ignite Zero Control Plane (MCP) is offline.');
  console.error('👉 YOU MUST RUN: `npm run mcp:ensure` to start the system.');
  console.error('   The Factory cannot build Dead Software. The Runtime must be active.\n');
  process.exit(1);
}
// ------------------------------

if (!SOURCE_DIR) {
  console.error('❌ Usage: npm run factory:import <workspace-path> [ProjectName]');
  process.exit(1);
}

const resolvedSource = path.resolve(SOURCE_DIR);
if (!fs.existsSync(resolvedSource)) {
  console.error(`❌ Workspace not found: ${resolvedSource}`);
  process.exit(1);
}

const nameFromPath = path.basename(resolvedSource);
const projectLabel = PROJECT_NAME ?? nameFromPath;
const slug =
  projectLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const rootDir = process.cwd();
const projectsDir = path.join(rootDir, 'projects');
if (!fs.existsSync(projectsDir)) {
  console.error('❌ Missing projects/ directory.');
  process.exit(1);
}

const targetDir = path.join(projectsDir, slug);
if (fs.existsSync(targetDir)) {
  console.error(`❌ Target project already exists: ${targetDir}`);
  console.error('   Remove it or choose a different name.');
  process.exit(1);
}

try {
  console.log('🛡️ Validating source workspace via factory-guard...');
  execSync(`npx tsx scripts/factory-guard.ts "${resolvedSource}"`, { stdio: 'inherit' });
} catch (error) {
  console.error('🛑 Source workspace failed guard checks. Aborting import.');
  process.exit(1);
}

fs.cpSync(resolvedSource, targetDir, { recursive: true });
console.log(`📦 Workspace copied to ${targetDir}`);

try {
  console.log('🧪 Verifying copied project...');
  execSync(`npx tsx scripts/factory-guard.ts "${targetDir}"`, { stdio: 'inherit' });
} catch (error) {
  console.error('🛑 Copied project failed guard checks (this should be rare).');
  console.error('   Inspect the target directory and rerun the guard.');
  process.exit(1);
}

console.log('\n✅ Project imported into Ignite Zero.');
console.log(`Next: run \`npm run factory projects/${slug}\` to start building.`);
