/**
 * Compare: PASS2 baseline Chapter 1 (De cel) vs generated Chapter 1 (same outline).
 *
 * What it does:
 * - Renders the PASS2 baseline canonical Chapter 1 via our renderer + local Prince (baseline PDF/PNGs)
 * - Creates a new BookGen Pro book/version
 * - Seeds a skeleton outline that matches the PASS2 hierarchy (chapter/sections/subparagraphs)
 * - Runs the chapter generation job (ai_agent_jobs) and renders generated Chapter 1 via our renderer + Prince
 * - Saves all artifacts under tmp/compare-pass2-baseline-ch1/<runId>/
 *
 * Env (required):
 * - SUPABASE_URL or VITE_SUPABASE_URL
 * - AGENT_TOKEN
 * - ORGANIZATION_ID
 * - PRINCE_PATH (full path to prince.exe)
 * - OPENAI_API_KEY or ANTHROPIC_API_KEY (for the Edge LLM call), or E2E_BOOK_WRITE_MODEL
 *
 * Notes:
 * - Does NOT print secret values or signed URLs.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { renderBookHtml } from "../../src/lib/books/bookRendererCore.js";

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

function requireSupabaseUrl() {
  const vite = process.env.VITE_SUPABASE_URL;
  if (typeof vite === "string" && vite.trim()) return vite.trim().replace(/\/$/, "");

  const plain = process.env.SUPABASE_URL;
  if (typeof plain === "string" && plain.trim()) return plain.trim().replace(/\/$/, "");

  throw new Error("BLOCKED: VITE_SUPABASE_URL (or SUPABASE_URL) is required");
}

function requireWriteModelSpec() {
  const explicit = process.env.E2E_BOOK_WRITE_MODEL;
  if (explicit && explicit.trim()) {
    const s = explicit.trim();
    const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) {
      throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL must be 'openai:<model>' or 'anthropic:<model>'");
    }
    const provider = parts[0];
    if (provider !== "openai" && provider !== "anthropic") {
      throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL provider must be 'openai' or 'anthropic'");
    }
    const model = parts.slice(1).join(":").trim();
    if (!model) throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL model is missing");
    return `${provider}:${model}`;
  }

  // Default choice (model selection is not a secret; provider keys must exist in the deployed Edge env).
  // If the provider key is missing server-side, the job will FAIL LOUD with a BLOCKED error.
  return "anthropic:claude-sonnet-4-5";
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeWs(s) {
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMBERED_SUB_RE = /^\d+(?:\.\d+){2,}\s+/;

function extractNumberedSubparagraphTitles(sectionContent) {
  const blocks = Array.isArray(sectionContent) ? sectionContent : [];
  const out = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (String(b.type || "") !== "subparagraph") continue;
    const title = typeof b.title === "string" ? normalizeWs(b.title) : "";
    if (!title) continue;
    if (!NUMBERED_SUB_RE.test(title)) continue;
    out.push(title);
  }
  return out;
}

function extractChapterOutlineNumbers(canonical) {
  const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
  const ch0 = chapters[0];
  const sectionsIn = Array.isArray(ch0?.sections) ? ch0.sections : [];
  return {
    chapterTitle: typeof ch0?.title === "string" ? normalizeWs(ch0.title) : "",
    sections: sectionsIn.map((s) => ({
      id: typeof s?.id === "string" ? normalizeWs(s.id) : "",
      title: typeof s?.title === "string" ? normalizeWs(s.title) : "",
      numberedSubparagraphTitles: extractNumberedSubparagraphTitles(s?.content || s?.blocks),
    })),
  };
}

function assertOutlineNumbersMatch(opts) {
  const { baselineCanonical, generatedCanonical } = opts;
  const base = extractChapterOutlineNumbers(baselineCanonical);
  const gen = extractChapterOutlineNumbers(generatedCanonical);

  if (base.sections.length !== gen.sections.length) {
    throw new Error(`Outline mismatch: section count differs (baseline=${base.sections.length}, generated=${gen.sections.length})`);
  }

  for (let i = 0; i < base.sections.length; i++) {
    const b = base.sections[i];
    const g = gen.sections[i];
    if (b.id && g.id && b.id !== g.id) {
      throw new Error(`Outline mismatch: section id differs at index ${i} (baseline='${b.id}', generated='${g.id}')`);
    }
    // Compare numbered subparagraph titles (numbers + labels) exactly.
    const bt = b.numberedSubparagraphTitles;
    const gt = g.numberedSubparagraphTitles;
    if (bt.length !== gt.length) {
      throw new Error(`Outline mismatch: subparagraph count differs for section '${b.id || b.title || i}' (baseline=${bt.length}, generated=${gt.length})`);
    }
    for (let j = 0; j < bt.length; j++) {
      if (bt[j] !== gt[j]) {
        throw new Error(
          `Outline mismatch: subparagraph differs at section '${b.id || i}' index ${j} (baseline='${bt[j]}', generated='${gt[j]}')`,
        );
      }
    }
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForAgentJobDone({ supabaseUrl, headers, jobId, timeoutMs }) {
  const start = Date.now();
  let lastStatus = "";
  let lastErr = "";

  while (Date.now() - start < timeoutMs) {
    const jobJson = await getJson(
      `${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=200`,
      headers,
    );
    const status = String(jobJson?.job?.status || "").toLowerCase();
    lastStatus = status;
    lastErr = String(jobJson?.job?.error || "");
    if (status === "done") return jobJson;
    if (status === "failed" || status === "dead_letter" || status === "stale") {
      throw new Error(`Job ${jobId} failed (status=${status}): ${lastErr || "unknown error"}`);
    }
    await sleep(6_000);
  }

  throw new Error(`Timed out waiting for job ${jobId} to complete (lastStatus=${lastStatus}): ${lastErr}`);
}

async function kickAiJobRunner({ supabaseUrl, headers, jobId }) {
  const url = `${supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`;
  try {
    await postJson(url, { worker: true, queue: "agent", jobId }, headers);
    return { ok: true, timedOut: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Supabase Edge gateway timeouts can occur for long-running LLM calls. The function may still
    // continue running server-side, so treat 504 as a non-fatal "kick timed out" and then rely on polling.
    if (msg.includes("HTTP 504")) {
      return { ok: false, timedOut: true };
    }
    throw e;
  }
}

async function driveBookGenerateChapterOrchestrator(opts) {
  const { supabaseUrl, headers, chapterJobId, timeoutMs } = opts;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const jobJson = await getJson(
      `${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(chapterJobId)}&eventsLimit=200`,
      headers,
    );
    const status = String(jobJson?.job?.status || "").toLowerCase();
    if (status === "done") return jobJson;
    if (status === "failed" || status === "dead_letter" || status === "stale") {
      const err = String(jobJson?.job?.error || "");
      throw new Error(`Chapter job ${chapterJobId} failed (status=${status}): ${err || "unknown error"}`);
    }

    const pendingSectionJobIdRaw = jobJson?.job?.payload?.pendingSectionJobId;
    const pendingSectionJobId =
      typeof pendingSectionJobIdRaw === "string" ? pendingSectionJobIdRaw.trim() : "";

    // If a section job is pending, run it to completion, then kick the chapter orchestrator once.
    if (pendingSectionJobId) {
      await kickAiJobRunner({ supabaseUrl, headers, jobId: pendingSectionJobId });
      await waitForAgentJobDone({ supabaseUrl, headers, jobId: pendingSectionJobId, timeoutMs: 20 * 60 * 1000 });

      await kickAiJobRunner({ supabaseUrl, headers, jobId: chapterJobId });
      await sleep(1_000);
      continue;
    }

    // Otherwise, drive the chapter orchestrator forward (it will enqueue the next section and yield).
    await kickAiJobRunner({ supabaseUrl, headers, jobId: chapterJobId });
    await sleep(1_500);
  }

  throw new Error(`Timed out driving chapter orchestrator ${chapterJobId}`);
}

async function runPrince(args, { logPath }) {
  const princeCmd = requireEnv("PRINCE_PATH");
  await new Promise((resolve, reject) => {
    const child = spawn(princeCmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => reject(e));
    child.on("close", async (code) => {
      const combined = [out, err].filter(Boolean).join("\n");
      await fsp.mkdir(path.dirname(logPath), { recursive: true });
      await fsp.writeFile(logPath, combined || "(no prince output)\n");
      if (code === 0) return resolve();
      reject(new Error(`Prince failed (exit ${code}). See log: ${logPath}`));
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

async function ensureBaselineCanonical(root) {
  const p = path.join(root, "tmp", "baseline-pass2", "af-pass2.chapter1.canonical.json");
  if (fs.existsSync(p)) return p;

  await fsp.mkdir(path.dirname(p), { recursive: true });
  await new Promise((resolve, reject) => {
    const args = [
      path.join(root, "scripts", "books", "extract-pass2-canonical.mjs"),
      "--in",
      "canonical_book_PASS2.assembled_prince.html",
      "--chapter",
      "0",
      "--level",
      "n4",
      "--include-images",
      "true",
      "--bookId",
      "af-pass2-baseline",
      "--out",
      path.relative(root, p),
    ];
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`extract-pass2-canonical failed (exit ${code})`));
    });
  });

  if (!fs.existsSync(p)) throw new Error(`Baseline canonical did not get created at ${p}`);
  return p;
}

async function main() {
  const root = process.cwd();
  loadLocalEnvFiles(root);

  const supabaseUrl = requireSupabaseUrl();
  const agentToken = requireEnv("AGENT_TOKEN");
  const organizationId = requireEnv("ORGANIZATION_ID");
  requireEnv("PRINCE_PATH");
  const writeModel = requireWriteModelSpec();

  const headers = {
    "X-Agent-Token": agentToken,
    "X-Organization-Id": organizationId,
    Accept: "application/json",
  };

  const runId = `run-${Date.now()}`;
  const outDir = path.join(root, "tmp", "compare-pass2-baseline-ch1", runId);
  await fsp.mkdir(outDir, { recursive: true });

  // --- 1) Baseline render (PASS2 canonical -> our renderer -> Prince) ---
  const baselineCanonicalPath = await ensureBaselineCanonical(root);
  const baselineCanonical = JSON.parse(await fsp.readFile(baselineCanonicalPath, "utf8"));
  const baselineHtml = renderBookHtml(baselineCanonical, { target: "chapter", chapterIndex: 0, placeholdersOnly: true });

  const baselineHtmlPath = path.join(outDir, "baseline.chapter1.html");
  const baselinePdfPath = path.join(outDir, "baseline.chapter1.pdf");
  const baselinePdfLog = path.join(outDir, "baseline.prince-pdf.log");
  const baselinePngLog = path.join(outDir, "baseline.prince-png.log");
  await fsp.writeFile(baselineHtmlPath, baselineHtml, "utf8");

  await runPrince([baselineHtmlPath, "-o", baselinePdfPath], { logPath: baselinePdfLog });
  await runPrince(
    [
      "--raster-output=" + path.join(outDir, "baseline.chapter1-%d.png"),
      "--raster-format=png",
      "--raster-pages=all",
      "--raster-dpi=110",
      baselineHtmlPath,
    ],
    { logPath: baselinePngLog },
  );

  // --- 2) Generate a new Chapter 1 using the same outline hierarchy ---
  const bookId = `compare-af-baseline-${Date.now()}`;
  const enqueue = await postJson(
    `${supabaseUrl}/functions/v1/enqueue-job`,
    {
      jobType: "book_generate_full",
      payload: {
        mode: "create",
        bookId,
        title: "Compare A&F PASS2 baseline (Ch1)",
        level: "n4",
        language: "nl",
        chapterCount: 1,
        enqueueChapters: false,
        topic: "Anatomie & Fysiologie — basis (hoofdstuk: De cel).",
        userInstructions:
          "Volg exact de outline in de bestaande skeleton. " +
          "Schrijf PASS2-vol (niet te kort): per genummerde subparagraaf minimaal 2 basisparagrafen (2-4 zinnen). " +
          "Voeg praktijk- en verdiepingblokken toe op de aangewezen plekken. Maak ze concreet (geen generieke vulling). " +
          "Start elke praktijk/verdieping met <span class=\"box-lead\">...</span> (geen 'LEAD'). " +
          "Microheadings: korte labels zonder leestekens (bijv. 1-6 woorden), geen dubbele microheadings achter elkaar. " +
          "Voeg 2-4 afbeelding-suggesties toe (images[].suggestedPrompt).",
        imagePromptLanguage: "book",
        layoutProfile: "pass2",
        microheadingDensity: "medium",
        sectionMaxTokens: 8000,
        writeModel,
      },
    },
    headers,
  );

  const rootJobId = String(enqueue?.jobId || "").trim();
  if (!rootJobId) throw new Error("enqueue-job did not return jobId");

  // Process immediately (avoid waiting for cron) and then poll until done.
  await kickAiJobRunner({ supabaseUrl, headers, jobId: rootJobId });
  const rootFinal = await waitForAgentJobDone({ supabaseUrl, headers, jobId: rootJobId, timeoutMs: 5 * 60 * 1000 });
  const bookVersionId = String(rootFinal?.job?.result?.bookVersionId || "").trim();
  if (!bookVersionId) throw new Error("Root job did not return bookVersionId");

  // Seed outline skeleton (chapter/sections/subparagraph titles) BEFORE running chapter job.
  const outlinePath = path.join(root, "scripts", "books", "fixtures", "af-pass2-ch1-outline.skeleton.json");
  const outlineRaw = JSON.parse(await fsp.readFile(outlinePath, "utf8"));
  outlineRaw.meta.bookId = bookId;
  outlineRaw.meta.bookVersionId = bookVersionId;

  await postJson(
    `${supabaseUrl}/functions/v1/book-version-save-skeleton`,
    { bookId, bookVersionId, skeleton: outlineRaw, note: "Seed PASS2 outline (Ch1 De cel)", compileCanonical: true },
    headers,
  );

  // Enqueue the chapter job ONLY AFTER the outline is saved (prevents cron/worker races).
  const enqueueCh = await postJson(
    `${supabaseUrl}/functions/v1/enqueue-job`,
    {
      jobType: "book_generate_chapter",
      payload: {
        organization_id: organizationId,
        bookId,
        bookVersionId,
        chapterIndex: 0,
        chapterCount: 1,
        topic: "Anatomie & Fysiologie — basis (hoofdstuk: De cel).",
        level: "n4",
        language: "nl",
        userInstructions:
          "Volg exact de outline in de bestaande skeleton. " +
          "Schrijf PASS2-vol (niet te kort): per genummerde subparagraaf minimaal 2 basisparagrafen (2-4 zinnen). " +
          "Voeg praktijk- en verdiepingblokken toe op de aangewezen plekken. Maak ze concreet (geen generieke vulling). " +
          "Start elke praktijk/verdieping met <span class=\"box-lead\">...</span> (geen 'LEAD'). " +
          "Microheadings: korte labels zonder leestekens (bijv. 1-6 woorden), geen dubbele microheadings achter elkaar. " +
          "Voeg 2-4 afbeelding-suggesties toe (images[].suggestedPrompt).",
        imagePromptLanguage: "book",
        layoutProfile: "pass2",
        microheadingDensity: "medium",
        sectionMaxTokens: 8000,
        writeModel,
      },
    },
    headers,
  );
  const chapterJobId = String(enqueueCh?.jobId || "").trim();
  if (!chapterJobId) throw new Error("enqueue-job did not return chapter jobId");

  // Drive the orchestrated chapter job (it enqueues section subjobs and yields until complete).
  await driveBookGenerateChapterOrchestrator({ supabaseUrl, headers, chapterJobId, timeoutMs: 30 * 60 * 1000 });

  // Download compiled canonical and render to HTML/PDF
  const inputs = await postJson(
    `${supabaseUrl}/functions/v1/book-version-input-urls`,
    { bookId, bookVersionId, expiresIn: 3600, target: "chapter", chapterIndex: 0, allowMissingImages: true, includeChapterOpeners: true },
    headers,
  );

  const compiledUrl = String(inputs?.urls?.compiledCanonical?.signedUrl || "").trim();
  if (!compiledUrl) throw new Error("book-version-input-urls did not return compiledCanonical signedUrl");

  // Do NOT log the signedUrl.
  const canonRes = await fetch(compiledUrl);
  if (!canonRes.ok) throw new Error(`Failed to download compiled canonical (${canonRes.status})`);
  const generatedCanonical = await canonRes.json();

  // Contract: numbering in generated output MUST match the reference (baseline PASS2) exactly.
  assertOutlineNumbersMatch({ baselineCanonical, generatedCanonical });

  const generatedHtml = renderBookHtml(generatedCanonical, { target: "chapter", chapterIndex: 0, placeholdersOnly: true });
  const genHtmlPath = path.join(outDir, "generated.chapter1.html");
  const genPdfPath = path.join(outDir, "generated.chapter1.pdf");
  const genPdfLog = path.join(outDir, "generated.prince-pdf.log");
  const genPngLog = path.join(outDir, "generated.prince-png.log");
  await fsp.writeFile(genHtmlPath, generatedHtml, "utf8");

  await runPrince([genHtmlPath, "-o", genPdfPath], { logPath: genPdfLog });
  await runPrince(
    [
      "--raster-output=" + path.join(outDir, "generated.chapter1-%d.png"),
      "--raster-format=png",
      "--raster-pages=all",
      "--raster-dpi=110",
      genHtmlPath,
    ],
    { logPath: genPngLog },
  );

  console.log(`[OK] Wrote baseline PDF: ${path.relative(root, baselinePdfPath)}`);
  console.log(`[OK] Wrote generated PDF: ${path.relative(root, genPdfPath)}`);
  console.log(`[OK] Output dir: ${path.relative(root, outDir)}`);

  // Open the generated PDF for quick human comparison.
  await openFileBestEffort(genPdfPath);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ compare-pass2-baseline-ch1 failed: ${msg}`);
  process.exit(1);
});


