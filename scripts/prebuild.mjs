import { spawnSync } from "node:child_process";
import fs from "node:fs";

function truthy(v) {
  return /^(1|true|yes)$/i.test(String(v || "").trim());
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (res.status && res.status !== 0) {
    process.exit(res.status);
  }
  if (res.error) {
    console.error(res.error);
    process.exit(1);
  }
}

function parseEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = String(raw ?? "").trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      if (key) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function findMcpEnvFile() {
  const candidates = ["lms-mcp/.env.local", "lms-mcp/.env"];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function hasMcpConfig() {
  const token = String(process.env.MCP_AUTH_TOKEN || "").trim();
  const baseUrl = String(process.env.MCP_BASE_URL || "").trim();
  const host = String(process.env.HOST || "").trim();
  const port = String(process.env.PORT || "").trim();
  if (token && (baseUrl || (host && port))) return true;

  const envFile = findMcpEnvFile();
  if (!envFile) return false;
  const env = parseEnvFile(envFile);
  const fileToken = String(env.MCP_AUTH_TOKEN || "").trim();
  const fileBaseUrl = String(env.MCP_BASE_URL || "").trim();
  const fileHost = String(env.HOST || "").trim();
  const filePort = String(env.PORT || "").trim();
  return !!(fileToken && (fileBaseUrl || (fileHost && filePort)));
}

const shouldTypecheck = !truthy(process.env.PREBUILD_SKIP_TYPECHECK);
let shouldCodegen = !truthy(process.env.PREBUILD_SKIP_CODEGEN);
const shouldVerify = truthy(process.env.PREBUILD_VERIFY);

console.log(`[prebuild] typecheck=${shouldTypecheck} codegen=${shouldCodegen} verify=${shouldVerify}`);

if (shouldTypecheck) run("npm", ["run", "typecheck"]);
if (shouldCodegen && !hasMcpConfig()) {
  console.log("[prebuild] Skipping codegen: MCP config not available.");
  console.log("[prebuild] Provide MCP_AUTH_TOKEN + MCP_BASE_URL (or HOST/PORT) to enable.");
  shouldCodegen = false;
}
if (shouldCodegen) run("npm", ["run", "codegen"]);
if (shouldVerify) {
  run("npm", ["run", "verify"]);
} else {
  console.log("[prebuild] Skipping verify (set PREBUILD_VERIFY=1 to enable).");
}
