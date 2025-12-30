import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyRewritesOverlay, renderBookHtml, runPrince } from "./lib/bookRenderer.js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`❌ ${name} is REQUIRED - set env var before running`);
    process.exit(1);
  }
  return v.trim();
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const AGENT_TOKEN = requireEnv("AGENT_TOKEN");

const POLL_INTERVAL_MS = (() => {
  const raw = process.env.POLL_INTERVAL_MS;
  if (!raw) return 3000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("❌ POLL_INTERVAL_MS must be a positive number");
    process.exit(1);
  }
  return Math.min(60_000, Math.max(500, Math.floor(n)));
})();

const HEARTBEAT_INTERVAL_MS = 25_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(fn, { attempts = 3, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      const delay = baseDelayMs * Math.pow(2, i);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function callEdge(name, body, { orgId } = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "apikey": SUPABASE_ANON_KEY,
    "x-agent-token": AGENT_TOKEN,
  };
  if (orgId) headers["x-organization-id"] = orgId;

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`[${name}] Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  // Many IgniteZero functions return HTTP 200 with { ok:false, httpStatus } to avoid blank screens.
  if (json && json.ok === false) {
    const msg = json?.error?.message || json?.error || "Unknown error";
    const httpStatus = json?.httpStatus || res.status;
    throw new Error(`[${name}] ${httpStatus}: ${msg}`);
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.error || `${res.status}`;
    throw new Error(`[${name}] HTTP ${res.status}: ${msg}`);
  }

  return json;
}

async function downloadJsonFromSignedUrl(signedUrl) {
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Downloaded input was not valid JSON");
  }
}

async function downloadBinaryFromSignedUrl(signedUrl) {
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function runCmd(cmd, args, { cwd } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} failed (exit ${code})\n${[out, err].filter(Boolean).join("\n").slice(0, 2000)}`));
    });
  });
}

async function extractZip(zipPath, destDir) {
  await mkdir(destDir, { recursive: true });
  if (process.platform === "win32") {
    // Use PowerShell's built-in Expand-Archive for Windows hosts.
    const ps = [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ];
    await runCmd("powershell", ps);
    return;
  }

  // Linux containers: rely on `unzip` (install it in the worker image).
  await runCmd("unzip", ["-o", zipPath, "-d", destDir]);
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s));
}
function isDataUrl(s) {
  return /^data:/i.test(String(s));
}
function isFileUrl(s) {
  return /^file:\/\//i.test(String(s));
}

