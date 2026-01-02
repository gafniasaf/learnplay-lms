#!/usr/bin/env node
// Apply a single migration file using Supabase client (service role)
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const migrationPath = process.argv[2];
if (!migrationPath) {
  console.error('Usage: node scripts/apply-migration.mjs <migration-file.sql>');
  process.exit(1);
}

if (!existsSync(migrationPath)) {
  console.error(`BLOCKED: Migration file not found: ${migrationPath}`);
  process.exit(1);
}

// Load env files
const envFiles = ['supabase/.deploy.env', 'learnplay.env', '.env.factory'];
for (const envFile of envFiles) {
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawVal] = match;
      if (process.env[key]) continue; // Don't overwrite
      let val = rawVal;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('BLOCKED: SUPABASE_URL is REQUIRED');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error('BLOCKED: SUPABASE_SERVICE_ROLE_KEY is REQUIRED');
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Applying migration: ${migrationPath}`);

// Execute SQL via rpc if available, or use raw query
// Supabase JS client doesn't have direct SQL execution, so we use the REST API
const projectRef = SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');

// Use the pg library directly since supabase-js doesn't support raw SQL
import pg from 'pg';
const { Pool } = pg;

// Construct database URL from known Supabase pattern
// Format: postgresql://postgres.[project-ref]:[password]@[host]:5432/postgres
// But we don't have the password... Let's try using the Supabase REST API with service role

console.log('Attempting to run migration via Supabase REST API...');

// The service role key allows running SQL via the /rest/v1/rpc endpoint
// But we need a stored procedure. Let's try the Management API one more time with a shorter timeout

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_ACCESS_TOKEN) {
  console.error('BLOCKED: SUPABASE_ACCESS_TOKEN is REQUIRED for Management API');
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

try {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const text = await response.text();
    console.error(`ERROR: API returned ${response.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }

  console.log('✅ Migration applied successfully!');
} catch (err) {
  clearTimeout(timeout);
  if (err.name === 'AbortError') {
    console.error('ERROR: Request timed out after 30 seconds');
  } else {
    console.error(`ERROR: ${err.message}`);
  }
  process.exit(1);
}
