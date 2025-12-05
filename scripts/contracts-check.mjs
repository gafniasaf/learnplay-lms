#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const genPath = path.resolve('contracts/snapshots/lms-mcp.generated.json');
const basePath = path.resolve('contracts/snapshots/lms-mcp.json');

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return res.status ?? 0;
}

// Ensure generated exists
fs.mkdirSync(path.dirname(genPath), { recursive: true });
const genCode = run('npm', ['run', '-s', 'contracts:snapshot']);
if (genCode !== 0) {
  process.exit(genCode);
}

if (!fs.existsSync(basePath)) {
  // First run: create baseline automatically and pass
  fs.copyFileSync(genPath, basePath);
  console.log('[contracts] Baseline created:', basePath);
  process.exit(0);
}

const a = fs.readFileSync(genPath, 'utf-8');
const b = fs.readFileSync(basePath, 'utf-8');
if (a.trim() !== b.trim()) {
  console.error('[contracts] Drift detected. Run: npm run contracts:update');
  process.exit(1);
}
console.log('[contracts] OK');
process.exit(0);


