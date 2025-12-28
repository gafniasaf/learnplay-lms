import fs from "node:fs";
import path from "node:path";

function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    const out: Record<string, string> = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if (
        v.length >= 2 &&
        ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      ) {
        v = v.slice(1, -1);
      }
      if (k) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function findMcpEnvFile(): string | null {
  const candidates = [path.join("lms-mcp", ".env.local"), path.join("lms-mcp", ".env")];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function normalizeHost(host: string | undefined): string {
  const h = String(host || "").trim();
  if (!h) return "";
  if (h === "0.0.0.0" || h === "::") return "127.0.0.1";
  return h;
}

let BASE_URL: string | undefined = process.env.MCP_BASE_URL;
let TOKEN: string | undefined = process.env.MCP_AUTH_TOKEN;

// Try to resolve from lms-mcp env file (preferred) if not set
const envPath = findMcpEnvFile();
const fileEnv = envPath ? parseEnvFile(envPath) : {};

if (!BASE_URL) {
  const host = normalizeHost(fileEnv.HOST);
  const portRaw = String(fileEnv.PORT || "").trim();
  const port = Number(portRaw);
  if (host && portRaw && Number.isFinite(port) && port > 0) {
    BASE_URL = `http://${host}:${port}`;
  }
}

if (!BASE_URL) {
  console.error("❌ MCP_BASE_URL is REQUIRED - set env var before running");
  console.error("   Example: MCP_BASE_URL=http://127.0.0.1:4000");
  console.error("   Or set HOST and PORT in lms-mcp/.env.local");
  process.exit(1);
}

if (!TOKEN) {
  TOKEN = fileEnv.MCP_AUTH_TOKEN;
}
const JOB_LIMIT = Number(process.env.DIAG_JOB_LIMIT);
if (!JOB_LIMIT || isNaN(JOB_LIMIT)) {
  console.error('❌ DIAG_JOB_LIMIT is REQUIRED - set env var before running');
  console.error('   Example: DIAG_JOB_LIMIT=10');
  process.exit(1);
}

// Per IgniteZero rules: No fallbacks - require real token
if (!TOKEN) {
  console.error("❌ MCP_AUTH_TOKEN is REQUIRED");
  console.error("   Set: $env:MCP_AUTH_TOKEN = 'your-token'");
  console.error("   Or create lms-mcp/.env.local with MCP_AUTH_TOKEN=...");
  process.exit(1);
}

type MCPResponse<T> = { ok: boolean; result?: T; error?: string } | T;

async function call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<MCPResponse<T>> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method, params }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text as MCPResponse<T>;
  }
}

function extractJobs(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.jobs)) return result.jobs;
  if (Array.isArray(result?.result?.jobs)) return result.result.jobs;
  if (Array.isArray(result?.result)) return result.result;
  return [];
}

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  MCP Diagnostics – lms.health + listJobs");
  console.log("══════════════════════════════════════════════\n");
  console.log(`📡 Endpoint : ${BASE_URL}`);

  try {
    const health = await call<{ methods?: string[] }>("lms.health");
    const healthPayload = (health as any)?.result ?? health;
    if ((health as any)?.ok === false) {
      throw new Error((health as any).error || "Unknown health failure");
    }

    const methods = (healthPayload?.methods as string[]) || [];
    console.log("✅ lms.health passed");
    console.log(`   Available methods: ${methods.join(", ") || "unknown"}`);
  } catch (error) {
    console.error("❌ lms.health failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log("\n📋 Fetching recent jobs…");
  let jobs: any[] = [];
  try {
    const jobResponse = await call("lms.listJobs", { limit: JOB_LIMIT });
    jobs = extractJobs(jobResponse);
  } catch (error) {
    console.error("❌ lms.listJobs failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (jobs.length === 0) {
    console.log("   No jobs returned.");
  } else {
    const grouped = jobs.reduce<Record<string, number>>((acc, job) => {
      const status = job?.status || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    Object.entries(grouped).forEach(([status, count]) => {
      const icon = status === "completed" ? "✅" : status === "failed" ? "❌" : "•";
      console.log(`   ${icon} ${status}: ${count}`);
    });
  }

  const failedJobs = jobs.filter((job) => job?.status === "failed");
  if (failedJobs.length) {
    console.log(`\n⚠️  Found ${failedJobs.length} failed job(s). Fetching the latest details…`);

    for (const job of failedJobs.slice(0, 3)) {
      if (!job?.id) continue;
      try {
        const detail = await call("lms.getJob", { id: job.id });
        console.log(`   • ${job.id}: ${(detail as any)?.result?.error || job.error || "see logs"}`);
      } catch (error) {
        console.warn(`   • ${job.id}: Unable to fetch details (${error instanceof Error ? error.message : error})`);
      }
    }
  } else {
    console.log("\n✅ No failed jobs detected in the latest batch.");
  }

  console.log("\nDone. Use this script before debugging Edge Functions to capture MCP state.");
}

main().catch((error) => {
  console.error("💥 Diagnostics crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

