#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ensureDockerRunning } from './utils/docker-starter.mjs';

function parseEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    /** @type {Record<string, string>} */
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = String(raw ?? '').trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      if (key) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function findMcpEnvFile() {
  const candidates = ['lms-mcp/.env.local', 'lms-mcp/.env'];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function normalizeHost(host) {
  const h = String(host || '').trim();
  if (!h) return '';
  // 0.0.0.0 is a bind-all address; clients should use loopback for requests.
  if (h === '0.0.0.0' || h === '::') return '127.0.0.1';
  return h;
}

function resolveMcpConfig() {
  const envFile = findMcpEnvFile();
  const fileEnv = envFile ? parseEnvFile(envFile) : {};

  /** @type {string | undefined} */
  let token = process.env.MCP_AUTH_TOKEN;
  // Do NOT use `process.env.X || ...` patterns; use explicit branching.
  if (!token) token = fileEnv.MCP_AUTH_TOKEN || undefined;

  if (!token || token === 'CHANGE_ME_REQUIRED') {
    console.error('[mcp:ensure] ❌ BLOCKED: MCP_AUTH_TOKEN is REQUIRED');
    console.error('   Provide it via env var MCP_AUTH_TOKEN or in lms-mcp/.env.local');
    process.exit(1);
  }

  /** @type {string | undefined} */
  let baseUrl = process.env.MCP_BASE_URL;
  if (!baseUrl) {
    const host = normalizeHost(fileEnv.HOST);
    const portRaw = String(fileEnv.PORT || '').trim();
    const port = Number(portRaw);
    if (!host || !portRaw || !Number.isFinite(port) || port <= 0) {
      console.error('[mcp:ensure] ❌ BLOCKED: MCP_BASE_URL is REQUIRED');
      console.error('   Provide env var MCP_BASE_URL (e.g. http://127.0.0.1:4000)');
      console.error('   Or set HOST and PORT in lms-mcp/.env.local');
      process.exit(1);
    }
    baseUrl = `http://${host}:${port}`;
  }

  let port = 0;
  try {
    const u = new URL(baseUrl);
    port = Number(u.port);
  } catch {
    // ignore; validated below
  }

  if (!port || !Number.isFinite(port) || port <= 0) {
    console.error('[mcp:ensure] ❌ BLOCKED: MCP_BASE_URL must include a numeric port (e.g. http://127.0.0.1:4000)');
    process.exit(1);
  }

  return { baseUrl, token, port, envFile };
}

const cfg = resolveMcpConfig();

async function health() {
  try {
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
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

  // Ensure Docker is running, auto-start if needed
  const dockerReady = await ensureDockerRunning({ autoStart: true, silent: false });
  if (!dockerReady) {
    console.error('[mcp:ensure] ❌ Docker could not be started.');
    process.exit(1);
  }

  // Check if container exists (running or stopped)
  const ps = sh('docker', ['ps', '-a', '--filter', 'name=lms-mcp', '--format', '{{.Names}}']);
  if (ps.code !== 0) {
    console.error('[mcp:ensure] Docker not available.');
    process.exit(1);
  }
  const exists = ps.out.split(/\r?\n/).some(n => n.trim() === 'lms-mcp');

  if (exists) {
    // If it exists but health check failed, it's likely stopped or unhealthy. Try starting it.
    console.log('[mcp:ensure] Container exists, starting...');
    const start = sh('docker', ['start', 'lms-mcp']);
    if (start.code !== 0) {
       console.error('[mcp:ensure] Start failed:', start.err || start.out);
       // Fall through to try recreating it? No, better fail loud to avoid data loss or port conflicts.
       process.exit(1);
    }
  } else {
    if (!cfg.envFile) {
      console.error('[mcp:ensure] ❌ BLOCKED: MCP env file missing.');
      console.error('   Create: lms-mcp/.env.local (preferred) or lms-mcp/.env');
      console.error('   Tip: run `npm run setup` to scaffold required local files.');
      process.exit(1);
    }

    // Try run; if missing image, build then run
    console.log('[mcp:ensure] Starting MCP container...');
    let run = sh('docker', ['run', '-d', '--name', 'lms-mcp', '-p', `127.0.0.1:${cfg.port}:${cfg.port}`, '--env-file', cfg.envFile, 'lms-mcp']);
    if (run.code !== 0) {
      console.log('[mcp:ensure] Image missing, building...');
      const build = sh('docker', ['build', '-t', 'lms-mcp', './lms-mcp']);
      if (build.code !== 0) {
        console.error('[mcp:ensure] Build failed:', build.err || build.out);
        process.exit(1);
      }
      run = sh('docker', ['run', '-d', '--name', 'lms-mcp', '-p', `127.0.0.1:${cfg.port}:${cfg.port}`, '--env-file', cfg.envFile, 'lms-mcp']);
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


