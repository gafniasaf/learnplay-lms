#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) {
  console.error('Missing SUPABASE_PROJECT_REF env. Aborting.');
  process.exit(1);
}

function run(cmd, args, env = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', env: { ...process.env, ...env } });
  if (res.status !== 0) {
    const out = (res.stdout || '').toString();
    const err = (res.stderr || '').toString();
    throw new Error(`${cmd} ${args.join(' ')} failed\n${out}\n${err}`);
  }
  return (res.stdout || '').toString();
}

function mask(token) {
  if (!token) return '';
  const last = token.slice(-6);
  return `***${last}`;
}

const token = crypto.randomBytes(32).toString('hex');

// 1) Supabase secret
try {
  run('supabase', ['secrets', 'set', `AGENT_TOKEN=${token}`, '--project-ref', projectRef]);
  console.log('Supabase AGENT_TOKEN updated');
} catch (e) {
  console.error('Failed to set Supabase secret:', e.message);
}

// 2) GitHub repo secret (best effort)
try {
  run('gh', ['secret', 'set', 'AGENT_TOKEN', '--body', token]);
  console.log('GitHub AGENT_TOKEN updated');
} catch {
  console.warn('Skipped GitHub secret (gh CLI not available or not authenticated)');
}

// 3) Update local MCP env file if present
try {
  const envPath = path.resolve('lms-mcp', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    let found = false;
    const out = lines
      .map((l) => {
        if (l.startsWith('AGENT_TOKEN=')) {
          found = true;
          return `AGENT_TOKEN=${token}`;
        }
        return l;
      })
      .join('\n');
    const newContent = found ? out : (out.endsWith('\n') ? out : out + '\n') + `AGENT_TOKEN=${token}\n`;
    fs.writeFileSync(envPath, newContent, 'utf-8');
    console.log(`Updated ${envPath}`);
  } else {
    console.log('lms-mcp/.env.local not found; skipped local update');
  }
} catch (e) {
  console.warn('Skipped local env update:', e.message);
}

console.log('Agent token rotated:', mask(token));
console.log('Remember to update the team vault record with the new token.');


