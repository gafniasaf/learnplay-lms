#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

async function runDirect() {
  // Build lms-mcp first (CI should do this before calling us)
  const root = process.cwd();
  // Import compiled UI audit handler directly
  // Use pathToFileURL for Windows compatibility (import() requires file:// URLs)
  const handlerPath = path.join(root, 'lms-mcp', 'dist', 'handlers', 'uiAudit.js');
  const { run } = await import(pathToFileURL(handlerPath).href);
  const res = await run({ rootDir: root, srcDir: path.join(root, 'src'), mcpDir: path.join(root, 'lms-mcp') });
  const outDir = path.join(root, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dead-ctas-ci.json');
  fs.writeFileSync(outPath, JSON.stringify(res, null, 2));
  return { res, outPath };
}

async function runViaMcp() {
  const BASE = process.env.MCP_BASE_URL;
  if (!BASE) {
    console.error('[UI-CTA-CI] ❌ MCP_BASE_URL is REQUIRED - set env var before running');
    console.error('   Example: MCP_BASE_URL=http://127.0.0.1:4000');
    throw new Error('MCP_BASE_URL not set');
  }
  
  const TOKEN = process.env.MCP_AUTH_TOKEN;
  if (!TOKEN) {
    console.error('[UI-CTA-CI] ❌ MCP_AUTH_TOKEN is REQUIRED');
    throw new Error('MCP_AUTH_TOKEN not set');
  }
  const body = { method: 'lms.uiAudit.fix', params: { dryRun: true, root: process.cwd(), sourceDir: 'src' } };
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(JSON.stringify(json));
  const payload = Array.isArray(json?.data?.actions) ? json.data : { issues: [] };
  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dead-ctas-ci.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return { res: payload, outPath };
}

(async () => {
  try {
    // Try MCP first, fallback to direct
    try {
      const { res, outPath } = await runViaMcp();
      console.log(`Dead CTA report (via MCP) written: ${outPath}`);
      console.log(`Total actions: ${(res.actions || []).length}`);
    } catch (e) {
      console.warn(`MCP path failed (${e?.message || e}), falling back to direct scan.`);
      const { res, outPath } = await runDirect();
      console.log(`Dead CTA report (direct) written: ${outPath}`);
      console.log(`Total issues: ${(res.issues || []).length}`);
    }
  } catch (err) {
    console.error('Dead CTA CI script failed:', err);
    process.exit(1);
  }
})();


