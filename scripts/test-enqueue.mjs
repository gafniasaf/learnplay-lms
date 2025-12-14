// Test enqueue-job Edge Function

import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Load supabase/.deploy.env if present (gitignored).
try {
  const p = path.resolve(process.cwd(), 'supabase', '.deploy.env');
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf-8');
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
      if (!process.env[key] && value) process.env[key] = value;
    }
  }
} catch {
  // ignore
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const ORG_ID = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;

if (!SUPABASE_URL || !ANON_KEY || !AGENT_TOKEN || !ORG_ID) {
  console.error('❌ Missing env. Required: SUPABASE_URL, SUPABASE_ANON_KEY, AGENT_TOKEN, ORGANIZATION_ID');
  process.exit(1);
}

async function test() {
  console.log('🧪 Testing enqueue-job with agent token...\n');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'x-agent-token': AGENT_TOKEN,
      'x-organization-id': ORG_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      jobType: 'smoke-test', 
      payload: { test: true } 
    })
  });
  
  console.log('Status:', response.status);
  // Avoid dumping request/response headers in case any proxies add sensitive values.
  
  const text = await response.text();
  console.log('\nBody:', text);
  
  if (response.ok) {
    console.log('\n✅ enqueue-job is working!');
  } else {
    console.log('\n❌ enqueue-job failed');
  }
}

test().catch(console.error);

