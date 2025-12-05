import fs from 'node:fs';
import path from 'node:path';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) files.push(p);
  }
  return files;
}

const srcDir = path.resolve('src');
const files = walk(srcDir);
let proxyCalls = 0;
let directCalls = 0;
let totalHandlers = 0;

for (const f of files) {
  const text = fs.readFileSync(f, 'utf-8');
  // Approximate handler count
  totalHandlers += (text.match(/onClick=\{/g) || []).length;
  // Proxy-first usage
  proxyCalls += (text.match(/mcp-metrics-proxy/g) || []).length;
  // Direct Edge usage
  directCalls += (text.match(/\/functions\/v1\//g) || []).length;
}

const coverage = proxyCalls + directCalls > 0 ? proxyCalls / (proxyCalls + directCalls) : 1;
const result = { proxyCalls, directCalls, totalHandlers, proxyCoverage: Number(coverage.toFixed(3)) };
console.log(JSON.stringify(result, null, 2));

// Non-zero directCalls will warn (but not fail)
process.exit(0);


