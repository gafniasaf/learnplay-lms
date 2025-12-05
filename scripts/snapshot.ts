import fs from 'fs';
import path from 'path';

const action = process.argv[2]; // 'save' | 'restore' | 'update-core'
const ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(ROOT, '.snapshots/seed');

// Paths that define the "Factory" (Ignite Zero), NOT the "Product" (LMS)
const CORE_PATHS = [
  'scripts',
  'lms-mcp',
  'supabase/functions/architect-advisor',
  'supabase/functions/_shared',
  '.cursorrules',
  'docs/AI_CONTEXT.md',
  'docs/OPERATOR_MANUAL.md',
  'package.json',
  'tsconfig.json'
];

// Paths to ignore during a Full Save (e.g., node_modules)
const IGNORE_PATTERNS = ['node_modules', '.git', '.snapshots', 'dist', '.DS_Store'];

function copyRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      if (IGNORE_PATTERNS.includes(child)) return;
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function nukeDirectory(dir: string) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// --- ACTIONS ---

if (action === 'save') {
  console.log("💾 Saving Full Factory Seed...");
  nukeDirectory(SNAPSHOT_DIR);
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  
  // Copy everything except ignores
  fs.readdirSync(ROOT).forEach(file => {
    if (IGNORE_PATTERNS.includes(file)) return;
    copyRecursive(path.join(ROOT, file), path.join(SNAPSHOT_DIR, file));
  });
  console.log("✅ Seed Saved. You can now thrash this folder.");
}

else if (action === 'restore') {
  console.log("♻️ Restoring Factory Seed...");
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    console.error("❌ No seed found! Run 'npm run seed:save' first.");
    process.exit(1);
  }

  // Nuke current state (Dangerous but necessary)
  console.log("...Wiping current state");
  fs.readdirSync(ROOT).forEach(file => {
    if (IGNORE_PATTERNS.includes(file)) return;
    nukeDirectory(path.join(ROOT, file));
  });

  // Restore
  console.log("...Restoring from snapshot");
  copyRecursive(SNAPSHOT_DIR, ROOT);
  console.log("✅ Restore Complete. Back to State Zero.");
}

else if (action === 'update-core') {
  console.log("🔧 Backporting Core Tools to Seed...");
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    console.error("❌ No seed found to update!");
    process.exit(1);
  }

  CORE_PATHS.forEach(p => {
    const src = path.join(ROOT, p);
    const dest = path.join(SNAPSHOT_DIR, p);
    
    if (fs.existsSync(src)) {
      console.log(`   Upgrading: ${p}`);
      // Remove old version in snapshot
      nukeDirectory(dest);
      // Copy new version to snapshot
      // For files inside subdirs (like functions), ensure parent dir exists
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      
      copyRecursive(src, dest);
    }
  });
  console.log("✅ Core Tools Updated in Snapshot. (LMS Data was IGNORED).");
}

else {
  console.log("Usage: npx tsx scripts/snapshot.ts [save | restore | update-core]");
}

