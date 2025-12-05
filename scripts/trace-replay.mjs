#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run trace:replay -- <trace.json>');
  process.exit(1);
}
const abs = path.resolve(file);
const trace = JSON.parse(fs.readFileSync(abs, 'utf-8'));

async function main() {
  const res = await fetch(trace.url, {
    method: trace.method,
    headers: { ...(trace.headers || {}), 'Content-Type': 'application/json' },
    body: trace.method === 'POST' ? JSON.stringify(trace.body ?? {}) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  console.log('HTTP', res.status, JSON.stringify(json).slice(0, 500));
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });


