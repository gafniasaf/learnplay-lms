const BASE_URL = process.env.MCP_BASE_URL;
if (!BASE_URL) {
  console.error('[CONTRACTS] ❌ MCP_BASE_URL is REQUIRED - set env var before running');
  console.error('   Example: MCP_BASE_URL=http://127.0.0.1:4000');
  process.exit(1);
}

const TOKEN = process.env.MCP_AUTH_TOKEN;
if (!TOKEN) {
  console.error('[CONTRACTS] ❌ MCP_AUTH_TOKEN is REQUIRED');
  process.exit(1);
}
import fs from 'node:fs';
import path from 'node:path';

async function call(method, params = {}) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  const outDir = path.resolve('contracts', 'snapshots');
  fs.mkdirSync(outDir, { recursive: true });
  const snap = await call('lms.contracts.snapshot', {});
  const file = path.join(outDir, 'contracts.current.json');
  fs.writeFileSync(file, JSON.stringify(snap, null, 2));

  const baseline = path.join(outDir, 'contracts.baseline.json');
  if (!fs.existsSync(baseline)) {
    console.log('[contracts] No baseline found; create one by promoting current -> baseline');
    process.exit(0);
  }
  const a = JSON.parse(fs.readFileSync(baseline, 'utf-8'));
  const b = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const drift = JSON.stringify(a.targets) !== JSON.stringify(b.targets);
  if (drift) {
    console.error('[contracts] Drift detected');
    process.exit(2);
  }
  console.log('[contracts] OK - no drift');
}

main().catch((e) => { console.error(e); process.exit(1); });


