const BASE_URL = process.env.MCP_BASE_URL || 'http://127.0.0.1:4000';
const TOKEN = process.env.MCP_AUTH_TOKEN || 'dev-local-secret';

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

// For now, reuse rlsProbe which exercises RLS/RBAC quickly
async function run() {
  const res = await call('lms.rlsProbe', {});
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });


