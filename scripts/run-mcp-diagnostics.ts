import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.MCP_BASE_URL || "http://127.0.0.1:4000";
let TOKEN = process.env.MCP_AUTH_TOKEN || "dev-local-secret";
const JOB_LIMIT = Number(process.env.DIAG_JOB_LIMIT || 10);

// Allow local contributors to drop the token inside lms-mcp/.env.local
try {
  const envPath = path.join("lms-mcp", ".env.local");
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf-8");
    const match = env.match(/^MCP_AUTH_TOKEN=(.+)$/m);
    if (match?.[1]) {
      TOKEN = match[1].trim();
    }
  }
} catch {
  // noop – best effort
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

