/**
 * Generate a standard KEY=VALUE dotenv file from learnplay.env (heading-style).
 * This lets PowerShell load required secrets without printing them.
 *
 * Usage:
 *   npx tsx scripts/ci/generate-dotenv-from-learnplay.ts --out .env.learnplay.generated
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseLearnPlayEnv } from "../../tests/helpers/parse-learnplay-env";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const outRel = argValue("--out") ?? ".env.learnplay.generated";
const outPath = path.resolve(process.cwd(), outRel);

const env = parseLearnPlayEnv();

function parseDeployEnv(): Record<string, string> {
  const deployPath = path.resolve(process.cwd(), "supabase", ".deploy.env");
  if (!existsSync(deployPath)) return {};
  const out: Record<string, string> = {};
  const content = readFileSync(deployPath, "utf8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
    if (key && value) out[key] = value;
  }
  return out;
}

const deployEnv = parseDeployEnv();

const required: Array<keyof typeof env> = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
];

const missing = required.filter((k) => !env[k] || String(env[k]).trim() === "");
if (missing.length > 0) {
  console.error(`❌ learnplay.env is missing required fields: ${missing.join(", ")}`);
  process.exit(1);
}

// These can come from supabase/.deploy.env
const agentToken = env.AGENT_TOKEN || deployEnv.AGENT_TOKEN || "";
const organizationId = env.ORGANIZATION_ID || deployEnv.ORGANIZATION_ID || "";
if (!agentToken || !organizationId) {
  console.error("❌ Missing required fields for deployment: AGENT_TOKEN and/or ORGANIZATION_ID");
  console.error("   Provide them in learnplay.env as KEY=VALUE, or set them in supabase/.deploy.env");
  process.exit(1);
}

// Optional IDs used by live verification scripts
const optional: Array<keyof typeof env> = ["USER_ID", "STUDENT_ID", "PARENT_ID", "PROJECT_ID"];

const lines: string[] = [];
lines.push(`SUPABASE_URL=${env.SUPABASE_URL}`);
lines.push(`SUPABASE_ANON_KEY=${env.SUPABASE_ANON_KEY}`);
lines.push(`SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}`);
lines.push(`SUPABASE_ACCESS_TOKEN=${env.SUPABASE_ACCESS_TOKEN}`);
lines.push(`AGENT_TOKEN=${agentToken}`);
lines.push(`ORGANIZATION_ID=${organizationId}`);

if (env.USER_ID) lines.push(`VERIFY_USER_ID=${env.USER_ID}`);
if (env.STUDENT_ID) lines.push(`VERIFY_STUDENT_ID=${env.STUDENT_ID}`);
if (env.PARENT_ID) lines.push(`VERIFY_PARENT_ID=${env.PARENT_ID}`);
if (env.PROJECT_ID) lines.push(`PROJECT_ID=${env.PROJECT_ID}`);

writeFileSync(outPath, lines.join("\n") + "\n", { encoding: "utf8" });
console.log(`✅ Wrote ${path.relative(process.cwd(), outPath)} (sanitized: values not printed here).`);


