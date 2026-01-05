/**
 * Drive the skeleton-first book generation pipeline for an entire book (all chapters),
 * without waiting for pg_cron to tick between yields.
 *
 * Usage:
 *   node scripts/books/drive-book-generate-full.mjs <rootChapterJobId>
 *
 * Env (required):
 * - SUPABASE_URL (or VITE_SUPABASE_URL)
 * - AGENT_TOKEN
 * - ORGANIZATION_ID
 *
 * Notes:
 * - Does NOT print any secret values.
 * - Uses ai-job-runner worker mode + get-job for orchestration.
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
    // ignore unreadable local env files
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

  // Normalize common aliases used across repo.
  if (process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}

function loadLearnplayHeadingEnv() {
  try {
    // Load heading-style learnplay.env (e.g. "service role key" on one line, value on next).
    // This helper never prints secret values.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
  // Best-effort: ai-job-runner returns processed:false if job isn't claimable.
  await postJson(url, { worker: true, queue: "agent", jobId }, headers).catch(() => {});
}

async function loadAgentJob({ supabaseUrl, headers, jobId }) {
  const url = `${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=50`;
  const json = await getJson(url, headers);
  return json?.job || null;
}

async function waitForAgentJobDone({ supabaseUrl, headers, jobId, timeoutMs }) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for job ${jobId} after ${Math.round(timeoutMs / 60000)} minutes`);
    }
    const job = await loadAgentJob({ supabaseUrl, headers, jobId });
    const status = String(job?.status || "").trim().toLowerCase();
    if (status === "done") return job;
    if (status === "failed") {
      const msg = typeof job?.error === "string" ? job.error : "Unknown error";
      throw new Error(`Job ${jobId} failed: ${msg}`);
    }
    await sleep(1500);
  }
}

async function driveChapter({ supabaseUrl, headers, chapterJobId, timeoutMs }) {
  const start = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out driving chapter job ${chapterJobId} after ${Math.round(timeoutMs / 60000)} minutes`);
    }

    const job = await loadAgentJob({ supabaseUrl, headers, jobId: chapterJobId });
    const status = String(job?.status || "").trim().toLowerCase();
    if (status === "done") return job;
    if (status === "failed") {
      const msg = typeof job?.error === "string" ? job.error : "Unknown error";
      throw new Error(`Chapter job failed (${chapterJobId}): ${msg}`);
    }

    const payload = job?.payload && typeof job.payload === "object" ? job.payload : {};
    const pendingSectionJobId =
      typeof payload?.pendingSectionJobId === "string" && payload.pendingSectionJobId.trim()
        ? payload.pendingSectionJobId.trim()
        : null;

    // If a section job is pending, run it to completion, then kick the chapter orchestrator once.
    if (pendingSectionJobId) {
      await kickAiJobRunner({ supabaseUrl, headers, jobId: pendingSectionJobId });
      await waitForAgentJobDone({
        supabaseUrl,
        headers,
        jobId: pendingSectionJobId,
        timeoutMs: 30 * 60 * 1000,
      });

      await kickAiJobRunner({ supabaseUrl, headers, jobId: chapterJobId });
      await sleep(1000);
      continue;
    }

    // Otherwise, drive the chapter orchestrator forward (it will enqueue the next section and yield).
    await kickAiJobRunner({ supabaseUrl, headers, jobId: chapterJobId });
    await sleep(1500);
  }
}

async function main() {
  const rootChapterJobId = String(process.argv[2] || "").trim();
  if (!rootChapterJobId) {
    throw new Error("BLOCKED: rootChapterJobId argument is required");
  }

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

  let currentJobId = rootChapterJobId;
  let chapterCounter = 0;
  const maxChapters = 60;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    chapterCounter++;
    if (chapterCounter > maxChapters) {
      throw new Error(`BLOCKED: Exceeded maxChapters=${maxChapters} while driving book generation`);
    }

    console.log(`[drive] Chapter job ${chapterCounter}: ${currentJobId}`);
    const finalJob = await driveChapter({
      supabaseUrl,
      headers,
      chapterJobId: currentJobId,
      timeoutMs: 2 * 60 * 60 * 1000,
    });

    const result = finalJob?.result && typeof finalJob.result === "object" ? finalJob.result : {};
    const done = result?.done === true;
    const nextChapterJobId =
      typeof result?.nextChapterJobId === "string" && result.nextChapterJobId.trim()
        ? result.nextChapterJobId.trim()
        : null;

    if (done) {
      console.log("[drive] ✅ Book generation complete (all chapters).");
      return;
    }
    if (!nextChapterJobId) {
      throw new Error("BLOCKED: Chapter completed but no nextChapterJobId and not marked done");
    }

    currentJobId = nextChapterJobId;
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ drive-book-generate-full failed: ${msg}`);
  process.exit(1);
});


