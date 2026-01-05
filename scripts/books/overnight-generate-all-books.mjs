/**
 * Overnight: queue + drive skeleton-first generation for all ingested books.
 *
 * Goal:
 * - Ensure each target book has a root `book_generate_chapter` job (chapterIndex=0)
 * - Pump the ai-agent job queue continuously (like a local worker) so progress continues
 *   without relying on the 1/min pg_cron tick (which can trigger 45m wall-time failures).
 *
 * Usage:
 *   node scripts/books/overnight-generate-all-books.mjs
 *
 * Env (required):
 * - SUPABASE_URL (or VITE_SUPABASE_URL)
 * - AGENT_TOKEN
 * - ORGANIZATION_ID
 * - SUPABASE_SERVICE_ROLE_KEY (loaded from learnplay.env heading-style via parser)
 *
 * Notes:
 * - Does NOT print any secret values.
 * - Runs a single-worker pump loop (safe concurrency for LLM/provider limits).
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

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

  // Normalize common aliases.
  if (process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}

function loadLearnplayHeadingEnv() {
  try {
    // Loads heading-style learnplay.env (e.g. "service role key" line followed by the value).
    // This helper never prints secret values.
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

async function loadAgentJob({ supabaseUrl, headers, jobId }) {
  const url = `${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=10`;
  const json = await getJson(url, headers);
  return json?.job || null;
}

function isTerminalStatus(statusRaw) {
  const s = String(statusRaw || "").trim().toLowerCase();
  return s === "done" || s === "failed" || s === "dead_letter" || s === "stale";
}

async function pumpAgentQueueOnce({ supabaseUrl, headers, timeoutMs = 25 * 60 * 1000 } = {}) {
  const url = `${supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ worker: true, queue: "agent" }),
      signal: ac.signal,
    });
    const text = await res.text().catch(() => "");
    const json = text ? safeJsonParse(text) : null;
    if (!res.ok) {
      const msg = json?.error?.message || json?.error || `${res.status}`;
      throw new Error(`HTTP ${res.status} from ai-job-runner: ${msg}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const root = process.cwd();
  loadLocalEnvFiles(root);
  loadLearnplayHeadingEnv();

  const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const headers = {
    "X-Agent-Token": AGENT_TOKEN,
    "X-Organization-Id": ORG_ID,
    Accept: "application/json",
  };

  const targets = [
    { label: "MBO A&F 4", bookId: "a7d69d8e-90b0-4237-8cd3-fec76fe14ecb", bookVersionId: "bc57a1e0-fb49-45b1-b25f-4f7548a2b7df" },
    { label: "MBO Communicatie", bookId: "1ac0cf3d-c0e2-443d-8044-b7de5283e77f", bookVersionId: "39dcbbf2-0f7b-4a0c-8ac1-f45ed2265a39" },
    { label: "MBO Praktijkgestuurd klinisch redeneren", bookId: "22cfbb25-d7cc-4f01-a6c5-ff2a64d59fdc", bookVersionId: "6397b434-5bd8-478a-b7c0-9ef11ec8c934" },
    { label: "MBO Methodisch werken", bookId: "26b0fada-fa6c-4563-b328-2488c5a42d72", bookVersionId: "6988c4f3-c1cc-4568-802f-71bd33bb8781" },
    { label: "MBO Persoonlijke Verzorging", bookId: "bdf628e6-4965-4962-a595-afb8c057f3fc", bookVersionId: "d6b5a6fd-64f5-4028-bbcc-b486196d164c" },
    { label: "MBO Wetgeving", bookId: "b4ae4b77-9f9e-49db-949c-56e99e0e8314", bookVersionId: "78080c59-e5b9-42fc-8f8e-85d5486167cf" },
  ];

  // 1) Ensure each book has an active (queued/processing) BookGen chain. If not, enqueue chapter 1.
  for (const t of targets) {
    const label = `${t.label} (${t.bookId}/${t.bookVersionId})`;
    console.log(`\n[overnight] === Ensure queued: ${label} ===`);

    try {
      // 1) Load skeleton to compute chapterCount + meta (fail loudly if missing).
      const skeletonPath = `books/${t.bookId}/${t.bookVersionId}/skeleton.json`;
      const { data: skData, error: skErr } = await admin.storage.from("books").download(skeletonPath);
      if (skErr) throw new Error(`Skeleton not found at ${skeletonPath}: ${skErr.message}`);
      const skeleton = JSON.parse(await skData.text());
      const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters : [];
      const chapterCount = chapters.length;
      if (!Number.isFinite(chapterCount) || chapterCount < 1 || chapterCount > 50) {
        throw new Error(`BLOCKED: invalid chapterCount=${chapterCount} from skeleton`);
      }

      const meta = skeleton?.meta && typeof skeleton.meta === "object" ? skeleton.meta : {};
      const topic = typeof meta?.title === "string" && meta.title.trim() ? meta.title.trim() : t.label;
      const level = typeof meta?.level === "string" && meta.level.trim() ? meta.level.trim() : "n4";
      const language = typeof meta?.language === "string" && meta.language.trim() ? meta.language.trim() : "nl";

      // 2) If there is already active queued/processing work for this book, don't enqueue duplicates.
      try {
        const { data: active, error: activeErr } = await admin
          .from("ai_agent_jobs")
          .select("id,job_type,status,created_at")
          .eq("organization_id", ORG_ID)
          .in("job_type", ["book_generate_chapter", "book_generate_section"])
          .in("status", ["queued", "processing"])
          .contains("payload", { bookId: t.bookId, bookVersionId: t.bookVersionId })
          .order("created_at", { ascending: false })
          .limit(1);
        if (activeErr) throw activeErr;
        if (Array.isArray(active) && active[0]?.id) {
          console.log(`[overnight] Active: ${active[0].job_type} ${active[0].id} (status=${active[0].status})`);
          continue;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to query existing jobs: ${msg}`);
      }

      // 3) Enqueue root generation job (chapter 1).
      console.log(`[overnight] Enqueuing root generation job (chapter 1/${chapterCount})…`);
      const res = await postJson(
        `${SUPABASE_URL}/functions/v1/enqueue-job`,
        {
          jobType: "book_generate_chapter",
          payload: {
            organization_id: ORG_ID,
            bookId: t.bookId,
            bookVersionId: t.bookVersionId,
            chapterIndex: 0,
            chapterCount,
            topic,
            level,
            language,
            layoutProfile: "pass2",
            microheadingDensity: "medium",
            imagePromptLanguage: "book",
            writeModel: "anthropic:claude-sonnet-4-5",
            userInstructions:
              "Schrijf in vriendelijk, leerlinggericht Nederlands (zoals het referentieboek). " +
              "Gebruik vaak 'je'. " +
              "Leg begrippen stap voor stap uit met zinnen als: 'Dit betekent dat...' en 'Hierbij kun je bijvoorbeeld denken aan...'. " +
              "Vermijd een te academische toon en introduceer afkortingen pas als ze logisch zijn. " +
              "Houd de tekst vlot en begrijpelijk, met duidelijke verbanden ('Hierdoor...', 'Doordat...', 'Op dezelfde manier...'). " +
              "Zorg dat 'In de praktijk' en 'Verdieping' kaders concreet en relevant zijn waar de outline dat vraagt.",
          },
        },
        headers,
      );
      const rootJobId = String(res?.jobId || "").trim();
      if (!rootJobId) throw new Error("Enqueue did not return jobId");
      console.log(`[overnight] Enqueued root job: ${rootJobId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[overnight] ❌ Failed to ensure queued for ${label}: ${msg}`);
    }
  }

  // 2) Pump the queue continuously.
  console.log("\n[overnight] ▶ Starting ai-agent queue pump (Ctrl+C to stop)…");
  let processedCount = 0;
  let idleCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const out = await pumpAgentQueueOnce({ supabaseUrl: SUPABASE_URL, headers, timeoutMs: 30 * 60 * 1000 });
      const processed = out?.processed === true;
      if (!processed) {
        idleCount++;
        if (idleCount % 6 === 1) {
          console.log("[overnight] (idle) No pending agent jobs right now; sleeping…");
        }
        await sleep(10_000);
        continue;
      }

      idleCount = 0;
      processedCount++;
      const jobId = String(out?.jobId || "").trim();
      const jobType = String(out?.jobType || "").trim();
      const status = String(out?.status || "").trim();
      const yielded = out?.yielded === true;
      if (processedCount % 10 === 0 || yielded) {
        console.log(`[overnight] processed=${processedCount} last=${jobType || "job"} ${jobId ? jobId : ""} status=${status || "?"}${yielded ? " (yield)" : ""}`);
      }

      // Small pause to avoid hammering if the queue is very fast.
      await sleep(250);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[overnight] pump error: ${msg}`);
      await sleep(5_000);
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[overnight] Fatal: ${msg}`);
  process.exit(1);
});


