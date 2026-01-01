/**
 * Local helper: run the book worker once, loading env from local files.
 *
 * Why:
 * - `book-worker/worker.mjs` requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_TOKEN` at startup.
 * - Many repos store these in `learnplay.env` in a heading-style format (not KEY=VALUE).
 * - This script mirrors the real-db / live E2E approach:
 *   1) Load KEY=VALUE env files (supabase/.deploy.env, learnplay.env, .env*)
 *   2) Then load heading-style learnplay.env via the shared parser helper
 *
 * Usage:
 *   node scripts/books/run-book-worker-once.cjs
 *
 * Optional:
 *   BOOK_WORKER_RUN_ONCE=true|false (defaults to true here)
 */

const fs = require("node:fs");
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
    // ignore unreadable local env files; worker will fail loudly if required vars are missing
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

  // Normalize aliases used across the repo.
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
    // CJS helper (used by Jest) so we don't need TS tooling here.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadLearnPlayEnv } = require(path.join(process.cwd(), "tests", "helpers", "parse-learnplay-env.cjs"));
    if (typeof loadLearnPlayEnv === "function") loadLearnPlayEnv();
  } catch {
    // ignore if tests/ is not present; worker will fail loudly if required vars are missing
  }
}

function main() {
  const root = process.cwd();
  loadLocalEnvFiles(root);
  loadLearnplayHeadingEnv();

  if (!process.env.BOOK_WORKER_RUN_ONCE) process.env.BOOK_WORKER_RUN_ONCE = "true";

  const workerPath = path.join(root, "book-worker", "worker.mjs");
  const child = spawn(process.execPath, [workerPath], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(typeof code === "number" ? code : 1));
  child.on("error", () => process.exit(1));
}

main();


