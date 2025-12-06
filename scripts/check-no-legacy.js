#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const patterns = [
  'VITE_USE_STORAGE_READS',
  '/storage/v1/object/public/courses/catalog.json',
  'useStorageReads(',
  'catalog.version',
  'download("catalog.json")',
  'https://esm.sh/',
  'corsHeaders',
  'process.env.ALLOW_ANON'
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    // Skip node_modules and hidden folders
    if (name === 'node_modules' || name.startsWith('.')) continue;
    
    let s;
    try {
      s = statSync(p);
    } catch {
      continue; 
    }

    if (s.isDirectory()) {
      yield* walk(p);
    } else if (s.isFile()) {
      yield p;
    }
  }
}

const offenders = [];
for (const file of walk(root)) {
  if (!/\.(ts|tsx|js|jsx|md|json)$/.test(file)) continue;
  if (file.includes('check-no-legacy.js')) continue; // Skip self
  if (file.includes('package-lock.json')) continue; // Skip lockfiles
  if (file.includes('_archive')) continue; // Skip archive

  const text = readFileSync(file, 'utf8');
  for (const pat of patterns) {
    if (text.includes(pat)) {
      // Whitelist specific files for documentation or backward compat shims
      if (pat === 'corsHeaders' && file.includes('_shared/README.md')) continue;
      if (pat === 'corsHeaders' && file.includes('docs/')) continue;
      if (pat === 'https://esm.sh/' && file.includes('docs/')) continue; // Docs might reference it as "don't use"
      
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