function basenameLike(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : s;
}

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeMissingImageDataUri(label) {
  const text = escapeXml(label);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="32" height="32" patternTransform="rotate(45)">
      <rect width="32" height="32" fill="#fafafa" />
      <rect x="0" y="0" width="16" height="32" fill="#f2f2f2" />
    </pattern>
  </defs>
  <rect x="0" y="0" width="1600" height="900" fill="url(#hatch)" />
  <rect x="40" y="40" width="1520" height="820" rx="24" fill="white" stroke="#d11" stroke-width="6" />
  <text x="80" y="140" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#b00">MISSING IMAGE</text>
  <text x="80" y="220" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#333">${text}</text>
  <text x="80" y="290" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#666">
    Upload or AI-generate this asset, then re-render.
  </text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function findMissingLocalImageAssets({ html, workDir }) {
  const matches = [...String(html || "").matchAll(/<img[^>]+src=\"([^\"]+)\"/g)];
  const srcs = matches.map((m) => String(m[1] || "").trim()).filter(Boolean);

  const local = srcs.filter((s) => !isHttpUrl(s) && !isDataUrl(s) && !isFileUrl(s));
  if (local.length === 0) return { local: [], missing: [] };

  const missing = [];
  for (const rel of local) {
    if (rel.includes("..") || rel.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rel)) {
      missing.push(rel);
      continue;
    }
    try {
      await stat(path.join(workDir, rel));
    } catch {
      missing.push(rel);
    }
  }

  return { local, missing };
}

async function validateLocalImageAssets({ html, workDir }) {
  const { missing } = await findMissingLocalImageAssets({ html, workDir });
  if (!missing.length) return;
  throw new Error(
    `BLOCKED: Missing required image assets (${missing.length}). ` +
    `Ensure assets.zip is uploaded for this bookVersion and image src paths are relative (or mapped via figures.srcMap). ` +
    `Missing: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ", ..." : ""}`,
  );
}

function applyMissingImagePlaceholders({ html, missingSrcs }) {
  const missingSet = new Set(missingSrcs.map((s) => String(s || "").trim()).filter(Boolean));
  if (missingSet.size === 0) return { html, replacements: 0 };

  let replacements = 0;
  const nextHtml = String(html || "").replace(/<img([^>]*?)\bsrc=\"([^\"]+)\"([^>]*)>/g, (full, pre, src, post) => {
    const s = String(src || "").trim();
    if (!missingSet.has(s)) return full;
    const label = basenameLike(s) || s;
    const dataUri = makeMissingImageDataUri(label);
    replacements += 1;

    // Preserve other attributes; annotate for debugging.
    const hasClass = /\bclass=\"/.test(full);
    const classPatch = hasClass
      ? full.replace(/\bclass=\"([^\"]*)\"/, (m, cls) => `class="${cls} missing-image"`)
      : null;

    if (classPatch && classPatch !== full) {
      return classPatch.replace(/\bsrc=\"([^\"]+)\"/, `src="${dataUri}" data-missing-src="${s.replace(/\"/g, "&quot;")}"`);
    }

    return `<img${pre}src="${dataUri}" data-missing-src="${s.replace(/\"/g, "&quot;")}"${post}>`;
  });

  return { html: nextHtml, replacements };
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function isTruthyEnv(value) {
  if (!value || typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function requireDocraptorKey() {
  const v = process.env.DOCRAPTOR_API_KEY;
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error("❌ DOCRAPTOR_API_KEY is REQUIRED when render_provider=docraptor_api");
    process.exit(1);
  }
  return v.trim();
}

// NOTE: applyRewritesOverlay/renderBookHtml/runPrince are imported from ./lib/bookRenderer.js

async function runDocraptor({ html, pdfPath, logPath }) {
  const apiKey = requireDocraptorKey();
  const testMode = isTruthyEnv(process.env.DOCRAPTOR_TEST_MODE);
  const start = Date.now();

  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch("https://api.docraptor.com/docs", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
      "Accept": "application/pdf",
    },
    body: JSON.stringify({
      doc: {
        document_content: html,
        name: "book.pdf",
        document_type: "pdf",
        test: testMode,
      },
    }),
  });

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await writeFile(
      logPath,
      `DocRaptor failed (${res.status})\n${text.slice(0, 2000)}\n`,
      "utf-8",
    ).catch(() => {});
    throw new Error(`DocRaptor failed (${res.status}). See log: ${logPath}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(pdfPath, buf);
  await writeFile(
    logPath,
    `DocRaptor OK (${res.status}) test=${testMode} durationMs=${durationMs}\n`,
    "utf-8",
  ).catch(() => {});

  return { durationMs };
}

async function verifyLogNoFatal({ logPath, provider }) {
  try {
    const text = await readFile(logPath, "utf-8");
    const lower = String(text || "").toLowerCase();
    if (provider === "prince_local") {
      if (lower.includes("fatal") || lower.includes("error:")) {
        throw new Error("Prince log contains fatal/error");
      }
    }
    if (provider === "docraptor_api") {
      if (lower.includes("failed")) {
        throw new Error("DocRaptor log indicates failure");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Log validation failed: ${msg}`);
  }
}

async function uploadArtifact({ orgId, jobId, fileName, buf, contentType }) {
  const { signedUrl, path: objectPath } = await callEdge(
    "book-job-upload-url",
    { jobId, fileName },
    { orgId }
  );

  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: buf,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}) for ${fileName}: ${t.slice(0, 200)}`);
  }

  return {
    path: objectPath,
    sha256: sha256Hex(buf),
    bytes: buf.byteLength,
    contentType: contentType || "application/octet-stream",
  };
}

async function processJob(job) {
  const jobId = job.id;
  const runId = job.run_id;
  const orgId = job.organization_id;
  const bookId = job.book_id;
  const bookVersionId = job.book_version_id;
  const overlayId = job.overlay_id || null;
  const target = job.target;
  const chapterIndex = typeof job.chapter_index === "number" ? job.chapter_index : null;
  const renderProvider = job.render_provider === "docraptor_api" ? "docraptor_api" : "prince_local";
  const payload = job && typeof job.payload === "object" && job.payload && !Array.isArray(job.payload) ? job.payload : {};
  const allowMissingImages = payload.allowMissingImages === true;
  const pipelineMode = typeof payload.pipelineMode === "string" ? String(payload.pipelineMode) : "";
  const isBookGenPro = pipelineMode === "bookgen_pro";

  if (!jobId || !runId || !orgId || !bookId || !bookVersionId || !target) {
    throw new Error("Job missing required fields");
  }

  const startedAt = Date.now();
  const workDir = path.join("/tmp", `book-run-${runId}`, `job-${jobId}`);
  await mkdir(workDir, { recursive: true });

  // Heartbeat loop (bounded by finally)
  let heartbeatTimer = null;
  const startHeartbeat = () => {
    heartbeatTimer = setInterval(() => {
      callEdge("book-job-heartbeat", { jobId }, { orgId }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);
  };
  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  startHeartbeat();
  try {
    function asPlainObject(x) {
      return x && typeof x === "object" && !Array.isArray(x) ? x : null;
    }

    const reportProgress = async ({ stage, percent, message }) => {
      await callEdge(
        "book-job-progress",
        {
          jobId,
          ...(typeof stage === "string" ? { progressStage: stage } : {}),
          ...(typeof percent === "number" ? { progressPercent: percent } : {}),
          ...(typeof message === "string" ? { progressMessage: message } : {}),
        },
        { orgId }
      );
    };

    const requireEnvForBookGen = (name) => {
      const v = process.env[name];
      if (!v || typeof v !== "string" || !v.trim()) {
        throw new Error(`BLOCKED: ${name} is REQUIRED for BookGen Pro - set env var before running`);
      }
      return v.trim();
    };

    // 1) Get signed input URLs
    await reportProgress({
      stage: isBookGenPro ? "bookgen:init" : "render:init",
      percent: 1,
      message: isBookGenPro ? "BookGen Pro: initializing…" : "Initializing…",
    }).catch(() => {});

    const inputs = await callEdge(
      "book-version-input-urls",
      { bookId, bookVersionId, overlayId, target, chapterIndex, allowMissingImages },
      { orgId }
    );

    const canonicalUrl = inputs?.urls?.canonical?.signedUrl;
    if (!canonicalUrl) throw new Error("Missing canonical signedUrl");

    const canonical = await withRetries(() => downloadJsonFromSignedUrl(canonicalUrl), { attempts: 3 });
    const figures = inputs?.urls?.figures?.signedUrl
      ? await withRetries(() => downloadJsonFromSignedUrl(inputs.urls.figures.signedUrl), { attempts: 3 })
      : null;
    const imageSrcMap = asPlainObject(inputs?.imageSrcMap);
    const designTokens = inputs?.urls?.designTokens?.signedUrl
      ? await withRetries(() => downloadJsonFromSignedUrl(inputs.urls.designTokens.signedUrl), { attempts: 3 })
      : null;
    const overlay = inputs?.urls?.overlay?.signedUrl
      ? await withRetries(() => downloadJsonFromSignedUrl(inputs.urls.overlay.signedUrl), { attempts: 3 })
      : null;

    // 1b) Optional assets bundle (zip) for figures + chapter openers + fonts.
    const assetsZipUrl = inputs?.urls?.assetsZip?.signedUrl || null;
    if (assetsZipUrl) {
      const zipBuf = await withRetries(() => downloadBinaryFromSignedUrl(assetsZipUrl), { attempts: 3 });
      const zipPath = path.join(workDir, "assets.zip");
      const assetsDir = path.join(workDir, "assets");
      await writeFile(zipPath, zipBuf);
      await extractZip(zipPath, assetsDir);
    }

    // 1c) Auto-discover chapter openers from extracted assets (convention-based).
    const chapterOpeners = {};
    const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
    for (let i = 0; i < chapters.length; i++) {
      const n = i + 1;
      const candidates = [
        `images/chapter_openers/chapter_${n}_opener.jpg`,
        `images/chapter_openers/chapter_${n}_opener.jpeg`,
        `images/chapter_openers/chapter_${n}_opener.png`,
        `images/chapter_openers/chapter_${n}_opener.svg`,
      ];
      for (const rel of candidates) {
        try {
          await stat(path.join(workDir, "assets", rel));
          chapterOpeners[i] = rel;
          break;
        } catch {
          // keep scanning
        }
      }
    }

    // 2) Apply overlay
    let assembled = applyRewritesOverlay(canonical, overlay);

    // 2b) Optional BookGen Pro pipeline (skeleton → rewrite → assemble)
    let bookgenArtifacts = [];
    if (isBookGenPro) {
      // BookGen planning uses OpenAI; rewriting can use OpenAI or Anthropic.
      const OPENAI_API_KEY = requireEnvForBookGen("OPENAI_API_KEY");
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim()
        ? String(process.env.ANTHROPIC_API_KEY).trim()
        : null;

      const planModel = typeof payload.planModel === "string" && payload.planModel.trim()
        ? payload.planModel.trim()
        : "gpt-4o-mini";
      const rewriteProvider = typeof payload.rewriteProvider === "string" && payload.rewriteProvider.trim()
        ? payload.rewriteProvider.trim()
        : (ANTHROPIC_API_KEY ? "anthropic" : "openai");
      const rewriteModel = typeof payload.rewriteModel === "string" && payload.rewriteModel.trim()
        ? payload.rewriteModel.trim()
        : (rewriteProvider === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini");

      if (rewriteProvider === "anthropic" && !ANTHROPIC_API_KEY) {
        throw new Error("BLOCKED: rewriteProvider=anthropic but ANTHROPIC_API_KEY is missing");
      }

      const escapeJsonForLog = (obj) => {
        try {
          return JSON.stringify(obj, null, 2);
        } catch {
          return String(obj);
        }
      };

      const BOOKGEN_PROMPT_PLAN_SYSTEM = `You are planning a skeleton for a Dutch MBO textbook rewrite pipeline.

You decide, BEFORE writing happens:
1) MICRO-HEADINGS: short topic labels above body text blocks (for scannability).
2) VERDIEPING selection: choose EXISTING units (do NOT inject new verdieping content). These units will be moved into Verdieping boxes.

MICRO-HEADING RULES:
- Dutch, 2–4 words, no colon, no punctuation, no quotes, no markers.
- Must be a TOPIC LABEL, not the start of a sentence.
  - GOOD: "Functies van [onderwerp]", "De [onderwerp]", "Kenmerken en eigenschappen"
  - BAD: "Een [onderwerp] is een" (sentence fragment - never start with "Een")
  - BAD: "[Onderwerp] uitleg" (generic word "uitleg")
  - BAD: Single technical term without context
- Do NOT use generic filler words: uitleg, beschrijving, informatie, overzicht, introductie, tekst.
- You MUST assign a micro-heading for EVERY unit_id in micro_heading_candidates.
- Do NOT assign micro-headings to units you select as Verdieping.

VERDIEPING RULES:
- Select units that are MORE complex relative to the rest (formulas, mechanisms, multi-step reasoning).
- Spread them out (not adjacent; avoid the very first units).
- NEVER label any unit as Praktijk here.

Return STRICT JSON ONLY:
{
  "micro_headings": [{"unit_id":"...","title":"..."}],
  "verdieping_unit_ids": ["..."],
  "notes": "..."
}`;

      const BOOKGEN_PROMPT_GENERATE_SYSTEM = `You are writing Dutch educational content for MBO N3 level students (age 16-20).

CRITICAL: Write like a REAL Dutch MBO N3 textbook.
1. SENTENCES: Short, direct. One fact per sentence.
2. VOICE: Use "je" (not "jouw"). Use "we" for introductions.
3. CONCISENESS: No filler. No "namelijk", "bijzondere", "belangrijke".
4. STANDALONE: The text must make sense on its own. If the input facts are fragments (e.g. starting with lowercase verbs), restructure them into complete sentences with proper context.
5. TERMINOLOGY (student-facing): use "zorgvrager" and "zorgprofessional". Never use: verpleegkundige, cliënt, client, patiënt, patient.
6. MARKERS (VERY IMPORTANT):
   - Allowed markers are ONLY:
     <<BOLD_START>>, <<BOLD_END>>, <<MICRO_TITLE>>, <<MICRO_TITLE_END>>
   - Do NOT output ANY other <<...>> markers. In particular, never output <<term>>.
   - Preserve any existing <<BOLD_START>>...<<BOLD_END>> spans from the facts exactly as-is.
   - Do NOT invent new bold spans.
7. MICRO-HEADINGS: Micro-headings are preplanned in the skeleton. Only use the provided start marker if instructed. Otherwise do not output any <<MICRO_TITLE>> markers.

Output ONLY the rewritten Dutch text.`;

      const BOOKGEN_PROMPT_PRAKTIJK_EDITORIAL_SYSTEM = `You are the editorial pass for "In de praktijk" boxes in a Dutch MBO N3 nursing textbook.

Goal: Reduce repetition across the set while keeping each box useful and realistic.

Hard requirements (apply to EVERY box):
- Keep "je" perspective.
- Always use "zorgvrager". You may use "in je werk als zorgprofessional" at most once per box. Never write "de zorgprofessional".
- Remove boilerplate admin endings ("noteer...", "bespreek met je team", "in het dossier") unless it is truly essential for the scenario.
- Avoid repeating opener templates across boxes. In particular, do NOT start most boxes with "Je helpt een zorgvrager met ..."; vary the opening action naturally (observe / begeleid / controleer / leg uit (patient-relevant) / meet / ondersteun / etc).
- Patient-facing explanations: ONLY explain what is relevant for the zorgvrager to understand. Avoid deep technical jargon unless it directly supports adherence/symptoms/recovery/self-care.
  If a concept is too technical, keep it as your own understanding ("Je weet dat ...") and translate it into a practical action instead of teaching the mechanism.
- Keep each box 4–7 sentences, single paragraph.
- Do NOT add labels like "In de praktijk:" (layout handles it).
- Allowed markers ONLY: <<BOLD_START>>, <<BOLD_END>>. Do NOT output any other <<...>> markers.
- Preserve any existing <<BOLD_START>>...<<BOLD_END>> spans exactly as-is; do not invent new bold spans.

Return STRICT JSON ONLY:
{ "rewritten": { "unit_id": "text", ... } }`;

      const normalizeWs = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const stripHtml = (s) => normalizeWs(String(s || "").replace(/<\s*br\b[^>]*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
      const words = (s) => stripHtml(s).split(/\s+/).filter(Boolean);
      const wordCount = (s) => words(s).length;

      const toFacts = (raw) => {
        const t = stripHtml(raw);
        if (!t) return [];
        // Split by sentence-ish boundaries, keep short.
        const parts = t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
        if (parts.length <= 1) return [t];
        return parts.slice(0, 12);
      };

      function safeJsonParse(raw) {
        const t = String(raw || "").trim();
        if (!t) return null;
        try {
          return JSON.parse(t);
        } catch {
          return null;
        }
      }

      async function openaiChatJson({ system, user, model, temperature, maxTokens }) {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        const text = await resp.text().catch(() => "");
        if (!resp.ok) {
          throw new Error(`OpenAI failed (${resp.status}): ${text.slice(0, 800)}`);
        }
        const j = safeJsonParse(text);
        const content = j?.choices?.[0]?.message?.content;
        const parsed = safeJsonParse(content);
        if (!parsed) {
          throw new Error(`OpenAI returned non-JSON: ${String(content || "").slice(0, 800)}`);
        }
        return parsed;
      }

      async function openaiChatText({ system, user, model, temperature, maxTokens }) {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        const text = await resp.text().catch(() => "");
        if (!resp.ok) {
          throw new Error(`OpenAI failed (${resp.status}): ${text.slice(0, 800)}`);
        }
        const j = safeJsonParse(text);
        const content = j?.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new Error("OpenAI returned empty content");
        }
        return content;
      }

      async function anthropicText({ system, user, model, temperature, maxTokens }) {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
          }),
        });
        const text = await resp.text().catch(() => "");
        if (!resp.ok) {
          throw new Error(`Anthropic failed (${resp.status}): ${text.slice(0, 800)}`);
        }
        const j = safeJsonParse(text);
        const contentArr = Array.isArray(j?.content) ? j.content : [];
        const first = contentArr.find((c) => c && c.type === "text" && typeof c.text === "string");
        const out = first?.text;
        if (!out || typeof out !== "string") {
          throw new Error("Anthropic returned empty content");
        }
        return out;
      }

      const pickChapter = (canon, idx) => {
        const chapters = Array.isArray(canon?.chapters) ? canon.chapters : [];
        if (typeof idx !== "number") return null;
        return chapters[idx] || null;
      };

      const chapter = target === "chapter" ? pickChapter(assembled, chapterIndex) : null;
      if (target === "chapter" && !chapter) {
        throw new Error("BookGen Pro requires a valid chapterIndex for chapter target");
      }

      const bookTitle = String(assembled?.meta?.title || bookId);

      // Build unit list from paragraphs in this chapter.
      const units = [];
      const walkBlocks = (blocks, ctx) => {
        if (!Array.isArray(blocks)) return;
        for (const b of blocks) {
          if (!b || typeof b !== "object") continue;
          const t = typeof b.type === "string" ? b.type : "";
          if (t === "paragraph" && typeof b.id === "string" && typeof b.basis === "string") {
            units.push({
              unit_id: b.id,
              section: ctx.section,
              subsection: ctx.subsection,
              order: units.length + 1,
              approx_words: wordCount(b.basis),
              preview: stripHtml(b.basis).slice(0, 220),
              basis: b.basis,
            });
          } else if (t === "subparagraph") {
            const title = typeof b.title === "string" ? b.title : "";
            const next = {
              section: ctx.section,
              subsection: title ? (ctx.subsection ? `${ctx.subsection} / ${title}` : title) : ctx.subsection,
            };
            walkBlocks(b.content || b.blocks || b.items, next);
          } else {
            // fallback recursion
            if (Array.isArray(b.content)) walkBlocks(b.content, ctx);
            if (Array.isArray(b.blocks)) walkBlocks(b.blocks, ctx);
            if (Array.isArray(b.items)) walkBlocks(b.items, ctx);
          }
        }
      };

      if (target === "chapter") {
        const sections = Array.isArray(chapter?.sections) ? chapter.sections : [];
        for (const s of sections) {
          const sectionTitle = typeof s?.title === "string" ? s.title : "";
          walkBlocks(s?.content, { section: sectionTitle, subsection: "" });
        }
      } else {
        // Book target: flatten all chapters (heavy). For now, block explicitly.
        throw new Error("BLOCKED: BookGen Pro currently supports target=chapter only (enqueue per-chapter runs).");
      }

      if (units.length === 0) {
        throw new Error("No paragraph units found to rewrite");
      }

      const avgWords = Math.round(units.reduce((acc, u) => acc + (u.approx_words || 0), 0) / Math.max(1, units.length));
      const microCandidates = units
        .filter((u) => (u.approx_words || 0) >= Math.max(40, avgWords))
        .map((u) => ({
          unit_id: u.unit_id,
          order: u.order,
          section: u.section,
          subsection: u.subsection,
          approx_words: u.approx_words,
          preview: u.preview,
        }));
      const verdiepingCandidates = units
        .filter((u) => (u.approx_words || 0) >= 65)
        .map((u) => ({
          unit_id: u.unit_id,
          order: u.order,
          section: u.section,
          subsection: u.subsection,
          approx_words: u.approx_words,
          preview: u.preview,
        }));

      const planInput = {
        book_title: bookTitle,
        avg_words_per_unit: avgWords,
        micro_heading_candidates: microCandidates,
        verdieping_candidates: verdiepingCandidates,
        targets: { verdieping_range: { min: 1, max: 2 } },
      };

      await reportProgress({ stage: "bookgen:plan", percent: 5, message: "BookGen Pro: planning microheadings & verdieping…" }).catch(() => {});

      const plan = await openaiChatJson({
        system: BOOKGEN_PROMPT_PLAN_SYSTEM,
        user: `INPUT JSON:\n${JSON.stringify(planInput)}`,
        model: planModel,
        temperature: 0.2,
        maxTokens: 4000,
      });

      const microHeadingsArr = Array.isArray(plan?.micro_headings) ? plan.micro_headings : [];
      const rawVerd = Array.isArray(plan?.verdieping_unit_ids) ? plan.verdieping_unit_ids : [];

      const microMap = new Map();
      for (const mh of microHeadingsArr) {
        const uid = mh?.unit_id;
        const title = mh?.title;
        if (typeof uid === "string" && typeof title === "string" && title.trim()) {
          microMap.set(uid, title.trim());
        }
      }

      // Ensure every micro candidate has a microheading (deterministic fallback)
      const stop = new Set(["een", "de", "het", "en", "van", "in", "op", "met", "voor", "bij", "naar", "of", "je", "we"]);
      const fallbackMicro = (text) => {
        const toks = words(text).map((w) => w.replace(/[^\p{L}\p{N}-]+/gu, "").toLowerCase()).filter(Boolean);
        const keep = toks.filter((w) => !stop.has(w)).slice(0, 4);
        const title = keep.slice(0, Math.max(2, Math.min(4, keep.length))).join(" ");
        const cleaned = title.trim();
        if (!cleaned) return "Belangrijk onderwerp";
        // Capitalize first letter only (avoid punctuation).
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      };
      for (const c of microCandidates) {
        if (!microMap.has(c.unit_id)) {
          const u = units.find((x) => x.unit_id === c.unit_id);
          microMap.set(c.unit_id, fallbackMicro(u?.basis || u?.preview || ""));
        }
      }

      // Determine verdieping selection with simple deterministic trimming.
      const verdSet = new Set(rawVerd.map((x) => String(x || "").trim()).filter(Boolean));
      // Cap max
      const verdMax = 2;
      if (verdSet.size > verdMax) {
        const sorted = Array.from(verdSet).sort((a, b) => {
          const aw = units.find((u) => u.unit_id === a)?.approx_words || 0;
          const bw = units.find((u) => u.unit_id === b)?.approx_words || 0;
          // Prefer longer (proxy for complexity)
          if (bw !== aw) return bw - aw;
          return a.localeCompare(b);
        });
        verdSet.clear();
        sorted.slice(0, verdMax).forEach((x) => verdSet.add(x));
      }
      // Ensure min
      const verdMin = 1;
      if (verdSet.size < verdMin) {
        const candidates = verdiepingCandidates
          .map((c) => c.unit_id)
          .filter((id) => !verdSet.has(id))
          .sort((a, b) => {
            const aw = units.find((u) => u.unit_id === a)?.approx_words || 0;
            const bw = units.find((u) => u.unit_id === b)?.approx_words || 0;
            if (bw !== aw) return bw - aw;
            return a.localeCompare(b);
          });
        for (const id of candidates) {
          verdSet.add(id);
          if (verdSet.size >= verdMin) break;
        }
      }

      // Remove microheadings for verdieping units
      for (const id of verdSet) microMap.delete(id);

      const skeleton = {
        generatedAt: new Date().toISOString(),
        bookId,
        bookVersionId,
        target,
        chapterIndex,
        planModel,
        rewriteProvider,
        rewriteModel,
        avgWordsPerUnit: avgWords,
        microHeadings: Array.from(microMap.entries()).map(([unit_id, title]) => ({ unit_id, title })),
        verdiepingUnitIds: Array.from(verdSet),
        notes: typeof plan?.notes === "string" ? plan.notes : "",
      };

      const skeletonBuf = Buffer.from(JSON.stringify(skeleton, null, 2), "utf-8");
      bookgenArtifacts.push({
        kind: "debug",
        ...(await uploadArtifact({ orgId, jobId, fileName: "skeleton.json", buf: skeletonBuf, contentType: "application/json" })),
        chapterIndex,
      });

      await reportProgress({ stage: "bookgen:rewrite", percent: 12, message: `BookGen Pro: rewriting ${units.length} unit(s)…` }).catch(() => {});

      const rewrittenById = new Map();
      const verdiepingById = new Map();

      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const isVerd = verdSet.has(u.unit_id);
        const micro = microMap.get(u.unit_id) || null;

        const instruction = isVerd
          ? `This block is classified as **Verdieping** (Deepening) - more advanced detail.
    
    CRITICAL: The input facts may be LIST FRAGMENTS (starting with lowercase verbs). You MUST:
    1. First INTRODUCE what subject these facts are about (use the section context).
    2. Then explain each fact as a COMPLETE, STANDALONE sentence.
    
    BAD: "zorgen dat X deelt. geven signalen aan Y."
    GOOD: "[Subject] heeft verschillende functies. Het zorgt ervoor dat X deelt. Ook geeft het signalen aan Y."
    
    Task: Rewrite into clear N3 Dutch with proper context and complete sentences.
    Style: Short sentences. Active voice.
    DO NOT write meta-introductions like: "In deze sectie...", "In dit hoofdstuk...", "Hier leer je...".
    Start directly with the content (the concept/mechanism), as if it's a normal textbook paragraph.
    Do NOT add any labels like "Verdieping:" (layout handles it).`
          : `Write a concise paragraph using these facts.
    Target Level: MBO N3 (Vocational).
    CRITICAL: SIMPLIFY complex details into accessible explanations.
    Style: Short sentences. Active voice. "Je" form.
    Preserve any existing <<BOLD_START>>...<<BOLD_END>> spans from the facts exactly as-is. Do NOT invent any new markers.`;

        const microHint = micro
          ? `Start exactly with: <<MICRO_TITLE>>${micro}<<MICRO_TITLE_END>> `
          : `Do NOT include any <<MICRO_TITLE>> markers in the output.`;

        const facts = toFacts(u.basis);
        const userMsg =
`CONTEXT:
  Book: ${bookTitle}
  Section: ${u.section || ""}
  Subsection: ${u.subsection || ""}

  INPUT FACTS:
${facts.map((f, idx) => `  ${idx + 1}. ${f}`).join("\n")}

  INSTRUCTION:
  ${instruction}
  ${microHint}

  Write now (Dutch):`;

        let outText;
        if (rewriteProvider === "anthropic") {
          outText = await anthropicText({ system: BOOKGEN_PROMPT_GENERATE_SYSTEM, user: userMsg, model: rewriteModel, temperature: 0.3, maxTokens: 1024 });
        } else {
          outText = await openaiChatText({ system: BOOKGEN_PROMPT_GENERATE_SYSTEM, user: userMsg, model: rewriteModel, temperature: 0.3, maxTokens: 1024 });
        }

        const rawOut = String(outText || "").trim();
        if (!rawOut) throw new Error(`Empty rewrite for unit ${u.unit_id}`);

        // Extract micro title markers (if present) and strip from body.
        let bodyText = rawOut;
        if (bodyText.startsWith("<<MICRO_TITLE>>")) {
          const end = bodyText.indexOf("<<MICRO_TITLE_END>>");
          if (end !== -1) {
            // Keep planned micro title; discard marker span.
            bodyText = bodyText.slice(end + "<<MICRO_TITLE_END>>".length).trim();
          }
        }
        // Convert bold markers to HTML strong tags for renderer.
        bodyText = bodyText
          .replace(/<<BOLD_START>>/g, "<strong>")
          .replace(/<<BOLD_END>>/g, "</strong>");

        if (isVerd) {
          verdiepingById.set(u.unit_id, bodyText);
        } else {
          rewrittenById.set(u.unit_id, bodyText);
        }

        if ((i + 1) % 5 === 0 || i === units.length - 1) {
          const pct = 12 + Math.round(((i + 1) / units.length) * 48);
          await reportProgress({ stage: "bookgen:rewrite", percent: pct, message: `BookGen Pro: rewritten ${i + 1}/${units.length}` }).catch(() => {});
        }
      }

      const rewritesOut = {
        generatedAt: new Date().toISOString(),
        bookId,
        bookVersionId,
        chapterIndex,
        rewriteProvider,
        rewriteModel,
        rewritten: Object.fromEntries(rewrittenById.entries()),
        verdieping: Object.fromEntries(verdiepingById.entries()),
      };

      const rewritesBuf = Buffer.from(JSON.stringify(rewritesOut, null, 2), "utf-8");
      bookgenArtifacts.push({
        kind: "debug",
        ...(await uploadArtifact({ orgId, jobId, fileName: "rewrites.json", buf: rewritesBuf, contentType: "application/json" })),
        chapterIndex,
      });

      await reportProgress({ stage: "bookgen:assemble", percent: 65, message: "BookGen Pro: assembling rewritten chapter…" }).catch(() => {});

      // Assemble: apply basis rewrites + insert microheadings by wrapping paragraphs into subparagraph blocks.
      const assembledClone = JSON.parse(JSON.stringify(assembled));

      const applyToBlocks = (blocks) => {
        if (!Array.isArray(blocks)) return blocks;
        const out = [];
        for (const b of blocks) {
          if (!b || typeof b !== "object") continue;
          const t = typeof b.type === "string" ? b.type : "";
          if (t === "paragraph" && typeof b.id === "string") {
            const pid = b.id;
            const micro = microMap.get(pid) || null;
            const isVerd = verdSet.has(pid);
            const nextPara = { ...b };
            if (isVerd) {
              const v = verdiepingById.get(pid);
              if (typeof v === "string") {
                nextPara.basis = ""; // moved into box
                nextPara.verdieping = v;
              }
            } else {
              const r = rewrittenById.get(pid);
              if (typeof r === "string") nextPara.basis = r;
            }

            if (micro) {
              out.push({
                type: "subparagraph",
                title: micro,
                content: [nextPara],
              });
            } else {
              out.push(nextPara);
            }
            continue;
          }

          if (t === "subparagraph") {
            const next = { ...b };
            const inner = b.content || b.blocks || b.items;
            next.content = applyToBlocks(inner);
            out.push(next);
            continue;
          }

          // Fallback recursion
          const next = { ...b };
          if (Array.isArray(b.content)) next.content = applyToBlocks(b.content);
          out.push(next);
        }
        return out;
      };

      if (target === "chapter") {
        const ch = assembledClone.chapters?.[chapterIndex];
        if (ch && Array.isArray(ch.sections)) {
          ch.sections = ch.sections.map((s) => ({
            ...s,
            content: applyToBlocks(s.content),
          }));
        }
      }

      assembled = assembledClone;
      await reportProgress({ stage: "bookgen:assemble", percent: 72, message: "BookGen Pro: assembled chapter ready" }).catch(() => {});
    }

    // 3) Render HTML
    // If the edge function provided an imageSrcMap (canonical src -> signed URL),
    // merge it into figures.srcMap so the renderer resolves images without requiring assets.zip.
    let figuresForRender = figures;
    if (imageSrcMap) {
      const base = asPlainObject(figures) || {};
      const existing = asPlainObject(base.srcMap) || asPlainObject(base.src_map) || {};
      figuresForRender = { ...base, srcMap: { ...existing, ...imageSrcMap } };
    }

    let html = renderBookHtml(assembled, {
      target,
      chapterIndex: target === "chapter" ? chapterIndex : null,
      assetsBaseUrl: "assets",
      figures: figuresForRender,
      designTokens,
      chapterOpeners,
    });

    const htmlPath = path.join(workDir, "render.html");
    const assembledPath = path.join(workDir, "assembled.json");
    const pdfPath = path.join(workDir, "output.pdf");
    const logPath = path.join(workDir, renderProvider === "docraptor_api" ? "docraptor.log" : "prince.log");

    // Missing images policy:
    // - strict (default): hard fail before rendering
    // - allowMissingImages=true: replace missing images with visible placeholders + emit a report artifact
    const missingCheck = await findMissingLocalImageAssets({ html, workDir });
    const missingImages = missingCheck.missing || [];
    const missingImageReport = missingImages.length
      ? {
          generatedAt: new Date().toISOString(),
          bookId,
          bookVersionId,
          runId,
          jobId,
          target,
          chapterIndex,
          allowMissingImages,
          missingImages: missingImages.map((src) => {
            const htmlSrc = String(src || "").trim();
            const canonicalSrc = htmlSrc.startsWith("assets/") ? htmlSrc.slice("assets/".length) : htmlSrc;
            return {
              htmlSrc,
              canonicalSrc,
              basename: basenameLike(canonicalSrc) || basenameLike(htmlSrc),
              suggestedUploadPath: `library/${bookId}/images/${basenameLike(canonicalSrc) || basenameLike(htmlSrc)}`,
            };
          }),
          missingImageSrcsFromEdge: Array.isArray(inputs?.missingImageSrcs) ? inputs.missingImageSrcs : null,
        }
      : null;

    if (missingImages.length) {
      if (!allowMissingImages) {
        await validateLocalImageAssets({ html, workDir });
      }
      const patched = applyMissingImagePlaceholders({ html, missingSrcs: missingImages });
      html = patched.html;
    }

    await writeFile(htmlPath, html, "utf-8");
    await writeFile(assembledPath, JSON.stringify(assembled, null, 2), "utf-8");

    // Post-patch validation gate (should pass even in placeholder mode).
    await validateLocalImageAssets({ html, workDir });

    // 4) Render PDF
    const renderStartMs = Date.now();
    const { durationMs } = renderProvider === "docraptor_api"
      ? await runDocraptor({ html, pdfPath, logPath })
      : await runPrince({ htmlPath, pdfPath, logPath });

    const pdfStat = await stat(pdfPath);
    if (!pdfStat || pdfStat.size <= 0) {
      throw new Error("PDF render produced an empty file");
    }
    await verifyLogNoFatal({ logPath, provider: renderProvider });

    // 5) Upload artifacts
    const [htmlBuf, assembledBuf, pdfBuf, logBuf] = await Promise.all([
      readFile(htmlPath),
      readFile(assembledPath),
      readFile(pdfPath),
      readFile(logPath),
    ]);

    const uploaded = [];
    uploaded.push({
      kind: "html",
      ...(await uploadArtifact({ orgId, jobId, fileName: "render.html", buf: htmlBuf, contentType: "text/html" })),
      chapterIndex,
    });
    uploaded.push({
      kind: "assembled",
      ...(await uploadArtifact({ orgId, jobId, fileName: "assembled.json", buf: assembledBuf, contentType: "application/json" })),
      chapterIndex,
    });
    uploaded.push({
      kind: "pdf",
      ...(await uploadArtifact({ orgId, jobId, fileName: "output.pdf", buf: pdfBuf, contentType: "application/pdf" })),
      chapterIndex,
    });
    uploaded.push({
      kind: renderProvider === "docraptor_api" ? "debug" : "prince_log",
      ...(await uploadArtifact({
        orgId,
        jobId,
        fileName: renderProvider === "docraptor_api" ? "docraptor.log" : "prince.log",
        buf: logBuf,
        contentType: "text/plain",
      })),
      chapterIndex,
    });

    if (missingImageReport) {
      const reportBuf = Buffer.from(JSON.stringify(missingImageReport, null, 2), "utf-8");
      uploaded.push({
        kind: "layout_report",
        ...(await uploadArtifact({ orgId, jobId, fileName: "layout_report.json", buf: reportBuf, contentType: "application/json" })),
        chapterIndex,
      });
    }

    // Include BookGen artifacts (skeleton/rewrites) if any.
    if (Array.isArray(bookgenArtifacts) && bookgenArtifacts.length) {
      for (const a of bookgenArtifacts) uploaded.push(a);
    }

    const processingDurationMs = Date.now() - startedAt;
    const renderDurationMs = Date.now() - renderStartMs;

    const missingCount = missingImageReport?.missingImages?.length ? Number(missingImageReport.missingImages.length) : 0;
    await callEdge(
      "book-job-apply-result",
      {
        jobId,
        status: "done",
        progressStage: "completed",
        progressPercent: 100,
        progressMessage: missingCount
          ? `Rendered via ${renderProvider} in ${renderDurationMs}ms (MISSING IMAGES: ${missingCount})`
          : `Rendered via ${renderProvider} in ${renderDurationMs}ms`,
        resultPath: uploaded.find((u) => u.kind === "pdf")?.path || null,
        processingDurationMs,
        artifacts: uploaded.map((u) => ({
          kind: u.kind,
          path: u.path,
          sha256: u.sha256,
          bytes: u.bytes,
          contentType: u.contentType,
          chapterIndex: u.chapterIndex,
        })),
      },
      { orgId }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await callEdge(
      "book-job-apply-result",
      {
        jobId,
        status: "failed",
        error: msg,
        progressStage: "failed",
        progressPercent: 0,
        progressMessage: msg,
        processingDurationMs: Date.now() - startedAt,
      },
      { orgId }
    ).catch(() => {});
    throw e;
  } finally {
    stopHeartbeat();
  }
}

async function main() {
  console.log("[book-worker] Starting…");
  console.log(`[book-worker] Poll interval: ${POLL_INTERVAL_MS}ms`);

  while (true) {
    try {
      const res = await callEdge("book-claim-job", {}, {});
      const job = res?.job || null;
      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`[book-worker] Claimed job ${job.id} (run ${job.run_id}, target ${job.target})`);
      await processJob(job);
      console.log(`[book-worker] Completed job ${job.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[book-worker] Loop error: ${msg}`);
      await sleep(Math.min(10_000, POLL_INTERVAL_MS));
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[book-worker] Fatal: ${msg}`);
  process.exit(1);
});


