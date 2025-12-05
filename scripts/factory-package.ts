import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const WORKSPACE = process.argv[2];
const LABEL = process.argv[3];

if (!WORKSPACE) {
  console.error('❌ Usage: npm run factory:package <workspace> [label]');
  process.exit(1);
}

const resolvedWorkspace = path.resolve(WORKSPACE);
if (!fs.existsSync(resolvedWorkspace)) {
  console.error(`❌ Workspace not found: ${resolvedWorkspace}`);
  process.exit(1);
}

const baseName = LABEL ?? path.basename(resolvedWorkspace);
const slug =
  baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, '');

const packsDir = path.join(process.cwd(), 'cursor-playground', 'golden-packs');
fs.mkdirSync(packsDir, { recursive: true });
const targetDir = path.join(packsDir, `${slug}-${timestamp}`);

try {
  console.log('🛡️ Guarding workspace before packaging...');
  execSync(`npx tsx scripts/factory-guard.ts "${resolvedWorkspace}"`, { stdio: 'inherit' });
} catch (error) {
  console.error('🛑 Workspace failed guard checks. Fix issues before packaging.');
  process.exit(1);
}

fs.cpSync(resolvedWorkspace, targetDir, { recursive: true });

const metadata = {
  slug,
  label: baseName,
  packaged_at: new Date().toISOString(),
  source: resolvedWorkspace,
};
fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(metadata, null, 2));

console.log(`📦 Packaged workspace at ${targetDir}`);
console.log(
  '   Import later with: npm run factory:import ' + targetDir + ' ' + JSON.stringify(baseName),
);
