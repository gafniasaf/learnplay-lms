// CI health check for MCP server
// Calls lms.health via MCP HTTP and asserts ok === true

const BASE_URL = process.env.MCP_BASE_URL;
if (!BASE_URL) {
  console.error('[MCP HEALTH] ❌ MCP_BASE_URL is REQUIRED - set env var before running');
  console.error('   Example: MCP_BASE_URL=http://127.0.0.1:4000');
  process.exit(1);
}

const TOKEN = process.env.MCP_AUTH_TOKEN;
if (!TOKEN) {
  console.error('[MCP HEALTH] ❌ MCP_AUTH_TOKEN is REQUIRED');
  console.error('   Set: $env:MCP_AUTH_TOKEN = "your-token"');
  process.exit(1);
}

async function call(method, params = {}) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

(async () => {
  console.log(`[MCP HEALTH] POST ${BASE_URL} lms.health`);
  const res = await call('lms.health', {});
  if (!res || res.ok !== true) {
    throw new Error(`Unexpected health response: ${JSON.stringify(res)}`);
  }
  console.log('[MCP HEALTH] OK', res.methods ? `methods=${res.methods.length}` : '');
})().catch((e) => {
  console.error('[MCP HEALTH] FAILED:', e.message);
  process.exit(1);
});


