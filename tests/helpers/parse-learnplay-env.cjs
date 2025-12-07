/**
 * CommonJS version for Jest
 */

const { readFileSync } = require('fs');
const path = require('path');

function parseLearnPlayEnv() {
  const envFile = path.resolve(__dirname, '../../learnplay.env');
  const result = {};

  try {
    const envContent = readFileSync(envFile, 'utf-8');
    const lines = envContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('Project url') && i + 1 < lines.length) {
        result.SUPABASE_URL = lines[i + 1].trim();
      }
      if (line.includes('anon public') && i + 1 < lines.length) {
        result.SUPABASE_ANON_KEY = lines[i + 1].trim();
      }
      if (line.includes('service role key') && i + 1 < lines.length) {
        result.SUPABASE_SERVICE_ROLE_KEY = lines[i + 1].trim();
      }
      if (line.includes('supabase token') && i + 1 < lines.length) {
        result.SUPABASE_ACCESS_TOKEN = lines[i + 1].trim();
      }
      if (line.includes('openai key') && i + 1 < lines.length) {
        result.OPENAI_API_KEY = lines[i + 1].trim();
      }
      if (line.includes('anthropic api key') && i + 1 < lines.length) {
        result.ANTHROPIC_API_KEY = lines[i + 1].trim();
      }
      if (line.includes('project id') && i + 1 < lines.length) {
        result.PROJECT_ID = lines[i + 1].trim();
      }
    }
  } catch (error) {
    console.warn('⚠️  Could not read learnplay.env:', error);
  }

  return result;
}

function loadLearnPlayEnv() {
  const env = parseLearnPlayEnv();
  
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

module.exports = { parseLearnPlayEnv, loadLearnPlayEnv };

