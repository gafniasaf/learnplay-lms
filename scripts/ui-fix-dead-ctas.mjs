#!/usr/bin/env node

const BASE = process.env.MCP_BASE_URL;
if (!BASE) {
  console.error('[UI-FIX] ❌ MCP_BASE_URL is REQUIRED - set env var before running');
  console.error('   Example: MCP_BASE_URL=http://127.0.0.1:4000');
  process.exit(1);
}

const TOKEN = process.env.MCP_AUTH_TOKEN;
if (!TOKEN) {
  console.error('[UI-FIX] ❌ MCP_AUTH_TOKEN is REQUIRED');
  process.exit(1);
}

async function call(method, params = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`❌ ${method} failed`, json);
    process.exit(1);
  }
  return json;
}

(async () => {
  // Dry-run fix first
  // Per NO-FALLBACK POLICY: Use defaults but don't use || operator
  const SCAN_ROOT = process.env.MCP_SCAN_ROOT;
  const SCAN_SRC = process.env.MCP_SCAN_SRC;
  
  const fix = await call('lms.uiAudit.fix', {
    dryRun: true,
    root: SCAN_ROOT || process.cwd(),
    sourceDir: SCAN_SRC || 'src',
  });
  const actions = fix?.actions || [];
  console.log(`Dead CTA actions (dry-run): ${actions.length}`);
  for (const a of actions.slice(0, 20)) {
    console.log(`- ${a.action} ${a.target || ''} @ ${a.file}${a.line ? ':' + a.line : ''} — ${a.reason}`);
  }
  // Summary
  const rep = await call('lms.uiAudit.report', {});
  console.log('Summary:', JSON.stringify(rep?.data || rep, null, 2));
})();


