import fs from 'node:fs';

// Diagnostic-only: print guidance to rotate tokens across environments.
const envs = {
  github: process.env.MCP_AUTH_TOKEN_GITHUB || '',
  supabase: process.env.MCP_AUTH_TOKEN_SUPABASE || '',
  local: process.env.MCP_AUTH_TOKEN_LOCAL || '',
};

const suggestions = [];
const nonEmpty = Object.entries(envs).filter(([, v]) => v).map(([k, v]) => ({ k, v: v.slice(-6) }));

if (nonEmpty.length >= 2) {
  const unique = new Set(nonEmpty.map(e => e.v));
  if (unique.size > 1) {
    suggestions.push('Tokens differ across environments. Align MCP_AUTH_TOKEN in GitHub, Supabase, and local .env.');
  }
}

const report = { ok: suggestions.length === 0, envs: Object.keys(envs), suggestions };
console.log(JSON.stringify(report, null, 2));

// Non-destructive; exit 0. In a future iteration this can open a PR via GitHub API.
process.exit(0);


