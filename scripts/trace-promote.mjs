#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run trace:promote -- <trace.json>');
  process.exit(1);
}
const abs = path.resolve(file);
const trace = JSON.parse(fs.readFileSync(abs, 'utf-8'));

const name = path.basename(abs).replace(/[^a-z0-9]+/gi, '_').replace(/_json$/i, '');
const outDir = path.resolve('lms-mcp/tests/golden');
const outPath = path.join(outDir, `${name}.test.ts`);

fs.mkdirSync(outDir, { recursive: true });

const content = `describe('golden:${name}', () => {
  it('matches response shape', async () => {
    const res = await fetch('${trace.url}', {
      method: '${trace.method}',
      headers: { 'Content-Type': 'application/json' },
      body: ${trace.method === 'POST' ? `JSON.stringify(${JSON.stringify(trace.body ?? {})})` : 'undefined'}
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(typeof json).toBe('object');
    // assert essential keys if present
    ${trace.response?.json?.ok !== undefined ? `expect(json.ok).toBe(${JSON.stringify(!!trace.response.json.ok)});` : ''}
  });
});\n`;

fs.writeFileSync(outPath, content, 'utf-8');
console.log('[golden] created', outPath);


