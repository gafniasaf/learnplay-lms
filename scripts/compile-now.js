// Simple compiler wrapper that logs output
const { execSync } = require('child_process');
try {
  execSync('npx tsx scripts/compile-mockups.ts .', { stdio: 'inherit' });
} catch (e) {
  console.error('Compilation failed:', e.message);
  process.exit(1);
}



