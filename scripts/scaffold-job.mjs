#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npm run scaffold:job -- <job-slug>');
  process.exit(1);
}
const slug = String(args[0]).trim().toLowerCase().replace(/[^a-z0-9\-]/g, '-');
if (!slug) {
  console.error('Invalid job slug');
  process.exit(1);
}
const pascal = slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) {
    console.log('[skip]', filePath);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('[create]', filePath);
}

// Edge Function
writeIfMissing(
  `supabase/functions/${slug}/index.ts`,
  `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withCors } from "../_shared/cors.ts";

serve(withCors(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  const token = req.headers.get("X-Agent-Token") || "";
  const expected = Deno.env.get("AGENT_TOKEN") || "";
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  try {
    const body = await req.json();
    // TODO: implement ${slug}
    return new Response(JSON.stringify({ ok: true, jobType: "${slug}", echo: body }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
}));\n`
);

// MCP handler
writeIfMissing(
  `lms-mcp/src/handlers/${slug}.ts`,
  `import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function ${pascal}({ params }: { params: any }) {
  const url = \`\${config.supabaseUrl}/functions/v1/${slug}\`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
    body: params,
    timeoutMs: 15000,
  });
  if (!res.ok) throw new Error(\`${slug} failed (\${res.status}): \${res.json?.error || res.text}\`);
  return res.json;
}\n`
);

// MCP unit test
writeIfMissing(
  `lms-mcp/tests/${slug}.test.ts`,
  `import { fetchJson } from '../src/http';

jest.mock('../src/http', () => ({
  fetchJson: jest.fn(async (_url: string, _opts: any) => ({ ok: true, status: 200, json: { ok: true, jobType: '${slug}' } })),
}));

describe('${slug} handler', () => {
  let handler: any;
  beforeAll(async () => {
    // Test-only mock values (not used in production)
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.AGENT_TOKEN = 'test-agent-token';
    process.env.MCP_AUTH_TOKEN = 'test-mcp-token';
    jest.resetModules();
    handler = (await import('../src/handlers/${slug}')).${pascal};
  });
  it('returns ok', async () => {
    const res = await handler({ params: { courseId: 'c-1' } as any });
    expect(res.ok).toBe(true);
  });
});\n`
);

// Editor CTA snippet (printed)
console.log('\\n[editor] Add a CTA in CourseEditor to POST /functions/v1/${slug} and preview via Dry-Run when applicable.');
console.log('[mcp] Register lms.${slug} in lms-mcp/src/index.ts and add a Zod input in validators if needed.');
console.log('\\nDone.');

