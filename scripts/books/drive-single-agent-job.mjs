/**
 * Drive a single agent job to completion by repeatedly kicking ai-job-runner worker mode.
 *
 * Usage:
 *   node scripts/books/drive-single-agent-job.mjs <jobId>
 *
 * Env (required):
 * - SUPABASE_URL (or VITE_SUPABASE_URL)
 * - AGENT_TOKEN
 * - ORGANIZATION_ID
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
      const value = trimmed
        .slice(idx + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
      if (!key) continue;
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore
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

  if (process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}

function loadLearnplayHeadingEnv() {
  try {
    const { loadLearnPlayEnv } = require("../../tests/helpers/parse-learnplay-env.cjs");
    if (typeof loadLearnPlayEnv === "function") loadLearnPlayEnv();
  } catch {
    // ignore
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function postJson(url, body, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text().catch(() => "");
  const json = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || `${res.status}`;
    throw new Error(`HTTP ${res.status} from ${url}: ${msg}`);
  }
  if (json && json.ok === false) {
    const msg = json?.error?.message || json?.error || "Unknown error";
    throw new Error(`Edge error from ${url}: ${msg}`);
  }
  return json;
}

async function getJson(url, headers) {
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text().catch(() => "");
  const json = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || `${res.status}`;
    throw new Error(`HTTP ${res.status} from ${url}: ${msg}`);
  }
  if (json && json.ok === false) {
    const msg = json?.error?.message || json?.error || "Unknown error";
    throw new Error(`Edge error from ${url}: ${msg}`);
  }
  return json;
}

async function kickAiJobRunner({ supabaseUrl, headers, jobId }) {
  const url = `${supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`;
  await postJson(url, { worker: true, queue: "agent", jobId }, headers).catch(() => {});
}

async function loadJob({ supabaseUrl, headers, jobId }) {
  const url = `${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=50`;
  const json = await getJson(url, headers);
  return json?.job || null;
}

async function main() {
  const jobId = String(process.argv[2] || "").trim();
  if (!jobId) throw new Error("BLOCKED: jobId arg is required");

  const root = process.cwd();
  loadLocalEnvFiles(root);
  loadLearnplayHeadingEnv();

  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const agentToken = requireEnv("AGENT_TOKEN");
  const organizationId = requireEnv("ORGANIZATION_ID");

  const headers = {
    "X-Agent-Token": agentToken,
    "X-Organization-Id": organizationId,
    Accept: "application/json",
  };

  const timeoutMs = 20 * 60 * 1000;
  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for job ${jobId}`);
    await kickAiJobRunner({ supabaseUrl, headers, jobId });
    const job = await loadJob({ supabaseUrl, headers, jobId });
    const status = String(job?.status || "").trim().toLowerCase();
    if (status === "done") {
      console.log(`[drive-single-agent-job] ✅ done ${jobId}`);
      return;
    }
    if (status === "failed") {
      throw new Error(`Job failed: ${String(job?.error || "Unknown error")}`);
    }
    await sleep(1500);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ drive-single-agent-job failed: ${msg}`);
  process.exit(1);
});


