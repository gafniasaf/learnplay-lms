#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const BASE_URL = process.env.MCP_BASE_URL || 'http://127.0.0.1:4000';
let token = process.env.MCP_AUTH_TOKEN || 'dev-local-secret';

// Try read token from lms-mcp/.env.local if present
try {
  const env = fs.readFileSync('lms-mcp/.env.local', 'utf-8');
  const m = env.match(/^MCP_AUTH_TOKEN=(.+)$/m);
  if (m && m[1]) token = m[1].trim();
} catch {}

async function health() {
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'lms.health', params: {} }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    return json?.ok === true;
  } catch {
    return false;
  }
}

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', ...opts });
  return { code: res.status ?? 0, out: (res.stdout || '').toString(), err: (res.stderr || '').toString() };
}

(async () => {
  if (await health()) {
    console.log('[mcp:ensure] MCP already healthy.');
    process.exit(0);
  }

  // Check if container exists
  const ps = sh('docker', ['ps', '--format', '{{.Names}}']);
  if (ps.code !== 0) {
    console.error('[mcp:ensure] Docker not available.');
    process.exit(1);
  }
  const running = ps.out.split(/\r?\n/).some(n => n.trim() === 'lms-mcp');

  if (!running) {
    // Try run; if missing image, build then run
    console.log('[mcp:ensure] Starting MCP container...');
    let run = sh('docker', ['run', '-d', '--name', 'lms-mcp', '-p', '127.0.0.1:4000:4000', '--env-file', 'lms-mcp/.env.local', 'lms-mcp']);
    if (run.code !== 0) {
      console.log('[mcp:ensure] Image missing, building...');
      const build = sh('docker', ['build', '-t', 'lms-mcp', './lms-mcp']);
      if (build.code !== 0) {
        console.error('[mcp:ensure] Build failed:', build.err || build.out);
        process.exit(1);
      }
      run = sh('docker', ['run', '-d', '--name', 'lms-mcp', '-p', '127.0.0.1:4000:4000', '--env-file', 'lms-mcp/.env.local', 'lms-mcp']);
      if (run.code !== 0) {
        console.error('[mcp:ensure] Run failed:', run.err || run.out);
        process.exit(1);
      }
    }
  }

  // Wait for health
  for (let i = 0; i < 30; i++) {
    if (await health()) {
      console.log('[mcp:ensure] MCP healthy.');
      process.exit(0);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.error('[mcp:ensure] MCP did not become healthy in time.');
  process.exit(1);
})();


