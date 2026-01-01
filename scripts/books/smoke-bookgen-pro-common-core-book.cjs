/**
 * Smoke: BookGen Pro on Common Core (FULL BOOK) (real DB + real LLM).
 *
 * This enqueues a single `target=book` job and runs the local worker until it is completed.
 * NOTE: This may take a long time because BookGen Pro rewrites many units across all chapters.
 *
 * Mirrors the real-db/live E2E env-loading approach:
 * - Load KEY=VALUE env files (supabase/.deploy.env, learnplay.env, .env*)
 * - Then load heading-style learnplay.env via tests/helpers/parse-learnplay-env.cjs
 *
 * Output:
 * - Downloads the produced PDF to tmp/
 * - Attempts to open the PDF locally (best-effort).
 *
 * IMPORTANT: This script never prints secret values or signed URLs.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

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
  if (process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_PUBLISHABLE_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
    process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY;
  }
  if (process.env.VITE_SUPABASE_PUBLISHABLE_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
    process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}

function loadLearnplayHeadingEnv() {
  try {
    // CJS helper (used by Jest) so we don't need TS tooling.
    const { loadLearnPlayEnv } = require(path.join(process.cwd(), "tests", "helpers", "parse-learnplay-env.cjs"));
    if (typeof loadLearnPlayEnv === "function") loadLearnPlayEnv();
  } catch {
    // ignore
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env before running this smoke test`);
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

async function downloadToFile(signedUrl, outPath) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${path.basename(outPath)}`);
  const ab = await res.arrayBuffer();
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, Buffer.from(ab));
  return outPath;
}

async function runWorkerUntilJob({ jobId, maxJobs = 25 } = {}) {
  const workerPath = path.join(process.cwd(), "book-worker", "worker.mjs");
  const env = {
    ...process.env,
    BOOK_WORKER_STOP_AFTER_JOB_ID: jobId ? String(jobId) : "",
    BOOK_WORKER_MAX_JOBS: String(maxJobs),
  };
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], { stdio: "inherit", env });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`book-worker exited with code ${code}`));
    });
  });
}

async function openFileBestEffort(filePath) {
  if (process.platform !== "win32") return;
  await new Promise((resolve) => {
    const ps = [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Start-Process -FilePath '${String(filePath).replace(/'/g, "''")}'`,
    ];
    const child = spawn("powershell", ps, { stdio: "ignore" });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

async function main() {
  const root = process.cwd();
  loadLocalEnvFiles(root);
  loadLearnplayHeadingEnv();

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
  const SUPABASE_ANON_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    requireEnv("SUPABASE_ANON_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const workerMode = String(process.env.BOOK_SMOKE_WORKER_MODE || "local").trim().toLowerCase();
  if (!["local", "none"].includes(workerMode)) {
    throw new Error("BLOCKED: BOOK_SMOKE_WORKER_MODE must be local or none");
  }

  const planProvider = String(process.env.BOOKGEN_PLAN_PROVIDER || "anthropic").trim().toLowerCase();
  const rewriteProvider = String(process.env.BOOKGEN_REWRITE_PROVIDER || "anthropic").trim().toLowerCase();
  if (!["openai", "anthropic"].includes(planProvider)) {
    throw new Error("BLOCKED: BOOKGEN_PLAN_PROVIDER must be openai or anthropic");
  }
  if (!["openai", "anthropic"].includes(rewriteProvider)) {
    throw new Error("BLOCKED: BOOKGEN_REWRITE_PROVIDER must be openai or anthropic");
  }

  // Propagate provider choices to the spawned worker (it will use these when job payload doesn't include them).
  process.env.BOOKGEN_PLAN_PROVIDER = planProvider;
  process.env.BOOKGEN_REWRITE_PROVIDER = rewriteProvider;

  if (workerMode === "local") {
    // Force IPv4-first DNS for the worker by default (Windows IPv6 + Cloudflare can cause ECONNRESET).
    if (!process.env.BOOK_WORKER_DNS_RESULT_ORDER) process.env.BOOK_WORKER_DNS_RESULT_ORDER = "ipv4first";
    // Poll faster so our local worker claims the newly enqueued job before any other worker.
    if (!process.env.POLL_INTERVAL_MS) process.env.POLL_INTERVAL_MS = "500";
  }

  // Default to the requested Anthropic model unless overridden.
  const defaultAnthropicModel = "claude-haiku-4-5-20251001";
  const planModel = String(process.env.BOOKGEN_PLAN_MODEL || (planProvider === "anthropic" ? defaultAnthropicModel : "gpt-4o-mini")).trim();
  const rewriteModel = String(process.env.BOOKGEN_REWRITE_MODEL || (rewriteProvider === "anthropic" ? defaultAnthropicModel : "gpt-4o-mini")).trim();
  if (!planModel) throw new Error("BLOCKED: BOOKGEN_PLAN_MODEL resolved to empty");
  if (!rewriteModel) throw new Error("BLOCKED: BOOKGEN_REWRITE_MODEL resolved to empty");
  process.env.BOOKGEN_PLAN_MODEL = planModel;
  process.env.BOOKGEN_REWRITE_MODEL = rewriteModel;
  if (planProvider === "anthropic" || rewriteProvider === "anthropic") {
    if (!process.env.ANTHROPIC_MODEL) process.env.ANTHROPIC_MODEL = planModel;
  }

  // Hyphenation QA + fix passes (Claude Sonnet 4.5) - can be disabled via env.
  if (!process.env.BOOKGEN_HYPHEN_PASSES) process.env.BOOKGEN_HYPHEN_PASSES = "true";
  if (!process.env.BOOKGEN_HYPHEN_PROVIDER) process.env.BOOKGEN_HYPHEN_PROVIDER = "anthropic";
  if (!process.env.BOOKGEN_HYPHEN_CHECK_MODEL) process.env.BOOKGEN_HYPHEN_CHECK_MODEL = "claude-sonnet-4-5-20250929";
  if (!process.env.BOOKGEN_HYPHEN_FIX_MODEL) process.env.BOOKGEN_HYPHEN_FIX_MODEL = "claude-sonnet-4-5-20250929";

  // If we are running the worker locally, require all runtime deps in THIS environment.
  if (workerMode === "local") {
    // Required for bookgen_pro (per selected providers):
    if (planProvider === "openai" || rewriteProvider === "openai") requireEnv("OPENAI_API_KEY");
    if (planProvider === "anthropic" || rewriteProvider === "anthropic") requireEnv("ANTHROPIC_API_KEY");
  }

  const bookId = String(process.env.BOOK_ID || "mbo-aandf-common-core-basisboek-n3-focus-auto").trim();
  const bookVersionId = String(
    process.env.BOOK_VERSION_ID || "ce4554d92dec634f18c2c3a2976b2b0bf1d7034be4858f5738f6e55316915271",
  ).trim();
  if (!bookId) throw new Error("BLOCKED: BOOK_ID resolved to empty");
  if (!bookVersionId) throw new Error("BLOCKED: BOOK_VERSION_ID resolved to empty");

  const renderProvider = String(process.env.BOOK_RENDER_PROVIDER || "prince_local").trim();
  if (!["prince_local", "docraptor_api"].includes(renderProvider)) {
    throw new Error("BLOCKED: BOOK_RENDER_PROVIDER must be prince_local or docraptor_api");
  }
  // Provider-specific runtime deps (only if we're running the worker locally).
  if (workerMode === "local") {
    if (renderProvider === "prince_local") requireEnv("PRINCE_PATH");
    if (renderProvider === "docraptor_api") requireEnv("DOCRAPTOR_API_KEY");
  }

  const headers = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
    "x-agent-token": AGENT_TOKEN,
    "x-organization-id": ORGANIZATION_ID,
    Accept: "application/json",
  };

  const presetRunId = String(process.env.BOOK_SMOKE_RUN_ID || "").trim();
  const presetJobId = String(process.env.BOOK_SMOKE_JOB_ID || "").trim();
  const usePreset = !!(presetRunId && presetJobId);
  if ((presetRunId && !presetJobId) || (!presetRunId && presetJobId)) {
    throw new Error("BLOCKED: BOOK_SMOKE_RUN_ID and BOOK_SMOKE_JOB_ID must be set together");
  }

  let runId = "";
  let jobId = "";
  if (usePreset) {
    runId = presetRunId;
    jobId = presetJobId;
    console.log(`[OK] Using existing run/job: runId=${runId} jobId=${jobId}`);
  } else {
    const enqueueUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-enqueue-render`;
    const enqueue = await postJson(
      enqueueUrl,
      {
        bookId,
        bookVersionId,
        target: "book",
        renderProvider,
        pipelineMode: "bookgen_pro",
        planProvider,
        rewriteProvider,
        planModel,
        rewriteModel,
        allowMissingImages: false,
      },
      headers,
    );

    runId = String(enqueue?.runId || "").trim();
    jobId = String(enqueue?.jobId || "").trim();
    if (!runId || !jobId) throw new Error("Enqueue did not return runId/jobId");

    console.log(`[OK] Enqueued BookGen Pro render: runId=${runId} jobId=${jobId} (${bookId} FULL BOOK)`);
  }

  async function waitForJob({ jobId, runId, maxWaitMs = 6 * 60 * 60 * 1000, pollMs = 3000 }) {
    const started = Date.now();
    const jobsUrl =
      `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-list` +
      `?scope=jobs&runId=${encodeURIComponent(runId)}&limit=50&offset=0`;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() - started > maxWaitMs) {
        throw new Error(`Timed out waiting for job ${jobId} after ${Math.round(maxWaitMs / 60000)} minutes`);
      }
      const list = await getJson(jobsUrl, headers);
      const jobs = Array.isArray(list?.jobs) ? list.jobs : [];
      const row = jobs.find((j) => String(j?.id || "") === String(jobId)) || null;
      const status = String(row?.status || "").trim().toLowerCase();
      if (status === "completed") return row;
      if (status === "failed") {
        const err = row?.error ? String(row.error) : "Unknown error";
        throw new Error(`Job failed: ${err}`);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  if (workerMode === "local") {
    await runWorkerUntilJob({ jobId, maxJobs: 25 });
  } else {
    console.log("[OK] BOOK_SMOKE_WORKER_MODE=none (not spawning local worker); waiting for external worker to complete…");
    await waitForJob({ jobId, runId });
  }

  // Fetch artifacts for this run.
  const listUrl =
    `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-list` +
    `?scope=artifacts&runId=${encodeURIComponent(runId)}&limit=200&offset=0`;
  const list = await getJson(listUrl, headers);
  const artifacts = Array.isArray(list?.artifacts) ? list.artifacts : [];
  const pdf = artifacts.find((a) => a && a.kind === "pdf") || null;

  if (!pdf?.id) throw new Error("No PDF artifact found for this run");

  const outDir = path.join(root, "tmp");
  const outPdf = path.join(outDir, `render-bookgenpro.${bookId}.book.pdf`);

  async function downloadArtifact(artifact, outPath) {
    if (!artifact?.id) return null;
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-artifact-url`;
    // Retry a few times (bounded) to avoid flaky runs.
    let resp;
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        resp = await postJson(url, { artifactId: artifact.id, expiresIn: 3600 }, headers);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isNotFound = /artifact not found/i.test(msg);
        if (!isNotFound || attempt === maxAttempts) throw e;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    const signedUrl = String(resp?.signedUrl || "");
    if (!signedUrl) throw new Error("Missing signedUrl for artifact");
    await downloadToFile(signedUrl, outPath);
    return outPath;
  }

  await downloadArtifact(pdf, outPdf);
  console.log(`[OK] Downloaded PDF: ${path.relative(root, outPdf)}`);
  await openFileBestEffort(outPdf);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ Smoke failed: ${msg}`);
  process.exit(1);
});


