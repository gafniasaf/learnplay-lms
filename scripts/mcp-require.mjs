#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

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
  if (!token) token = fileEnv.MCP_AUTH_TOKEN || undefined;

  if (!token || token === 'CHANGE_ME_REQUIRED') {
    console.error('[mcp:require] ❌ BLOCKED: MCP_AUTH_TOKEN is REQUIRED');
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
      console.error('[mcp:require] ❌ BLOCKED: MCP_BASE_URL is REQUIRED');
      console.error('   Provide env var MCP_BASE_URL (e.g. http://127.0.0.1:4000)');
      console.error('   Or set HOST and PORT in lms-mcp/.env.local');
      process.exit(1);
    }
    baseUrl = `http://${host}:${port}`;
  }

  return { baseUrl, token };
}

async function health(cfg) {
  try {
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
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
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  return { code: res.status ?? 0 };
}

(async () => {
  const cfg = resolveMcpConfig();

  if (await health(cfg)) {
    console.log('[mcp:require] MCP healthy.');
    process.exit(0);
  }

  console.warn('[mcp:require] MCP not healthy. Attempting to start via mcp:ensure...');
  const started = sh('npm', ['run', 'mcp:ensure']);
  if (started.code !== 0) {
    console.error('[mcp:require] ❌ BLOCKED: Unable to start MCP (mcp:ensure failed).');
    process.exit(1);
  }

  const cfg2 = resolveMcpConfig();
  for (let i = 0; i < 10; i++) {
    if (await health(cfg2)) {
      console.log('[mcp:require] MCP healthy.');
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.error('[mcp:require] ❌ BLOCKED: MCP did not become healthy in time.');
  process.exit(1);
})().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[mcp:require] ❌ BLOCKED:', msg);
  process.exit(1);
});


