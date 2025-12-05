
import process from 'node:process';
import fs from 'fs';
import path from 'path';

// --- Setup Check ---
const setupFlag = path.join(process.cwd(), '.setup_complete');
if (!fs.existsSync(setupFlag)) {
  console.log('\n\x1b[33m⚠️  First time here?\x1b[0m');
  console.log('\x1b[36mIt looks like you haven\'t run the setup script yet.\x1b[0m');
  console.log('\x1b[1mRun `npm run setup` to configure your environment automatically.\x1b[0m\n');
  // We don't exit(1) here to allow power users to skip, but we make it loud.
  // Uncomment next line to ENFORCE setup:
  // process.exit(1); 
}

// --- Env Check ---
const warnings: string[] = [];

if (!process.env.SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  warnings.push(
    'Missing SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY). Resume logging + plan snapshots will be disabled.',
  );
}

if (!process.env.VITE_SUPABASE_URL) {
  warnings.push('Missing VITE_SUPABASE_URL. Supabase client may fail to connect.');
}

if (warnings.length === 0) {
  console.log('[preflight] All critical Supabase env vars present.');
  process.exit(0);
}

console.warn('[preflight] Detected configuration gaps:');
for (const msg of warnings) {
  console.warn(` • ${msg}`);
}
console.warn('Set the missing variables before running dev servers.');
