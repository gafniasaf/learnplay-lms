#!/usr/bin/env node
const { readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

const root = process.cwd();
const patterns = [
  'VITE_USE_STORAGE_READS',
  '/storage/v1/object/public/courses/catalog.json',
  'useStorageReads(',
  'catalog.version',
  'download("catalog.json")',
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.git' || name === 'reports') continue;
      yield* walk(p);
    } else if (s.isFile()) {
      yield p;
    }
  }
}

const offenders = [];
for (const file of walk(root)) {
  if (!/\.(ts|tsx|js|jsx|md)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const pat of patterns) {
    if (text.includes(pat)) {
      offenders.push({ file, pat });
    }
  }
}

if (offenders.length) {
  console.error('\nLegacy patterns detected (fail CI):');
  for (const o of offenders) console.error(` - ${o.file} :: ${o.pat}`);
  process.exit(1);
}
console.log('No legacy patterns detected.');