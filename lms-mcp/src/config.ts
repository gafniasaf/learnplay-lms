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

function requireEnv(name: string, allowEmpty = false): string {
  const v = process.env[name];
  if (!v && !allowEmpty) {
    throw new Error(`Missing env: ${name}`);
  }
  return v || '';
}

export const config = {
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  agentToken: requireEnv('AGENT_TOKEN'),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  allowServiceRole: process.env.ALLOW_SERVICE_ROLE === '1' || process.env.ALLOW_SERVICE_ROLE === 'true',
  mcpAuthToken: requireEnv('MCP_AUTH_TOKEN'),
  port: +(process.env.PORT || '4000'),
  host: process.env.HOST || '127.0.0.1',
  organizationId: process.env.ORGANIZATION_ID,
  optionBEnabled: process.env.OPTION_B_ENABLED === '1' || process.env.OPTION_B_ENABLED === 'true',
};

export function useServiceRole(): boolean {
  // Only allow SR in explicit mode and only when binding to localhost
  return config.allowServiceRole && (config.host === '127.0.0.1' || config.host === '::1' || config.host === 'localhost');
}
