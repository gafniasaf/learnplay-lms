import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * Load local env files for tests (NO secret printing).
 * Priority order matches .cursorrules guidance.
 */
export function loadLocalEnvForTests(): void {
  const root = process.cwd();
  const candidates = [
    path.join(root, 'supabase', '.deploy.env'),
    path.join(root, 'learnplay.env'),
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, '.env.development'),
    path.join(root, '.env.production'),
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const raw = readFileSync(file, 'utf8');
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        if (!key) continue;
        if (process.env[key] === undefined || process.env[key] === '') {
          process.env[key] = value;
        }
      }
    } catch {
      // ignore unreadable local env files
    }
  }

  // Normalize common aliases used across repo.
  if (process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  if (process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_PUBLISHABLE_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
    process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY;
  }
  if (process.env.VITE_SUPABASE_PUBLISHABLE_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
    process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}
