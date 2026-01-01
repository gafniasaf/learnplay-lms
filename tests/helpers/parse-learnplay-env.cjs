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
    const nextNonEmptyLine = (startIdx) => {
      for (let j = startIdx; j < lines.length; j++) {
        const v = (lines[j] || "").trim();
        if (v) return v;
      }
      return "";
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      // Support KEY=VALUE style, plus legacy heading-style
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const rawKey = line.slice(0, eqIdx).trim();
        const rawVal = line.slice(eqIdx + 1).trim();
        const key = rawKey.toUpperCase();
        const value = rawVal.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();

        const map = {
          SUPABASE_URL: 'SUPABASE_URL',
          VITE_SUPABASE_URL: 'SUPABASE_URL',
          SUPABASE_ANON_KEY: 'SUPABASE_ANON_KEY',
          VITE_SUPABASE_ANON_KEY: 'SUPABASE_ANON_KEY',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'SUPABASE_ANON_KEY',
          SUPABASE_SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
          SUPABASE_ACCESS_TOKEN: 'SUPABASE_ACCESS_TOKEN',
          OPENAI_API_KEY: 'OPENAI_API_KEY',
          VITE_OPENAI_API_KEY: 'OPENAI_API_KEY',
          ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
          VITE_ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
          AGENT_TOKEN: 'AGENT_TOKEN',
          ORGANIZATION_ID: 'ORGANIZATION_ID',
          VITE_ORGANIZATION_ID: 'ORGANIZATION_ID',
          PROJECT_ID: 'PROJECT_ID',
          USER_ID: 'USER_ID',
          STUDENT_ID: 'STUDENT_ID',
          PARENT_ID: 'PARENT_ID',
          VERIFY_USER_ID: 'USER_ID',
          VERIFY_STUDENT_ID: 'STUDENT_ID',
          VERIFY_PARENT_ID: 'PARENT_ID',
          E2E_ADMIN_EMAIL: 'E2E_ADMIN_EMAIL',
          E2E_ADMIN_PASSWORD: 'E2E_ADMIN_PASSWORD',
        };

        const mapped = map[key];
        if (mapped) result[mapped] = value;
        continue;
      }
      
      if (line.includes('Project url') && i + 1 < lines.length) {
        result.SUPABASE_URL = nextNonEmptyLine(i + 1);
      }
      if (line.includes('anon public') && i + 1 < lines.length) {
        result.SUPABASE_ANON_KEY = nextNonEmptyLine(i + 1);
      }
      if (line.includes('service role key') && i + 1 < lines.length) {
        result.SUPABASE_SERVICE_ROLE_KEY = nextNonEmptyLine(i + 1);
      }
      if (line.includes('supabase token') && i + 1 < lines.length) {
        result.SUPABASE_ACCESS_TOKEN = nextNonEmptyLine(i + 1);
      }
      if (line.includes('openai key') && i + 1 < lines.length) {
        result.OPENAI_API_KEY = nextNonEmptyLine(i + 1);
      }
      if (line.includes('anthropic api key') && i + 1 < lines.length) {
        result.ANTHROPIC_API_KEY = nextNonEmptyLine(i + 1);
      }
      if (line.includes('agent token') && i + 1 < lines.length) {
        result.AGENT_TOKEN = nextNonEmptyLine(i + 1);
      }
      if (line.includes('organization id') && i + 1 < lines.length) {
        result.ORGANIZATION_ID = nextNonEmptyLine(i + 1);
      }
      if ((line.includes('user id') || line.includes('test user id')) && i + 1 < lines.length) {
        result.USER_ID = nextNonEmptyLine(i + 1);
      }
      if (line.includes('student id') && i + 1 < lines.length) {
        result.STUDENT_ID = nextNonEmptyLine(i + 1);
      }
      if (line.includes('parent id') && i + 1 < lines.length) {
        result.PARENT_ID = nextNonEmptyLine(i + 1);
      }
      if (line.includes('project id') && i + 1 < lines.length) {
        result.PROJECT_ID = nextNonEmptyLine(i + 1);
      }

      if (line.includes('e2e admin email') && i + 1 < lines.length) {
        result.E2E_ADMIN_EMAIL = nextNonEmptyLine(i + 1);
      }
      if (line.includes('e2e admin password') && i + 1 < lines.length) {
        result.E2E_ADMIN_PASSWORD = nextNonEmptyLine(i + 1);
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

  if (env.AGENT_TOKEN && !process.env.AGENT_TOKEN) {
    process.env.AGENT_TOKEN = env.AGENT_TOKEN;
  }

  if (env.ORGANIZATION_ID && !process.env.ORGANIZATION_ID && !process.env.VITE_ORGANIZATION_ID) {
    process.env.ORGANIZATION_ID = env.ORGANIZATION_ID;
    process.env.VITE_ORGANIZATION_ID = env.ORGANIZATION_ID;
  }

  if (env.USER_ID && !process.env.VERIFY_USER_ID) {
    process.env.VERIFY_USER_ID = env.USER_ID;
  }
  if (env.STUDENT_ID && !process.env.VERIFY_USER_ID) {
    process.env.VERIFY_USER_ID = env.STUDENT_ID;
  }
  if (env.STUDENT_ID && !process.env.VERIFY_STUDENT_ID) {
    process.env.VERIFY_STUDENT_ID = env.STUDENT_ID;
  }
  if (env.PARENT_ID && !process.env.VERIFY_PARENT_ID) {
    process.env.VERIFY_PARENT_ID = env.PARENT_ID;
  }

  if (env.E2E_ADMIN_EMAIL && !process.env.E2E_ADMIN_EMAIL) {
    process.env.E2E_ADMIN_EMAIL = env.E2E_ADMIN_EMAIL;
  }
  if (env.E2E_ADMIN_PASSWORD && !process.env.E2E_ADMIN_PASSWORD) {
    process.env.E2E_ADMIN_PASSWORD = env.E2E_ADMIN_PASSWORD;
  }
}

module.exports = { parseLearnPlayEnv, loadLearnPlayEnv };

