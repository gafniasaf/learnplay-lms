import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: false });
  dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });
} catch {
  // Optional local env files are best-effort; fall back to process env.
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export const config = {
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  agentToken: requireEnv('AGENT_TOKEN'),
  mcpAuthToken: requireEnv('MCP_AUTH_TOKEN'),
  organizationId: process.env.ORGANIZATION_ID,
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
};


