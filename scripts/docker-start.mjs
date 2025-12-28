#!/usr/bin/env node
/**
 * Standalone CLI tool to ensure Docker Desktop is running
 * 
 * Usage:
 *   node scripts/docker-start.mjs
 *   npm run docker:start
 */

import { ensureDockerRunning, isDockerRunning } from './utils/docker-starter.mjs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('-c');

(async () => {
  if (checkOnly) {
    // Just check status
    const running = isDockerRunning();
    if (running) {
      console.log('✅ Docker daemon is running');
      process.exit(0);
    } else {
      console.log('❌ Docker daemon is not running');
      process.exit(1);
    }
  } else {
    // Ensure Docker is running, auto-start if needed
    console.log('🐳 Ensuring Docker Desktop is running...\n');
    const success = await ensureDockerRunning({ autoStart: true, silent: false });
    
    if (success) {
      console.log('\n✅ Docker is ready!');
      process.exit(0);
    } else {
      console.log('\n❌ Failed to start Docker');
      process.exit(1);
    }
  }
})();

