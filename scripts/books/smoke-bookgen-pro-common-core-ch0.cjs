/**
 * Smoke: BookGen Pro on Common Core chapter 0 (real DB + real LLM).
 *
 * Mirrors the real-db/live E2E env-loading approach:
 * - Load KEY=VALUE env files (supabase/.deploy.env, learnplay.env, .env*)
 * - Then load heading-style learnplay.env via tests/helpers/parse-learnplay-env.cjs
 *
 * Output:
 * - Downloads the produced PDF + debug artifacts (skeleton.json, rewrites.json) to tmp/
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  // Force IPv4-first DNS for the worker by default (Windows IPv6 + Cloudflare can cause ECONNRESET).
  if (!process.env.BOOK_WORKER_DNS_RESULT_ORDER) process.env.BOOK_WORKER_DNS_RESULT_ORDER = "ipv4first";

  // Default to the requested Anthropic model unless overridden.
  const defaultAnthropicModel = "claude-haiku-4-5-20251001";
  const planModel = String(process.env.BOOKGEN_PLAN_MODEL || (planProvider === "anthropic" ? defaultAnthropicModel : "gpt-4o-mini")).trim();
  const rewriteModel = String(process.env.BOOKGEN_REWRITE_MODEL || (rewriteProvider === "anthropic" ? defaultAnthropicModel : "gpt-4o-mini")).trim();
  if (!planModel) throw new Error("BLOCKED: BOOKGEN_PLAN_MODEL resolved to empty");
  if (!rewriteModel) throw new Error("BLOCKED: BOOKGEN_REWRITE_MODEL resolved to empty");
  process.env.BOOKGEN_PLAN_MODEL = planModel;
  process.env.BOOKGEN_REWRITE_MODEL = rewriteModel;
  if (planProvider === "anthropic" || rewriteProvider === "anthropic") {
    // Align with other repo components that read ANTHROPIC_MODEL.
    if (!process.env.ANTHROPIC_MODEL) process.env.ANTHROPIC_MODEL = planModel;
  }

  // Hyphenation QA + fix passes (Claude Sonnet 4.5) - can be disabled via env.
  if (!process.env.BOOKGEN_HYPHEN_PASSES) process.env.BOOKGEN_HYPHEN_PASSES = "true";
  if (!process.env.BOOKGEN_HYPHEN_PROVIDER) process.env.BOOKGEN_HYPHEN_PROVIDER = "anthropic";
  if (!process.env.BOOKGEN_HYPHEN_CHECK_MODEL) process.env.BOOKGEN_HYPHEN_CHECK_MODEL = "claude-sonnet-4-5-20250929";
  if (!process.env.BOOKGEN_HYPHEN_FIX_MODEL) process.env.BOOKGEN_HYPHEN_FIX_MODEL = "claude-sonnet-4-5-20250929";

  // Required for bookgen_pro (per selected providers):
  if (planProvider === "openai" || rewriteProvider === "openai") requireEnv("OPENAI_API_KEY");
  if (planProvider === "anthropic" || rewriteProvider === "anthropic") requireEnv("ANTHROPIC_API_KEY");
  // Required for local Prince:
  requireEnv("PRINCE_PATH");

  const bookId = "mbo-aandf-common-core-basisboek-n3-focus-auto";
  const bookVersionId = "ce4554d92dec634f18c2c3a2976b2b0bf1d7034be4858f5738f6e55316915271";
  const chapterIndex = 0;

  const headers = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
    "x-agent-token": AGENT_TOKEN,
    "x-organization-id": ORGANIZATION_ID,
    Accept: "application/json",
  };

  const enqueueUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-enqueue-render`;
  const enqueue = await postJson(
    enqueueUrl,
    {
      bookId,
      bookVersionId,
      target: "chapter",
      chapterIndex,
      renderProvider: "prince_local",
      pipelineMode: "bookgen_pro",
      planProvider,
      rewriteProvider,
      planModel,
      rewriteModel,
      allowMissingImages: false,
    },
    headers,
  );

  const runId = String(enqueue?.runId || "").trim();
  const jobId = String(enqueue?.jobId || "").trim();
  if (!runId || !jobId) throw new Error("Enqueue did not return runId/jobId");

  console.log(`[OK] Enqueued BookGen Pro render: runId=${runId} jobId=${jobId} (${bookId} ch${chapterIndex})`);

  // Process jobs from the queue until our specific jobId is completed.
  await runWorkerUntilJob({ jobId, maxJobs: 25 });

  // Fetch artifacts for this run.
  const listUrl =
    `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-list` +
    `?scope=artifacts&runId=${encodeURIComponent(runId)}&limit=100&offset=0`;
  const list = await getJson(listUrl, headers);
  const artifacts = Array.isArray(list?.artifacts) ? list.artifacts : [];

  const pickBy = (kind, endsWith) =>
    artifacts.find((a) => a && a.kind === kind && typeof a.path === "string" && a.path.endsWith(endsWith));

  const pdf = artifacts.find((a) => a && a.kind === "pdf" && a.chapter_index === chapterIndex) ||
    artifacts.find((a) => a && a.kind === "pdf");
  const skeleton = pickBy("debug", "/skeleton.json");
  const rewrites = pickBy("debug", "/rewrites.json");

  if (!pdf?.id) {
    // Best-effort: show the job row error to speed up debugging (no secrets).
    const jobsUrl =
      `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-list` +
      `?scope=jobs&runId=${encodeURIComponent(runId)}&limit=100&offset=0`;
    try {
      const jobsList = await getJson(jobsUrl, headers);
      const jobs = Array.isArray(jobsList?.jobs) ? jobsList.jobs : [];
      const row = jobs.find((j) => j && String(j.id) === jobId) || null;
      if (row) {
        console.error("Job status:", {
          id: row.id,
          status: row.status,
          error: row.error,
          progress_stage: row.progress_stage,
          progress_message: row.progress_message,
          retry_count: row.retry_count,
          max_retries: row.max_retries,
        });
      }
    } catch {
      // ignore
    }
    throw new Error("No PDF artifact found for this run");
  }

  const outDir = path.join(root, "tmp");
  const outPdf = path.join(outDir, `render-bookgenpro.${bookId}.ch${chapterIndex}.pdf`);
  const outSkeleton = path.join(outDir, `render-bookgenpro.${bookId}.ch${chapterIndex}.skeleton.json`);
  const outRewrites = path.join(outDir, `render-bookgenpro.${bookId}.ch${chapterIndex}.rewrites.json`);

  async function downloadArtifact(artifact, outPath) {
    if (!artifact?.id) return null;
    const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/book-artifact-url`;
    // Rarely, the artifact row can be briefly invisible to the signer function right after job completion.
    // Retry a few times (bounded) to avoid flaky smoke runs.
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
  if (skeleton?.id) await downloadArtifact(skeleton, outSkeleton);
  if (rewrites?.id) await downloadArtifact(rewrites, outRewrites);

  console.log(`[OK] Downloaded PDF: ${path.relative(root, outPdf)}`);
  if (fs.existsSync(outSkeleton)) console.log(`[OK] Downloaded: ${path.relative(root, outSkeleton)}`);
  if (fs.existsSync(outRewrites)) console.log(`[OK] Downloaded: ${path.relative(root, outRewrites)}`);

  await openFileBestEffort(outPdf);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ Smoke failed: ${msg}`);
  process.exit(1);
});


