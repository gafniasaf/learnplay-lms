/**
 * Smoke: BookGen Pro on an arbitrary chapter (real DB + real LLM).
 *
 * - Enqueues a single `target=chapter` job.
 * - Runs the local worker until it completes that job.
 * - Downloads PDF/HTML/assembled.json + figure placement report for inspection.
 *
 * Env (required):
 * - BOOK_ID
 * - BOOK_VERSION_ID
 * - BOOK_CHAPTER_INDEX (0-based)
 *
 * Notes:
 * - This script does NOT print secret values or signed URLs.
 * - Placeholder-only mode can be enabled via BOOK_RENDER_PLACEHOLDERS_ONLY=true (recommended for Book Studio prep).
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

async function runWorkerUntilJob({ jobId, maxJobs = 50 } = {}) {
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

async function downloadToFile(signedUrl, outPath) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${path.basename(outPath)}`);
  const ab = await res.arrayBuffer();
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, Buffer.from(ab));
  return outPath;
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

  const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL")).replace(/\/$/, "");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");
  requireEnv("PRINCE_PATH"); // local Prince

  // Default to placeholder-only for Studio prep
  if (!process.env.BOOK_RENDER_PLACEHOLDERS_ONLY) process.env.BOOK_RENDER_PLACEHOLDERS_ONLY = "true";
  if (!process.env.BOOKGEN_HYPHEN_PASSES) process.env.BOOKGEN_HYPHEN_PASSES = "false";
  if (!process.env.BOOK_WORKER_DNS_RESULT_ORDER) process.env.BOOK_WORKER_DNS_RESULT_ORDER = "ipv4first";
  if (!process.env.POLL_INTERVAL_MS) process.env.POLL_INTERVAL_MS = "500";

  // Use Anthropic by default (fast + good enough for placement)
  if (!process.env.BOOKGEN_PLAN_PROVIDER) process.env.BOOKGEN_PLAN_PROVIDER = "anthropic";
  if (!process.env.BOOKGEN_REWRITE_PROVIDER) process.env.BOOKGEN_REWRITE_PROVIDER = "anthropic";
  if (!process.env.BOOKGEN_PLAN_MODEL) process.env.BOOKGEN_PLAN_MODEL = "claude-haiku-4-5-20251001";
  if (!process.env.BOOKGEN_REWRITE_MODEL) process.env.BOOKGEN_REWRITE_MODEL = "claude-haiku-4-5-20251001";

  if (process.env.BOOKGEN_PLAN_PROVIDER === "anthropic" || process.env.BOOKGEN_REWRITE_PROVIDER === "anthropic") {
    requireEnv("ANTHROPIC_API_KEY");
  }

  const bookId = requireEnv("BOOK_ID");
  const bookVersionId = requireEnv("BOOK_VERSION_ID");
  const chapterIndex = Number(requireEnv("BOOK_CHAPTER_INDEX"));
  if (!Number.isFinite(chapterIndex) || chapterIndex < 0) throw new Error("BLOCKED: BOOK_CHAPTER_INDEX must be a number >= 0");

  const headers = {
    "x-agent-token": AGENT_TOKEN,
    "x-organization-id": ORGANIZATION_ID,
    Accept: "application/json",
  };

  const enqueueUrl = `${SUPABASE_URL}/functions/v1/book-enqueue-render`;
  const enqueue = await postJson(
    enqueueUrl,
    {
      bookId,
      bookVersionId,
      target: "chapter",
      chapterIndex,
      renderProvider: "prince_local",
      pipelineMode: "bookgen_pro",
      planProvider: process.env.BOOKGEN_PLAN_PROVIDER,
      rewriteProvider: process.env.BOOKGEN_REWRITE_PROVIDER,
      planModel: process.env.BOOKGEN_PLAN_MODEL,
      rewriteModel: process.env.BOOKGEN_REWRITE_MODEL,
      allowMissingImages: false,
    },
    headers
  );

  const runId = String(enqueue?.runId || "").trim();
  const jobId = String(enqueue?.jobId || "").trim();
  if (!runId || !jobId) throw new Error("Enqueue did not return runId/jobId");

  console.log(`[OK] Enqueued BookGen Pro chapter: runId=${runId} jobId=${jobId} (bookId=${bookId} ch=${chapterIndex})`);

  await runWorkerUntilJob({ jobId, maxJobs: 50 });

  const listUrl =
    `${SUPABASE_URL}/functions/v1/book-list` +
    `?scope=artifacts&runId=${encodeURIComponent(runId)}&limit=200&offset=0`;
  const list = await getJson(listUrl, headers);
  const artifacts = Array.isArray(list?.artifacts) ? list.artifacts : [];

  const pdf = artifacts.find((a) => a && a.kind === "pdf") || null;
  const html = artifacts.find((a) => a && a.kind === "html") || null;
  const assembled = artifacts.find((a) => a && a.kind === "assembled") || null;
  const report = artifacts.find((a) => a && a.kind === "debug" && String(a.path || "").includes("figure-placeholders.report.json")) || null;

  if (!pdf?.id) throw new Error("No PDF artifact found for this run");

  const artifactUrl = `${SUPABASE_URL}/functions/v1/book-artifact-url`;
  const outDir = path.join(root, "tmp", "smoke-bookgen-pro-chapter", `run-${runId}`, `ch-${chapterIndex}`);
  await fsp.mkdir(outDir, { recursive: true });

  async function downloadArtifact(artifact, fileName) {
    if (!artifact?.id) return null;
    const url = await postJson(artifactUrl, { artifactId: artifact.id, expiresIn: 3600 }, headers);
    if (!url?.signedUrl) throw new Error("book-artifact-url did not return signedUrl");
    const outPath = path.join(outDir, fileName);
    await downloadToFile(url.signedUrl, outPath);
    return outPath;
  }

  const pdfPath = await downloadArtifact(pdf, "output.pdf");
  const htmlPath = await downloadArtifact(html, "render.html");
  const assembledPath = await downloadArtifact(assembled, "assembled.json");
  const reportPath = await downloadArtifact(report, "figure-placeholders.report.json");

  console.log(
    JSON.stringify(
      {
        outputs: { pdfPath, htmlPath, assembledPath, reportPath },
      },
      null,
      2
    )
  );

  if (pdfPath) await openFileBestEffort(pdfPath);
}

main().catch((e) => {
  console.error(`❌ Smoke failed: ${e.message}`);
  process.exit(1);
});


