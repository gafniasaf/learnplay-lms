/**
 * Helper to parse learnplay.env file
 * Reads credentials from learnplay.env for tests
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LearnPlayEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ACCESS_TOKEN?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ORGANIZATION_ID?: string;
  PROJECT_ID?: string;
}

export function parseLearnPlayEnv(): LearnPlayEnv {
  const envFile = path.resolve(__dirname, '../../learnplay.env');
  const result: LearnPlayEnv = {};

  try {
    const envContent = readFileSync(envFile, 'utf-8');
    const lines = envContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Project URL -> SUPABASE_URL
      if (line.includes('Project url') && i + 1 < lines.length) {
        result.SUPABASE_URL = lines[i + 1].trim();
      }
      
      // anon public -> SUPABASE_ANON_KEY
      if (line.includes('anon public') && i + 1 < lines.length) {
        result.SUPABASE_ANON_KEY = lines[i + 1].trim();
      }
      
      // service role key -> SUPABASE_SERVICE_ROLE_KEY
      if (line.includes('service role key') && i + 1 < lines.length) {
        result.SUPABASE_SERVICE_ROLE_KEY = lines[i + 1].trim();
      }
      
      // supabase token -> SUPABASE_ACCESS_TOKEN
      if (line.includes('supabase token') && i + 1 < lines.length) {
        result.SUPABASE_ACCESS_TOKEN = lines[i + 1].trim();
      }
      
      // openai key -> OPENAI_API_KEY
      if (line.includes('openai key') && i + 1 < lines.length) {
        result.OPENAI_API_KEY = lines[i + 1].trim();
      }
      
      // anthropic api key -> ANTHROPIC_API_KEY
      if (line.includes('anthropic api key') && i + 1 < lines.length) {
        result.ANTHROPIC_API_KEY = lines[i + 1].trim();
      }
      
      // project id -> PROJECT_ID
      if (line.includes('project id') && i + 1 < lines.length) {
        result.PROJECT_ID = lines[i + 1].trim();
      }
    }
  } catch (error) {
    console.warn('⚠️  Could not read learnplay.env:', error);
  }

  return result;
}

/**
 * Load learnplay.env and set process.env if not already set
 */
export function loadLearnPlayEnv(): void {
  const env = parseLearnPlayEnv();
  
  // Set process.env only if not already set (env vars take precedence)
  if (env.SUPABASE_URL && !process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = env.SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = env.SUPABASE_URL;
  }
  
  if (env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = env.SUPABASE_ANON_KEY;
  }
  
  if (env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  }
  
  if (env.SUPABASE_ACCESS_TOKEN && !process.env.SUPABASE_ACCESS_TOKEN) {
    process.env.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
  }
  
  if (env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.VITE_OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
    process.env.VITE_OPENAI_API_KEY = env.OPENAI_API_KEY;
  }
  
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.VITE_ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    process.env.VITE_ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  }
  
  if (env.PROJECT_ID && !process.env.PROJECT_ID) {
    process.env.PROJECT_ID = env.PROJECT_ID;
  }
}

