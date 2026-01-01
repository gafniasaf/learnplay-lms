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
  AGENT_TOKEN?: string;
  ORGANIZATION_ID?: string;
  /**
   * Optional IDs used by live verification scripts.
   * These are NOT secrets but still should not be committed if they point to real users.
   */
  USER_ID?: string;
  STUDENT_ID?: string;
  PARENT_ID?: string;
  PROJECT_ID?: string;
  // Playwright E2E credentials (local-only)
  E2E_ADMIN_EMAIL?: string;
  E2E_ADMIN_PASSWORD?: string;
  E2E_TEACHER_EMAIL?: string;
  E2E_TEACHER_PASSWORD?: string;
  E2E_STUDENT_EMAIL?: string;
  E2E_STUDENT_PASSWORD?: string;
  E2E_PARENT_EMAIL?: string;
  E2E_PARENT_PASSWORD?: string;
}

export function parseLearnPlayEnv(): LearnPlayEnv {
  const envFile = path.resolve(__dirname, '../../learnplay.env');
  const result: LearnPlayEnv = {};

  try {
    const envContent = readFileSync(envFile, 'utf-8');
    const lines = envContent.split('\n');
    const nextNonEmptyLine = (startIdx: number): string => {
      for (let j = startIdx; j < lines.length; j++) {
        const v = lines[j]?.trim() ?? "";
        if (v) return v;
      }
      return "";
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;

      // Support KEY=VALUE style (preferred for local dev); keep heading-style support for backwards compatibility.
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        const rawKey = line.slice(0, eqIdx).trim();
        const rawVal = line.slice(eqIdx + 1).trim();
        const key = rawKey.toUpperCase();
        const value = rawVal.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").trim();

        // Accept both canonical and VITE_* variants
        const map: Record<string, keyof LearnPlayEnv> = {
          SUPABASE_URL: "SUPABASE_URL",
          VITE_SUPABASE_URL: "SUPABASE_URL",
          SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY",
          VITE_SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY",
          VITE_SUPABASE_PUBLISHABLE_KEY: "SUPABASE_ANON_KEY",
          SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
          SUPABASE_ACCESS_TOKEN: "SUPABASE_ACCESS_TOKEN",
          OPENAI_API_KEY: "OPENAI_API_KEY",
          VITE_OPENAI_API_KEY: "OPENAI_API_KEY",
          ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
          VITE_ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
          AGENT_TOKEN: "AGENT_TOKEN",
          ORGANIZATION_ID: "ORGANIZATION_ID",
          VITE_ORGANIZATION_ID: "ORGANIZATION_ID",
          PROJECT_ID: "PROJECT_ID",
          USER_ID: "USER_ID",
          STUDENT_ID: "STUDENT_ID",
          PARENT_ID: "PARENT_ID",
          VERIFY_USER_ID: "USER_ID",
          VERIFY_STUDENT_ID: "STUDENT_ID",
          VERIFY_PARENT_ID: "PARENT_ID",
          E2E_ADMIN_EMAIL: "E2E_ADMIN_EMAIL",
          E2E_ADMIN_PASSWORD: "E2E_ADMIN_PASSWORD",
          E2E_TEACHER_EMAIL: "E2E_TEACHER_EMAIL",
          E2E_TEACHER_PASSWORD: "E2E_TEACHER_PASSWORD",
          E2E_STUDENT_EMAIL: "E2E_STUDENT_EMAIL",
          E2E_STUDENT_PASSWORD: "E2E_STUDENT_PASSWORD",
          E2E_PARENT_EMAIL: "E2E_PARENT_EMAIL",
          E2E_PARENT_PASSWORD: "E2E_PARENT_PASSWORD",
        };

        const mapped = map[key];
        if (mapped) {
          (result as any)[mapped] = value;
        }
        continue;
      }
      
      // Project URL -> SUPABASE_URL
      if (line.includes('Project url') && i + 1 < lines.length) {
        result.SUPABASE_URL = nextNonEmptyLine(i + 1);
      }
      
      // anon public -> SUPABASE_ANON_KEY
      if (line.includes('anon public') && i + 1 < lines.length) {
        result.SUPABASE_ANON_KEY = nextNonEmptyLine(i + 1);
      }
      
      // service role key -> SUPABASE_SERVICE_ROLE_KEY
      if (line.includes('service role key') && i + 1 < lines.length) {
        result.SUPABASE_SERVICE_ROLE_KEY = nextNonEmptyLine(i + 1);
      }
      
      // supabase token -> SUPABASE_ACCESS_TOKEN
      if (line.includes('supabase token') && i + 1 < lines.length) {
        result.SUPABASE_ACCESS_TOKEN = nextNonEmptyLine(i + 1);
      }
      
      // openai key -> OPENAI_API_KEY
      if (line.includes('openai key') && i + 1 < lines.length) {
        result.OPENAI_API_KEY = nextNonEmptyLine(i + 1);
      }
      
      // anthropic api key -> ANTHROPIC_API_KEY
      if (line.includes('anthropic api key') && i + 1 < lines.length) {
        result.ANTHROPIC_API_KEY = nextNonEmptyLine(i + 1);
      }

      // agent token -> AGENT_TOKEN
      if (line.includes('agent token') && i + 1 < lines.length) {
        result.AGENT_TOKEN = nextNonEmptyLine(i + 1);
      }

      // organization id -> ORGANIZATION_ID
      if (line.includes('organization id') && i + 1 < lines.length) {
        result.ORGANIZATION_ID = nextNonEmptyLine(i + 1);
      }

      // user id -> USER_ID
      if ((line.includes('user id') || line.includes('test user id')) && i + 1 < lines.length) {
        result.USER_ID = nextNonEmptyLine(i + 1);
      }

      // student id -> STUDENT_ID
      if (line.includes('student id') && i + 1 < lines.length) {
        result.STUDENT_ID = nextNonEmptyLine(i + 1);
      }

      // parent id -> PARENT_ID
      if (line.includes('parent id') && i + 1 < lines.length) {
        result.PARENT_ID = nextNonEmptyLine(i + 1);
      }
      
      // project id -> PROJECT_ID
      if (line.includes('project id') && i + 1 < lines.length) {
        result.PROJECT_ID = nextNonEmptyLine(i + 1);
      }

      // e2e admin email/password (heading-style)
      if (line.includes('e2e admin email') && i + 1 < lines.length) {
        result.E2E_ADMIN_EMAIL = nextNonEmptyLine(i + 1);
      }
      if (line.includes('e2e admin password') && i + 1 < lines.length) {
        result.E2E_ADMIN_PASSWORD = nextNonEmptyLine(i + 1);
      }

      // e2e teacher/student/parent credentials (heading-style)
      if (line.includes('e2e teacher email') && i + 1 < lines.length) {
        result.E2E_TEACHER_EMAIL = nextNonEmptyLine(i + 1);
      }
      if (line.includes('e2e teacher password') && i + 1 < lines.length) {
        result.E2E_TEACHER_PASSWORD = nextNonEmptyLine(i + 1);
      }
      if (line.includes('e2e student email') && i + 1 < lines.length) {
        result.E2E_STUDENT_EMAIL = nextNonEmptyLine(i + 1);
      }
      if (line.includes('e2e student password') && i + 1 < lines.length) {
        result.E2E_STUDENT_PASSWORD = nextNonEmptyLine(i + 1);
      }
      if (line.includes('e2e parent email') && i + 1 < lines.length) {
        result.E2E_PARENT_EMAIL = nextNonEmptyLine(i + 1);
      }
      if (line.includes('e2e parent password') && i + 1 < lines.length) {
        result.E2E_PARENT_PASSWORD = nextNonEmptyLine(i + 1);
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

  if (env.AGENT_TOKEN && !process.env.AGENT_TOKEN) {
    process.env.AGENT_TOKEN = env.AGENT_TOKEN;
  }

  if (env.ORGANIZATION_ID && !process.env.ORGANIZATION_ID && !process.env.VITE_ORGANIZATION_ID) {
    process.env.ORGANIZATION_ID = env.ORGANIZATION_ID;
    process.env.VITE_ORGANIZATION_ID = env.ORGANIZATION_ID;
  }

  // IDs used by scripts (env vars take precedence)
  if (env.USER_ID && !process.env.VERIFY_USER_ID) {
    process.env.VERIFY_USER_ID = env.USER_ID;
  }
  // Back-compat: accept student id as user id for endpoints that resolve from auth.userId
  if (env.STUDENT_ID && !process.env.VERIFY_USER_ID) {
    process.env.VERIFY_USER_ID = env.STUDENT_ID;
  }
  if (env.STUDENT_ID && !process.env.VERIFY_STUDENT_ID) {
    process.env.VERIFY_STUDENT_ID = env.STUDENT_ID;
  }
  if (env.PARENT_ID && !process.env.VERIFY_PARENT_ID) {
    process.env.VERIFY_PARENT_ID = env.PARENT_ID;
  }

  // Playwright E2E credentials
  if (env.E2E_ADMIN_EMAIL && !process.env.E2E_ADMIN_EMAIL) {
    process.env.E2E_ADMIN_EMAIL = env.E2E_ADMIN_EMAIL;
  }
  if (env.E2E_ADMIN_PASSWORD && !process.env.E2E_ADMIN_PASSWORD) {
    process.env.E2E_ADMIN_PASSWORD = env.E2E_ADMIN_PASSWORD;
  }

  if (env.E2E_TEACHER_EMAIL && !process.env.E2E_TEACHER_EMAIL) {
    process.env.E2E_TEACHER_EMAIL = env.E2E_TEACHER_EMAIL;
  }
  if (env.E2E_TEACHER_PASSWORD && !process.env.E2E_TEACHER_PASSWORD) {
    process.env.E2E_TEACHER_PASSWORD = env.E2E_TEACHER_PASSWORD;
  }

  if (env.E2E_STUDENT_EMAIL && !process.env.E2E_STUDENT_EMAIL) {
    process.env.E2E_STUDENT_EMAIL = env.E2E_STUDENT_EMAIL;
  }
  if (env.E2E_STUDENT_PASSWORD && !process.env.E2E_STUDENT_PASSWORD) {
    process.env.E2E_STUDENT_PASSWORD = env.E2E_STUDENT_PASSWORD;
  }

  if (env.E2E_PARENT_EMAIL && !process.env.E2E_PARENT_EMAIL) {
    process.env.E2E_PARENT_EMAIL = env.E2E_PARENT_EMAIL;
  }
  if (env.E2E_PARENT_PASSWORD && !process.env.E2E_PARENT_PASSWORD) {
    process.env.E2E_PARENT_PASSWORD = env.E2E_PARENT_PASSWORD;
  }
}

