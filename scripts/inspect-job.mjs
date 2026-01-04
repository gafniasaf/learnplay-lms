/**
 * Inspect a single ai_agent_jobs record via the deployed `get-job` edge function.
 *
 * Usage:
 *   node scripts/inspect-job.mjs <jobId>
 *
 * Env (required):
 * - SUPABASE_URL or VITE_SUPABASE_URL
 * - AGENT_TOKEN
 * - ORGANIZATION_ID
 *
 * Secrets policy:
 * - This script NEVER prints secret values (tokens/keys).
 * - It prints only job metadata + event messages (last 30) to help debug failures.
 */
import fs from "node:fs";
import path from "node:path";

function loadKeyValueEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (!key) continue;

      // Strip simple wrapping quotes without regex (PowerShell-safe).
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore (best-effort local env resolution)
  }
}

function loadLocalEnvFiles(root) {
  const candidates = [
    path.join(root, "supabase", ".deploy.env"),
    path.join(root, "learnplay.env"),
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.development"),
    path.join(root, ".env.production"),
  ];
  for (const f of candidates) loadKeyValueEnvFile(f);

  // Normalize common aliases
  if (process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED`);
  }
  return v.trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const jobId = String(process.argv[2] || "").trim();
  if (!jobId) throw new Error("BLOCKED: jobId argument is required");

  const root = process.cwd();
  loadLocalEnvFiles(root);

  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const agentToken = requireEnv("AGENT_TOKEN");
  const organizationId = requireEnv("ORGANIZATION_ID");

  const url = `${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=200`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Agent-Token": agentToken,
      "X-Organization-Id": organizationId,
      Accept: "application/json",
    },
  });
  const text = await res.text().catch(() => "");
  const json = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || `${res.status}`;
    throw new Error(`HTTP ${res.status} from get-job: ${msg}`);
  }
  if (json && json.ok === false) {
    const msg = json?.error?.message || json?.error || "Unknown error";
    throw new Error(`Edge error from get-job: ${msg}`);
  }

  const job = json?.job || {};
  const events = Array.isArray(json?.events)
    ? json.events
    : Array.isArray(job?.events)
      ? job.events
      : [];

  const summary = {
    ok: json?.ok,
    job: {
      id: job?.id ?? null,
      job_type: job?.job_type ?? null,
      status: job?.status ?? null,
      error: job?.error ?? null,
      started_at: job?.started_at ?? null,
      completed_at: job?.completed_at ?? null,
      payloadKeys: job?.payload && typeof job.payload === "object" ? Object.keys(job.payload) : null,
      resultKeys: job?.result && typeof job.result === "object" ? Object.keys(job.result) : null,
    },
    events: events.slice(-30).map((e) => ({
      at: e?.created_at || e?.at || e?.timestamp || null,
      type: e?.event_type || e?.type || null,
      stage: e?.stage || null,
      progress: Object.prototype.hasOwnProperty.call(e || {}, "progress") ? e.progress : null,
      message: e?.message || e?.msg || null,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ inspect-job failed: ${msg}`);
  process.exit(1);
});

