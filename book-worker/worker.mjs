import { createHash } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyRewritesOverlay, renderBookHtml, runPrince } from "./lib/bookRenderer.js";

// Optional networking tweak:
// Some Windows / ISP / corporate networks have broken TLS over IPv6 for specific hosts.
// Allow forcing IPv4-first DNS resolution to avoid ECONNRESET during HTTPS handshakes.
const DNS_RESULT_ORDER = String(process.env.BOOK_WORKER_DNS_RESULT_ORDER || "").trim().toLowerCase();
if (DNS_RESULT_ORDER) {
  if (!["ipv4first", "verbatim"].includes(DNS_RESULT_ORDER)) {
    console.error("❌ BOOK_WORKER_DNS_RESULT_ORDER must be ipv4first or verbatim");
    process.exit(1);
  }
  try {
    setDefaultResultOrder(DNS_RESULT_ORDER);
    console.log(`[book-worker] DNS result order: ${DNS_RESULT_ORDER}`);
  } catch {
    // If unsupported in this Node version, continue; fetch may still work.
  }
}

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

  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  } catch (e) {
    const cause = e && typeof e === "object" ? e.cause : null;
    const code = cause && typeof cause === "object" ? cause.code : "";
    const syscall = cause && typeof cause === "object" ? cause.syscall : "";
    const hostname = cause && typeof cause === "object" ? cause.hostname : "";
    const hint = [code, syscall, hostname].filter(Boolean).join(" ");
    throw new Error(`[${name}] fetch failed: ${hint || "fetch failed"}`);
  }
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

function makeFigurePlaceholderDataUri(label) {
  // Neutral placeholder (NOT an error). Used for Book Studio-compatible "placeholder-only" renders.
  const text = escapeXml(label);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect x="0" y="0" width="1600" height="900" fill="#ffffff"/>
  <rect x="40" y="40" width="1520" height="820" fill="#fafafa" stroke="#9aa0a6" stroke-width="4" stroke-dasharray="14 10"/>
  <text x="800" y="455" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="600" fill="#333">${text}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function findMissingLocalImageAssets({ html, workDir }) {
  // IMPORTANT: match the actual `src="..."` attribute, not attributes that merely contain "src"
  // like `data-missing-src="..."`. Also use non-greedy matching so we don't accidentally capture
  // the last "src" occurrence in the tag.
  const matches = [...String(html || "").matchAll(/<img\b[^>]*?\ssrc=\"([^\"]+)\"/gi)];
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
  // Preserve the whitespace before `src="..."` so we don't end up with `<imgsrc="...">`.
  const nextHtml = String(html || "").replace(/<img([^>]*?\s)src=\"([^\"]+)\"([^>]*)>/g, (full, pre, src, post) => {
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
  const withSuffix = (name, suffix) => {
    const s = String(name || "").trim();
    const idx = s.lastIndexOf(".");
    if (idx <= 0 || idx === s.length - 1) return `${s}.${suffix}`;
    const base = s.slice(0, idx);
    const ext = s.slice(idx);
    return `${base}.${suffix}${ext}`;
  };

  const MAX_SIGN_ATTEMPTS = 6;
  let currentName = String(fileName || "").trim();
  let signedUrl = "";
  let objectPath = "";

  for (let attempt = 1; attempt <= MAX_SIGN_ATTEMPTS; attempt++) {
    try {
      const out = await callEdge("book-job-upload-url", { jobId, fileName: currentName }, { orgId });
      signedUrl = String(out?.signedUrl || "");
      objectPath = String(out?.path || "");
      if (!signedUrl || !objectPath) throw new Error("Missing signedUrl/path for upload");
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isExists = /already exists/i.test(msg);
      const isFetch = /fetch failed/i.test(msg);

      // If the path is already reserved/used, switch to a new filename (bounded) and retry.
      if (isExists) {
        currentName = withSuffix(currentName, `dup${attempt}`);
        continue;
      }

      // Transient network blip: retry.
      if (isFetch && attempt < MAX_SIGN_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }

      throw e;
    }
  }

  if (!signedUrl || !objectPath) {
    throw new Error(`Failed to obtain signed upload URL for ${currentName}`);
  }

  const MAX_PUT_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_PUT_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType || "application/octet-stream" },
        body: buf,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}) for ${currentName}: ${t.slice(0, 200)}`);
      }
      return {
        path: objectPath,
        sha256: sha256Hex(buf),
        bytes: buf.byteLength,
        contentType: contentType || "application/octet-stream",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isFetch = /fetch failed/i.test(msg);
      if (isFetch && attempt < MAX_PUT_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      throw e;
    }
  }

  throw new Error(`Upload failed for ${currentName}`);
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
  const placeholdersOnly =
    payload.placeholdersOnly === true ||
    isTruthyEnv(process.env.BOOK_RENDER_PLACEHOLDERS_ONLY);
  const pipelineMode = typeof payload.pipelineMode === "string" ? String(payload.pipelineMode) : "";
  const isBookGenPro = pipelineMode === "bookgen_pro";

  if (!jobId || !runId || !orgId || !bookId || !bookVersionId || !target) {
    throw new Error("Job missing required fields");
  }

  // Artifact upload URLs currently fail if the object already exists.
  // Since jobs can be retried, make filenames unique per retry attempt to avoid collisions.
  // (We can't rely on edge upsert behavior unless the function is deployed accordingly.)
  const retryCount = typeof job.retry_count === "number" && Number.isFinite(job.retry_count) ? job.retry_count : 0;
  const retryPrefix = retryCount > 0 ? `retry${retryCount}.` : "";
  const fileNameForAttempt = (name) => (retryPrefix ? `${retryPrefix}${String(name || "")}` : String(name || ""));

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
      // Also log locally so long-running BookGen Pro runs are observable without querying DB.
      const st = typeof stage === "string" ? stage : "";
      const pct = typeof percent === "number" && Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null;
      const msg = typeof message === "string" ? message : "";
      if (st || pct !== null || msg) {
        const bits = [];
        if (pct !== null) bits.push(`${pct}%`);
        if (st) bits.push(st);
        if (msg) bits.push(msg);
        console.log(`[book-worker] Progress job=${jobId}: ${bits.join(" | ")}`);
      }
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
      {
        bookId,
        bookVersionId,
        overlayId,
        target,
        chapterIndex,
        allowMissingImages,
        includeFigurePlacements: true,
        // Ensure openers always resolve from THIS book's image library (prevents cross-book opener mistakes).
        includeChapterOpeners: true,
        // For older "text-only" canonicals, auto-attach library figures by inferring chapter/figure numbers.
        // The edge function is guarded to only do this when the canonical has very few embedded images.
        autoAttachLibraryImages: true,
      },
      { orgId }
    );

    const canonicalUrl = inputs?.urls?.canonical?.signedUrl;
    if (!canonicalUrl) throw new Error("Missing canonical signedUrl");

    const canonical = await withRetries(() => downloadJsonFromSignedUrl(canonicalUrl), { attempts: 3 });
    const figures = inputs?.urls?.figures?.signedUrl
      ? await withRetries(() => downloadJsonFromSignedUrl(inputs.urls.figures.signedUrl), { attempts: 3 })
      : null;
    let imageSrcMap = asPlainObject(inputs?.imageSrcMap);
    let figurePlacementsFromEdge = asPlainObject(inputs?.figurePlacements);
    const chapterOpenersFromEdge = asPlainObject(inputs?.chapterOpeners);
    const autoChapterFigures = asPlainObject(inputs?.autoChapterFigures);
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
    const chapterOpenersFromAssets = {};
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
          chapterOpenersFromAssets[i] = rel;
          break;
        } catch {
          // keep scanning
        }
      }
    }

    // Prefer edge-provided openers (book-scoped, signed) and fall back to assets.zip discovery.
    const chapterOpeners = { ...chapterOpenersFromAssets, ...(chapterOpenersFromEdge || {}) };

    // 2) Apply overlay
    let assembled = applyRewritesOverlay(canonical, overlay);
    let placeholderImageSrcMap = null; // when placeholdersOnly=true, we override real image URLs with placeholder data URIs

    // 2b) Optional BookGen Pro pipeline (skeleton → rewrite → assemble)
    let bookgenArtifacts = [];
    if (isBookGenPro) {
      // BookGen planning + rewriting can use OpenAI or Anthropic (configurable via job payload).
      // IMPORTANT: Never include raw provider error payloads in logs without redacting secrets.
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim()
        ? String(process.env.OPENAI_API_KEY).trim()
        : null;
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim()
        ? String(process.env.ANTHROPIC_API_KEY).trim()
        : null;

      const requireOpenAiKey = () => {
        if (OPENAI_API_KEY) return OPENAI_API_KEY;
        return requireEnvForBookGen("OPENAI_API_KEY");
      };
      const requireAnthropicKey = () => {
        if (ANTHROPIC_API_KEY) return ANTHROPIC_API_KEY;
        return requireEnvForBookGen("ANTHROPIC_API_KEY");
      };

      const redactSecrets = (raw) => {
        const s = String(raw ?? "");
        return s
          .replace(/sk-[A-Za-z0-9_-]{10,}/g, "sk-[REDACTED]")
          .replace(/sbp_[A-Za-z0-9_-]{10,}/g, "sbp_[REDACTED]")
          .replace(/Bearer\\s+[A-Za-z0-9._-]{10,}/gi, "Bearer [REDACTED]");
      };

      const planProviderRaw = typeof payload.planProvider === "string" && payload.planProvider.trim()
        ? payload.planProvider.trim()
        : "";
      if (planProviderRaw && !["openai", "anthropic"].includes(planProviderRaw)) {
        throw new Error(`Invalid planProvider in job payload: ${planProviderRaw}`);
      }
      const planProviderEnv = process.env.BOOKGEN_PLAN_PROVIDER && String(process.env.BOOKGEN_PLAN_PROVIDER).trim()
        ? String(process.env.BOOKGEN_PLAN_PROVIDER).trim()
        : "";
      if (planProviderEnv && !["openai", "anthropic"].includes(planProviderEnv)) {
        throw new Error(`Invalid BOOKGEN_PLAN_PROVIDER env var: ${planProviderEnv}`);
      }
      const planProvider = planProviderRaw || planProviderEnv || "openai";

      const rewriteProviderRaw = typeof payload.rewriteProvider === "string" && payload.rewriteProvider.trim()
        ? payload.rewriteProvider.trim()
        : "";
      if (rewriteProviderRaw && !["openai", "anthropic"].includes(rewriteProviderRaw)) {
        throw new Error(`Invalid rewriteProvider in job payload: ${rewriteProviderRaw}`);
      }
      const rewriteProviderEnv = process.env.BOOKGEN_REWRITE_PROVIDER && String(process.env.BOOKGEN_REWRITE_PROVIDER).trim()
        ? String(process.env.BOOKGEN_REWRITE_PROVIDER).trim()
        : "";
      if (rewriteProviderEnv && !["openai", "anthropic"].includes(rewriteProviderEnv)) {
        throw new Error(`Invalid BOOKGEN_REWRITE_PROVIDER env var: ${rewriteProviderEnv}`);
      }
      const rewriteProvider = rewriteProviderRaw || rewriteProviderEnv || (ANTHROPIC_API_KEY ? "anthropic" : "openai");

      const planModelEnv = process.env.BOOKGEN_PLAN_MODEL && String(process.env.BOOKGEN_PLAN_MODEL).trim()
        ? String(process.env.BOOKGEN_PLAN_MODEL).trim()
        : "";
      const anthropicModelEnv = process.env.ANTHROPIC_MODEL && String(process.env.ANTHROPIC_MODEL).trim()
        ? String(process.env.ANTHROPIC_MODEL).trim()
        : "";
      const planModel = typeof payload.planModel === "string" && payload.planModel.trim()
        ? payload.planModel.trim()
        : (planModelEnv || (planProvider === "anthropic" ? (anthropicModelEnv || "claude-sonnet-4-5") : "gpt-4o-mini"));

      const rewriteModelEnv = process.env.BOOKGEN_REWRITE_MODEL && String(process.env.BOOKGEN_REWRITE_MODEL).trim()
        ? String(process.env.BOOKGEN_REWRITE_MODEL).trim()
        : "";
      const rewriteModel = typeof payload.rewriteModel === "string" && payload.rewriteModel.trim()
        ? payload.rewriteModel.trim()
        : (rewriteModelEnv || (rewriteProvider === "anthropic" ? (anthropicModelEnv || "claude-sonnet-4-5") : "gpt-4o-mini"));

      // Fail loudly (no silent provider fallback).
      if (planProvider === "openai") requireOpenAiKey();
      if (planProvider === "anthropic") requireAnthropicKey();
      if (rewriteProvider === "openai") requireOpenAiKey();
      if (rewriteProvider === "anthropic") requireAnthropicKey();

      const escapeJsonForLog = (obj) => {
        try {
          return JSON.stringify(obj, null, 2);
        } catch {
          return String(obj);
        }
      };

      const BOOKGEN_PROMPT_PLAN_SYSTEM = `You are planning microheadings, Verdieping (deepening) boxes, and Praktijk ("In de praktijk") boxes for a Dutch MBO N3 textbook chapter.

You decide, BEFORE writing happens:
1) MICRO-HEADINGS: short topic labels above selected body text blocks (for scannability).
2) VERDIEPING selection: choose EXISTING units (do NOT inject new content). Selected units will be moved into Verdieping boxes.
3) PRAKTIJK selection: choose units that should receive a NEW "In de praktijk" box (a short realistic scenario). The box is additional (do NOT move the unit).

MICRO-HEADING RULES:
- Select only ~30-40% of the micro_heading_candidates (spread them evenly).
- Dutch, 2–4 words, no colon, no punctuation, no quotes, no markers.
- Must be a TOPIC LABEL, not the start of a sentence.
  - GOOD: "Functies van [onderwerp]", "De [onderwerp]", "Kenmerken en eigenschappen"
  - BAD: "Een [onderwerp] is een" (sentence fragment - never start with "Een")
  - BAD: "[Onderwerp] uitleg" (generic word "uitleg")
- Do NOT use generic filler words: uitleg, beschrijving, informatie, overzicht, introductie, tekst.
- Do NOT choose a micro-heading that duplicates the existing subsection title (candidates include subsection context; avoid repeating it).
- Do NOT assign micro-headings to units you select as Verdieping.

VERDIEPING RULES:
- Choose between targets.verdieping_range.min and targets.verdieping_range.max units.
- Select units that are MORE complex relative to the rest (mechanisms, multi-step processes, technical depth).
- Spread them out (avoid adjacent units; avoid the very first unit).

PRAKTIJK RULES:
- Choose between targets.praktijk_range.min and targets.praktijk_range.max units.
- Select units where a realistic scenario would help a student apply the concept (actions, observations, communication, safety, documentation).
- Spread them out (avoid adjacent units; avoid the very first unit).
- Do NOT select units that you select as Verdieping.

Return STRICT JSON ONLY:
{
  "micro_headings": [{"unit_id":"...","title":"..."}],
  "verdieping_unit_ids": ["..."],
  "praktijk_unit_ids": ["..."],
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
     <<BOLD_START>>, <<BOLD_END>>
   - Do NOT output ANY other <<...>> markers. In particular, never output <<term>>.
   - Preserve any existing <<BOLD_START>>...<<BOLD_END>> spans from the facts exactly as-is.
   - Do NOT invent new bold spans.
7. MICRO-HEADINGS: Do NOT output any <<MICRO_TITLE>> markers. Headings are handled by the renderer.

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

      const BOOKGEN_PROMPT_PRAKTIJK_GENERATE_SYSTEM = `You are generating "In de praktijk" boxes for a Dutch MBO N3 nursing textbook.

Input JSON includes a list of units. For each unit, you must write ONE short, realistic practice scenario that helps a student apply the concept.

Hard requirements (apply to EVERY box):
- Dutch, MBO N3.
- Length: 4–7 sentences, single paragraph.
- Perspective: Use "je".
- Always refer to the person as "zorgvrager".
- Do NOT add headings/titles.
- Do NOT start with "In de praktijk:" (layout handles it).
- Do NOT use bullets or numbered steps. Write as normal prose.
- Do NOT use any HTML tags.
- Allowed markers ONLY: <<BOLD_START>>, <<BOLD_END>> (optional). Do NOT output any other <<...>> markers.
- If you use bold markers, use at most ONE bold span per box and only for a key term that appears in the input facts.

Also: Vary the opening line across boxes (avoid repeating the same template).

Return STRICT JSON ONLY:
{
  "praktijk": { "unit_id": "text", "...": "..." },
  "notes": "..."
}`;

      const normalizeWs = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const stripHtml = (s) => normalizeWs(String(s || "").replace(/<\s*br\b[^>]*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
      const words = (s) => stripHtml(s).split(/\s+/).filter(Boolean);
      const wordCount = (s) => words(s).length;

      const toFacts = (raw, { maxFacts = 12 } = {}) => {
        const t = stripHtml(raw);
        if (!t) return [];
        // Split by sentence-ish boundaries, keep short.
        const parts = t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
        if (parts.length <= 1) return [t];
        return parts.slice(0, maxFacts);
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
        let resp;
        try {
          resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${requireOpenAiKey()}`,
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
        } catch (e) {
          const cause = e && typeof e === "object" ? e.cause : null;
          const code = cause && typeof cause === "object" ? cause.code : "";
          const syscall = cause && typeof cause === "object" ? cause.syscall : "";
          const hostname = cause && typeof cause === "object" ? cause.hostname : "";
          const hint = [code, syscall, hostname].filter(Boolean).join(" ");
          throw new Error(`OpenAI fetch failed: ${hint || "fetch failed"}`);
        }
        const text = await resp.text().catch(() => "");
        if (!resp.ok) {
          // OpenAI may echo the (invalid) key in the error message. Never leak secrets to logs.
          if ((resp.status === 401 || resp.status === 403) && /invalid_api_key|incorrect api key/i.test(text)) {
            throw new Error("BLOCKED: OPENAI_API_KEY is invalid. Rotate the key and set OPENAI_API_KEY before running BookGen Pro.");
          }
          throw new Error(`OpenAI failed (${resp.status}): ${redactSecrets(text).slice(0, 800)}`);
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
        let resp;
        try {
          resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${requireOpenAiKey()}`,
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
        } catch (e) {
          const cause = e && typeof e === "object" ? e.cause : null;
          const code = cause && typeof cause === "object" ? cause.code : "";
          const syscall = cause && typeof cause === "object" ? cause.syscall : "";
          const hostname = cause && typeof cause === "object" ? cause.hostname : "";
          const hint = [code, syscall, hostname].filter(Boolean).join(" ");
          throw new Error(`OpenAI fetch failed: ${hint || "fetch failed"}`);
        }
        const text = await resp.text().catch(() => "");
        if (!resp.ok) {
          // OpenAI may echo the (invalid) key in the error message. Never leak secrets to logs.
          if ((resp.status === 401 || resp.status === 403) && /invalid_api_key|incorrect api key/i.test(text)) {
            throw new Error("BLOCKED: OPENAI_API_KEY is invalid. Rotate the key and set OPENAI_API_KEY before running BookGen Pro.");
          }
          throw new Error(`OpenAI failed (${resp.status}): ${redactSecrets(text).slice(0, 800)}`);
        }
        const j = safeJsonParse(text);
        const content = j?.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new Error("OpenAI returned empty content");
        }
        return content;
      }

      async function anthropicText({ system, user, model, temperature, maxTokens }) {
        let resp;
        try {
          resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": requireAnthropicKey(),
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
        } catch (e) {
          const cause = e && typeof e === "object" ? e.cause : null;
          const code = cause && typeof cause === "object" ? cause.code : "";
          const syscall = cause && typeof cause === "object" ? cause.syscall : "";
          const hostname = cause && typeof cause === "object" ? cause.hostname : "";
          const hint = [code, syscall, hostname].filter(Boolean).join(" ");
          throw new Error(`Anthropic fetch failed: ${hint || "fetch failed"}`);
        }
        const text = await resp.text().catch(() => "");
        if (!resp.ok) {
          throw new Error(`Anthropic failed (${resp.status}): ${redactSecrets(text).slice(0, 800)}`);
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

      async function anthropicJson({ system, user, model, temperature, maxTokens }) {
        const raw = await anthropicText({ system, user, model, temperature, maxTokens });
        const t = String(raw || "").trim();
        // Strip common ```json fences if present (deterministic).
        const unfenced = t
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        const parsed = safeJsonParse(unfenced);
        if (parsed) return parsed;

        // Deterministic repair: models sometimes insert hard newlines inside string literals
        // or add trailing "reasoning" text after the JSON object. We repair both cases safely.
        const normalizeJsonStringLiterals = (rawText) => {
          const s = String(rawText || "");
          let out = "";
          let inStr = false;
          let esc = false;
          for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (esc) {
              out += ch;
              esc = false;
              continue;
            }
            if (ch === "\\") {
              out += ch;
              if (inStr) esc = true;
              continue;
            }
            if (ch === "\"") {
              out += ch;
              inStr = !inStr;
              continue;
            }
            if (inStr && (ch === "\n" || ch === "\r")) continue;
            out += ch;
          }
          return out.trim();
        };

        const extractFirstJsonObject = (rawText) => {
          const s = String(rawText || "");
          const start = s.indexOf("{");
          if (start < 0) return null;
          let depth = 0;
          let inStr = false;
          let esc = false;
          for (let i = start; i < s.length; i++) {
            const ch = s[i];
            if (esc) {
              esc = false;
              continue;
            }
            if (ch === "\\") {
              if (inStr) esc = true;
              continue;
            }
            if (ch === "\"") {
              inStr = !inStr;
              continue;
            }
            if (!inStr) {
              if (ch === "{") depth++;
              if (ch === "}") {
                depth--;
                if (depth === 0) return s.slice(start, i + 1).trim();
              }
            }
          }
          return null;
        };

        const normalized = normalizeJsonStringLiterals(unfenced);
        const parsed2 = safeJsonParse(normalized);
        if (parsed2) return parsed2;

        const extracted = extractFirstJsonObject(normalized);
        if (extracted) {
          const parsed3 = safeJsonParse(extracted);
          if (parsed3) {
            console.warn("[book-worker] [warn] Anthropic JSON required extraction/repair; tighten the prompt if this repeats.");
            return parsed3;
          }
        }

        throw new Error(`Anthropic returned non-JSON: ${unfenced.slice(0, 800)}`);
      }

      const pickChapter = (canon, idx) => {
        const chapters = Array.isArray(canon?.chapters) ? canon.chapters : [];
        if (typeof idx !== "number") return null;
        return chapters[idx] || null;
      };

      const bookTitle = String(assembled?.meta?.title || bookId);

      // For full-book runs, process all chapters sequentially and assemble back into a single canonical
      // so we can render one continuous PDF (page numbers/headers consistent).
      const assembledClone = JSON.parse(JSON.stringify(assembled));
      const chaptersAll = Array.isArray(assembledClone?.chapters) ? assembledClone.chapters : [];
      const chaptersToProcess = target === "chapter"
        ? [{ chapterIndex, chapter: pickChapter(assembledClone, chapterIndex) }]
        : chaptersAll.map((ch, idx) => ({ chapterIndex: idx, chapter: ch }));
      if (target === "chapter") {
        if (typeof chapterIndex !== "number" || !Number.isFinite(chapterIndex)) {
          throw new Error("BookGen Pro requires a valid chapterIndex for chapter target");
        }
        if (!chaptersToProcess[0]?.chapter) {
          throw new Error(`BookGen Pro: chapterIndex ${chapterIndex} not found`);
        }
      }
      if (target === "book" && chaptersAll.length === 0) {
        throw new Error("BookGen Pro: no chapters found for book target");
      }

      const chaptersTotal = chaptersToProcess.length;
      for (let chapterOrdinal = 0; chapterOrdinal < chaptersToProcess.length; chapterOrdinal++) {
        const entry = chaptersToProcess[chapterOrdinal];
        const chapterIndex = entry.chapterIndex;
        const chapter = entry.chapter;

        // For full-book BookGen Pro runs, keep progress monotonic across chapters.
        // This avoids percent "resetting" back to ~5% for every chapter, which looks like a stall.
        const reportBookgenProgress = async ({ stage, percent, message }) => {
          if (target !== "book") {
            return reportProgress({ stage, percent, message });
          }
          const per = typeof percent === "number" && Number.isFinite(percent) ? percent : 0;
          const perClamped = Math.max(0, Math.min(72, Math.round(per)));
          const normalized = perClamped / 72;
          const denom = chaptersTotal || 1;
          const frac = (chapterOrdinal + normalized) / denom;
          // Map to 1..80 for the whole bookgen phase.
          const bookPct = Math.max(1, Math.min(80, 1 + Math.round(frac * 79)));
          const prefix = `Ch ${chapterOrdinal + 1}/${chaptersTotal}`;
          const msg2 = message ? `${prefix} — ${message}` : prefix;
          return reportProgress({ stage, percent: bookPct, message: msg2 });
        };

      // Build rewrite units from canonical blocks in this chapter.
      // Key goal: rewrite list/steps blocks into natural prose so extraction artifacts like
      // dangling "zoals:" + 1-bullet lists don't appear in the final PDF.
      const units = [];
      const compositeByIntroId = new Map(); // paragraphId -> { removeBlockIds: string[] }

      const normalizeForIntroCheck = (raw) => stripHtml(raw).replace(/<<BOLD_START>>|<<BOLD_END>>/g, "").trim();
      const looksLikeIntroForList = (basis) => {
        const t = normalizeForIntroCheck(basis);
        if (!t) return false;
        // Common pattern: explicit list-intro punctuation.
        if (t.endsWith(":")) return true;
        // Common extraction pattern: a short intro sentence followed by one or more list blocks.
        // Example: "In je DNA zitten vier soorten basen. Basen zijn kleine bouwstenen van DNA."
        // followed by multiple list blocks that together contain the actual items.
        const wc = wordCount(t);
        return wc > 0 && wc <= 22;
      };

      const collectUnitsFromBlocks = (blocks, ctx) => {
        if (!Array.isArray(blocks)) return;
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (!b || typeof b !== "object") continue;
          const t = typeof b.type === "string" ? b.type : "";

          if (t === "subparagraph") {
            const title = typeof b.title === "string" ? b.title : "";
            const next = {
              section: ctx.section,
              subsection: title ? (ctx.subsection ? `${ctx.subsection} / ${title}` : title) : ctx.subsection,
            };
            collectUnitsFromBlocks(b.content || b.blocks || b.items, next);
            continue;
          }

          if (t === "paragraph" && typeof b.id === "string" && typeof b.basis === "string") {
            const pid = b.id;
            const basis = b.basis;

            // Composite: intro paragraph (ends with ":") followed by one or more list/steps blocks.
            const nextBlock = blocks[i + 1];
            const nextType = typeof nextBlock?.type === "string" ? nextBlock.type : "";
            if (looksLikeIntroForList(basis) && (nextType === "list" || nextType === "steps")) {
              const following = [];
              const removeIds = [];
              let j = i + 1;
              while (j < blocks.length) {
                const nb = blocks[j];
                if (!nb || typeof nb !== "object") break;
                const nt = typeof nb.type === "string" ? nb.type : "";
                if (nt !== "list" && nt !== "steps") break;
                const nid = typeof nb.id === "string" ? nb.id : "";
                if (nid) removeIds.push(nid);
                following.push({
                  type: nt,
                  id: nid,
                  ordered: nb.ordered === true,
                  level: typeof nb.level === "number" ? nb.level : null,
                  items: Array.isArray(nb.items) ? nb.items.filter((x) => typeof x === "string") : [],
                });
                j++;
              }

              const combinedText = [basis, ...following.flatMap((x) => x.items || [])].join(" ");

              units.push({
                unit_id: pid,
                kind: "composite_list",
                section: ctx.section,
                subsection: ctx.subsection,
                order: units.length + 1,
                approx_words: wordCount(combinedText),
                preview: stripHtml(combinedText).slice(0, 220),
                text: combinedText,
                intro_basis: basis,
                following_blocks: following,
                remove_block_ids: removeIds,
              });
              if (removeIds.length) compositeByIntroId.set(pid, { removeBlockIds: removeIds });

              // Also rewrite any existing Praktijk/Verdieping box content attached to this paragraph.
              const praktijk = typeof b.praktijk === "string" ? b.praktijk : "";
              if (praktijk && praktijk.trim()) {
                units.push({
                  unit_id: `praktijk:${pid}`,
                  kind: "praktijk",
                  paragraph_id: pid,
                  section: ctx.section,
                  subsection: ctx.subsection,
                  order: units.length + 1,
                  approx_words: wordCount(praktijk),
                  preview: stripHtml(praktijk).slice(0, 220),
                  text: praktijk,
                  praktijk,
                });
              }
              const verdExisting = typeof b.verdieping === "string" ? b.verdieping : "";
              if (verdExisting && verdExisting.trim()) {
                units.push({
                  unit_id: `verdieping:${pid}`,
                  kind: "verdieping_existing",
                  paragraph_id: pid,
                  section: ctx.section,
                  subsection: ctx.subsection,
                  order: units.length + 1,
                  approx_words: wordCount(verdExisting),
                  preview: stripHtml(verdExisting).slice(0, 220),
                  text: verdExisting,
                  verdieping: verdExisting,
                });
              }

              i = j - 1; // skip the list/steps blocks consumed by this composite
              continue;
            }

            units.push({
              unit_id: pid,
              kind: "paragraph",
              section: ctx.section,
              subsection: ctx.subsection,
              order: units.length + 1,
              approx_words: wordCount(basis),
              preview: stripHtml(basis).slice(0, 220),
              text: basis,
              basis,
            });

            // Also rewrite any existing Praktijk/Verdieping box content attached to this paragraph.
            const praktijk = typeof b.praktijk === "string" ? b.praktijk : "";
            if (praktijk && praktijk.trim()) {
              units.push({
                unit_id: `praktijk:${pid}`,
                kind: "praktijk",
                paragraph_id: pid,
                section: ctx.section,
                subsection: ctx.subsection,
                order: units.length + 1,
                approx_words: wordCount(praktijk),
                preview: stripHtml(praktijk).slice(0, 220),
                text: praktijk,
                praktijk,
              });
            }
            const verdExisting = typeof b.verdieping === "string" ? b.verdieping : "";
            if (verdExisting && verdExisting.trim()) {
              units.push({
                unit_id: `verdieping:${pid}`,
                kind: "verdieping_existing",
                paragraph_id: pid,
                section: ctx.section,
                subsection: ctx.subsection,
                order: units.length + 1,
                approx_words: wordCount(verdExisting),
                preview: stripHtml(verdExisting).slice(0, 220),
                text: verdExisting,
                verdieping: verdExisting,
              });
            }
            continue;
          }

          if ((t === "list" || t === "steps") && typeof b.id === "string") {
            const id = b.id;
            const items = Array.isArray(b.items) ? b.items.filter((x) => typeof x === "string") : [];
            const combinedText = items.join(" ");
            units.push({
              unit_id: id,
              kind: t,
              section: ctx.section,
              subsection: ctx.subsection,
              order: units.length + 1,
              approx_words: wordCount(combinedText),
              preview: stripHtml(combinedText).slice(0, 220),
              text: combinedText,
              items,
            });
            continue;
          }

          // fallback recursion
          if (Array.isArray(b.content)) collectUnitsFromBlocks(b.content, ctx);
          if (Array.isArray(b.blocks)) collectUnitsFromBlocks(b.blocks, ctx);
          if (Array.isArray(b.items)) collectUnitsFromBlocks(b.items, ctx);
        }
      };

      const sections = Array.isArray(chapter?.sections) ? chapter.sections : [];
      if (sections.length) {
        for (const s of sections) {
          const sectionTitle = typeof s?.title === "string" ? s.title : "";
          collectUnitsFromBlocks(s?.content, { section: sectionTitle, subsection: "" });
        }
      } else {
        const chTitle = typeof chapter?.title === "string" ? chapter.title : "";
        collectUnitsFromBlocks(
          chapter?.content || chapter?.blocks || chapter?.items,
          { section: chTitle || `Hoofdstuk ${chapterIndex + 1}`, subsection: "" },
        );
      }

      if (units.length === 0) {
        if (target === "chapter") throw new Error("No rewriteable units found to rewrite");
        continue;
      }

      const planUnits = units.filter((u) => u && (u.kind === "paragraph" || u.kind === "composite_list"));
      const avgWords = Math.round(planUnits.reduce((acc, u) => acc + (u.approx_words || 0), 0) / Math.max(1, planUnits.length));

      const existingPraktijkParagraphIds = new Set(
        units
          .filter((u) => u && u.kind === "praktijk")
          .map((u) => {
            if (typeof u.paragraph_id === "string" && u.paragraph_id) return u.paragraph_id;
            const uid = typeof u.unit_id === "string" ? u.unit_id : "";
            return uid.startsWith("praktijk:") ? uid.slice("praktijk:".length) : "";
          })
          .filter((x) => typeof x === "string" && x),
      );

      // Candidate thresholds aligned with the legacy PASS2 planning heuristics.
      const microCandidates = planUnits
        .filter((u) => (u.approx_words || 0) >= 55)
        .map((u) => ({
          unit_id: u.unit_id,
          order: u.order,
          section: u.section,
          subsection: u.subsection,
          approx_words: u.approx_words,
          preview: u.preview,
        }));
      const verdiepingCandidates = planUnits
        .filter((u) => (u.approx_words || 0) >= 55)
        .map((u) => ({
          unit_id: u.unit_id,
          order: u.order,
          section: u.section,
          subsection: u.subsection,
          approx_words: u.approx_words,
          preview: u.preview,
        }));

      const praktijkCandidates = planUnits
        .filter((u) => !existingPraktijkParagraphIds.has(u.unit_id))
        .filter((u) => (u.approx_words || 0) >= 40)
        .map((u) => ({
          unit_id: u.unit_id,
          order: u.order,
          section: u.section,
          subsection: u.subsection,
          approx_words: u.approx_words,
          preview: u.preview,
        }));

      // Target more Verdieping boxes (legacy output had many across a chapter).
      const verdTargetMin = Math.min(24, Math.max(8, Math.round(planUnits.length * 0.15)));
      const verdTargetMax = Math.min(30, Math.max(verdTargetMin, Math.round(planUnits.length * 0.25)));

      // Target a handful of Praktijk boxes per chapter (range scaled by unit count, then clamped by candidates).
      const praktTargetMinBase = Math.min(4, Math.max(1, Math.round(planUnits.length * 0.03)));
      const praktTargetMaxBase = Math.min(6, Math.max(praktTargetMinBase, Math.round(planUnits.length * 0.05)));
      const praktTargetMin = Math.min(praktijkCandidates.length, praktTargetMinBase);
      const praktTargetMax = Math.min(praktijkCandidates.length, praktTargetMaxBase);

      const planInput = {
        book_title: bookTitle,
        avg_words_per_unit: avgWords,
        micro_heading_candidates: microCandidates,
        verdieping_candidates: verdiepingCandidates,
        praktijk_candidates: praktijkCandidates,
        targets: {
          micro_heading_ratio: { min: 0.3, max: 0.4 },
          verdieping_range: { min: verdTargetMin, max: verdTargetMax },
          praktijk_range: { min: praktTargetMin, max: praktTargetMax },
        },
      };

      await reportBookgenProgress({ stage: "bookgen:plan", percent: 5, message: "BookGen Pro: planning microheadings & verdieping…" }).catch(() => {});

      const plan = planProvider === "anthropic"
        ? await withRetries(() => anthropicJson({
          system: BOOKGEN_PROMPT_PLAN_SYSTEM,
          user: `INPUT JSON:\n${JSON.stringify(planInput)}`,
          model: planModel,
          temperature: 0.2,
          maxTokens: 4000,
        }), { attempts: 3 })
        : await withRetries(() => openaiChatJson({
          system: BOOKGEN_PROMPT_PLAN_SYSTEM,
          user: `INPUT JSON:\n${JSON.stringify(planInput)}`,
          model: planModel,
          temperature: 0.2,
          maxTokens: 4000,
        }), { attempts: 3 });

      const microHeadingsArr = Array.isArray(plan?.micro_headings) ? plan.micro_headings : [];
      const rawVerd = Array.isArray(plan?.verdieping_unit_ids) ? plan.verdieping_unit_ids : [];
      const rawPraktijk = Array.isArray(plan?.praktijk_unit_ids) ? plan.praktijk_unit_ids : [];

      const microMap = new Map();
      const microAllowed = new Set(microCandidates.map((c) => c.unit_id));
      const microCandidateById = new Map(microCandidates.map((c) => [c.unit_id, c]));

      const normalizeTitleKey = (raw) =>
        String(raw || "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim();

      const sanitizeMicroTitle = (raw) => {
        let t = String(raw || "").trim();
        if (!t) return null;
        // Trim surrounding punctuation (commas/colons/etc) and collapse whitespace.
        t = t.replace(/^[\p{P}\p{S}\s]+/gu, "").replace(/[\p{P}\p{S}\s]+$/gu, "").replace(/\s+/g, " ").trim();
        if (!t) return null;
        // Enforce 2–4 words max (legacy rule).
        const toks = t.split(/\s+/).filter(Boolean);
        if (toks.length < 2) return null;
        const short = toks.slice(0, 4).join(" ");
        return short.charAt(0).toUpperCase() + short.slice(1);
      };

      const usedMicroTitles = new Set();
      for (const mh of microHeadingsArr) {
        const uid = mh?.unit_id;
        const titleRaw = mh?.title;
        if (typeof uid !== "string" || !microAllowed.has(uid) || typeof titleRaw !== "string") continue;
        const title = sanitizeMicroTitle(titleRaw);
        if (!title) continue;

        // Avoid duplicating the existing subsection title (prevents "De mitochondriën" heading + "Mitochondriën ..." duplication).
        const cand = microCandidateById.get(uid);
        const subsection = typeof cand?.subsection === "string" ? cand.subsection : "";
        const lastSub = subsection.includes(" / ") ? subsection.split(" / ").pop() : subsection;
        if (lastSub && normalizeTitleKey(title) === normalizeTitleKey(lastSub)) continue;

        // De-dupe identical micro titles across the chapter (case-insensitive).
        const key = normalizeTitleKey(title);
        if (usedMicroTitles.has(key)) continue;
        usedMicroTitles.add(key);
        microMap.set(uid, title);
      }

      // Safety cap: keep micro headings to ~40% of candidates (legacy behavior).
      const microMax = Math.max(0, Math.round(microCandidates.length * 0.4));
      if (microMax > 0 && microMap.size > microMax) {
        const orderOf = (uid) => microCandidateById.get(uid)?.order ?? 999999;
        const kept = Array.from(microMap.entries())
          .sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
          .slice(0, microMax);
        microMap.clear();
        kept.forEach(([uid, title]) => microMap.set(uid, title));
      }

      // Determine verdieping selection with simple deterministic trimming.
      const verdAllowed = new Set(verdiepingCandidates.map((c) => c.unit_id));
      const verdSet = new Set(rawVerd.map((x) => String(x || "").trim()).filter((id) => !!id && verdAllowed.has(id)));
      // Cap max
      const verdMax = verdTargetMax;
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
      const verdMin = verdTargetMin;
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

      // Determine praktijk selection with simple deterministic trimming.
      const praktAllowed = new Set(praktijkCandidates.map((c) => c.unit_id));
      const praktCandidateById = new Map(praktijkCandidates.map((c) => [c.unit_id, c]));
      const praktijkSet = new Set(
        rawPraktijk
          .map((x) => String(x || "").trim())
          .filter((id) => !!id && praktAllowed.has(id) && !verdSet.has(id) && !existingPraktijkParagraphIds.has(id)),
      );

      // Cap max
      const praktMax = praktTargetMax;
      if (praktijkSet.size > praktMax) {
        const kept = Array.from(praktijkSet)
          .sort((a, b) => (praktCandidateById.get(a)?.order ?? 999999) - (praktCandidateById.get(b)?.order ?? 999999))
          .slice(0, praktMax);
        praktijkSet.clear();
        kept.forEach((id) => praktijkSet.add(id));
      }
      // Ensure min
      const praktMin = praktTargetMin;
      if (praktijkSet.size < praktMin) {
        const candidates = praktijkCandidates
          .map((c) => c.unit_id)
          .filter((id) => !praktijkSet.has(id) && !verdSet.has(id) && !existingPraktijkParagraphIds.has(id))
          .sort((a, b) => {
            const aw = praktCandidateById.get(a)?.approx_words ?? 0;
            const bw = praktCandidateById.get(b)?.approx_words ?? 0;
            if (bw !== aw) return bw - aw;
            return a.localeCompare(b);
          });
        for (const id of candidates) {
          praktijkSet.add(id);
          if (praktijkSet.size >= praktMin) break;
        }
      }

      const skeleton = {
        generatedAt: new Date().toISOString(),
        bookId,
        bookVersionId,
        target,
        chapterIndex,
        planProvider,
        planModel,
        rewriteProvider,
        rewriteModel,
        avgWordsPerUnit: avgWords,
        units: units.map((u) => ({
          unit_id: u.unit_id,
          kind: u.kind,
          order: u.order,
          section: u.section,
          subsection: u.subsection,
          approx_words: u.approx_words,
          preview: u.preview,
          ...(u.kind === "composite_list" ? { remove_block_ids: u.remove_block_ids } : {}),
        })),
        microHeadings: Array.from(microMap.entries()).map(([unit_id, title]) => ({ unit_id, title })),
        verdiepingUnitIds: Array.from(verdSet),
        praktijkUnitIds: Array.from(praktijkSet),
        notes: typeof plan?.notes === "string" ? plan.notes : "",
      };

      const skeletonBuf = Buffer.from(JSON.stringify(skeleton, null, 2), "utf-8");
      bookgenArtifacts.push({
        kind: "debug",
        ...(await uploadArtifact({
          orgId,
          jobId,
          fileName: fileNameForAttempt(target === "book" ? `skeleton.ch${chapterIndex}.json` : "skeleton.json"),
          buf: skeletonBuf,
          contentType: "application/json",
        })),
        chapterIndex,
      });

      await reportBookgenProgress({ stage: "bookgen:rewrite", percent: 12, message: `BookGen Pro: rewriting ${units.length} unit(s)…` }).catch(() => {});

      const rewrittenById = new Map();
      const verdiepingById = new Map();
      const praktijkByParagraphId = new Map();
      const verdiepingExistingByParagraphId = new Map();

      const INSTRUCTION_COMPOSITE_LIST = `This is a composite list block (Intro + Items).
    Write this in the most natural N3 style.
    Option A: A running paragraph (if items are explanatory).
    Option B: A single sentence list with commas + "en" for the last item (if items are short/parallel). Use semicolons ONLY if items are long phrases.

    Content Level: MBO N3 (Vocational).
    CRITICAL: SIMPLIFY complex theory into accessible explanations.
    Constraint: Do NOT split the intro from the content. It must be ONE coherent text block.

    IMPORTANT: Preserve any <<BOLD_START>>...<<BOLD_END>> spans exactly as they appear in the facts. Do NOT invent any new markers.
    IMPORTANT: Do NOT output bullets (•) or numbered list formatting. Write as normal prose, or as a single sentence with commas.
    IMPORTANT: If the intro implies multiple items (e.g. "meerdere", "verschillende", "zoals:"), but the facts contain only one item, rewrite into a natural singular sentence and remove any dangling "zoals:".`;

      const INSTRUCTION_LIST_ONLY = `This is a list block (Items).
    Write this in the most natural N3 style.
    Option A: A running paragraph (if items are explanatory).
    Option B: A single sentence list with commas + "en" for the last item (if items are short/parallel). Use semicolons ONLY if items are long phrases.

    Content Level: MBO N3 (Vocational).
    CRITICAL: SIMPLIFY complex theory into accessible explanations.

    IMPORTANT: Preserve any <<BOLD_START>>...<<BOLD_END>> spans exactly as they appear in the facts. Do NOT invent any new markers.
    IMPORTANT: Do NOT output bullets (•) or numbered list formatting. Write as normal prose, or as a single sentence with commas.
    IMPORTANT: Do NOT invent counts/claims that are not supported by the items (e.g., do not write "vier" if you only have two items).`;

      const INSTRUCTION_PRAKTIJK_BOX = `This is an "In de praktijk" box (practice scenario).
    Task: Rewrite AND expand into ONE realistic scenario for MBO N3.
    Length: 4–7 sentences, single paragraph.
    Perspective: Use "je". Always refer to the person as "zorgvrager".

    IMPORTANT: Do NOT start with a title/heading like "Uitdroging herkennen".
    Start immediately with the scenario text.
    Do NOT use any HTML tags.

    Keep it concrete: add 2–3 specific actions/observations that fit the topic.
    Do NOT add labels like "In de praktijk:" (layout handles it).
    Preserve any existing <<BOLD_START>>...<<BOLD_END>> spans exactly as they appear in the facts. Do NOT invent new markers.`;

      const INSTRUCTION_VERDIEPING_EXISTING = `This is existing "Verdieping" box text.
    Task: Rewrite AND expand slightly (more context) while staying MBO N3.
    Length: 3–6 sentences, single paragraph.

    IMPORTANT: Do NOT start with a title/heading like "De celmembraan".
    Start immediately with the content.
    Do NOT use any HTML tags.

    Do NOT add labels like "Verdieping:" (layout handles it).
    Preserve any existing <<BOLD_START>>...<<BOLD_END>> spans exactly as they appear in the facts. Do NOT invent new markers.`;

      const factsFromItems = (items, { maxFacts = 24 } = {}) => {
        const out = [];
        const list = Array.isArray(items) ? items : [];
        for (const it of list) {
          if (typeof it !== "string" || !it.trim()) continue;
          const fs = toFacts(it, { maxFacts: 8 });
          for (const f of fs) {
            out.push(f);
            if (out.length >= maxFacts) return out;
          }
        }
        return out;
      };

      const factsForUnit = (u) => {
        if (!u || typeof u !== "object") return [];
        if (u.kind === "paragraph") return toFacts(u.basis, { maxFacts: 12 });
        if (u.kind === "list" || u.kind === "steps") return factsFromItems(u.items, { maxFacts: 24 });
        if (u.kind === "praktijk") return toFacts(u.praktijk || u.text, { maxFacts: 12 });
        if (u.kind === "verdieping_existing") return toFacts(u.verdieping || u.text, { maxFacts: 12 });
        if (u.kind === "composite_list") {
          const intro = toFacts(u.intro_basis, { maxFacts: 6 });
          const allItems = [];
          const blocks = Array.isArray(u.following_blocks) ? u.following_blocks : [];
          for (const lb of blocks) {
            const items = Array.isArray(lb?.items) ? lb.items : [];
            for (const it of items) allItems.push(it);
          }
          const itemsFacts = factsFromItems(allItems, { maxFacts: 24 });
          return [...intro, ...itemsFacts].slice(0, 30);
        }
        return [];
      };

      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const isVerd = (u.kind === "paragraph" || u.kind === "composite_list") && verdSet.has(u.unit_id);
        const micro = (u.kind === "paragraph" || u.kind === "composite_list") ? (microMap.get(u.unit_id) || null) : null;

        const instruction = u.kind === "praktijk"
          ? INSTRUCTION_PRAKTIJK_BOX
          : (u.kind === "verdieping_existing"
              ? INSTRUCTION_VERDIEPING_EXISTING
              : (isVerd
                  ? `This block is classified as **Verdieping** (Deepening) - more advanced detail.
    
    IMPORTANT: Do NOT start with a title/heading line.
    Start immediately with the content.
    
    CRITICAL: The input facts may be LIST FRAGMENTS (starting with lowercase verbs). You MUST:
    1. First INTRODUCE what subject these facts are about (use the section context).
    2. Then explain each fact as a COMPLETE, STANDALONE sentence.
    
    BAD: "zorgen dat X deelt. geven signalen aan Y."
    GOOD: "[Subject] heeft verschillende functies. Het zorgt ervoor dat X deelt. Ook geeft het signalen aan Y."
    
    Task: Rewrite into clear N3 Dutch with proper context and complete sentences.
    Style: Short sentences. Active voice.
    DO NOT write meta-introductions like: "In deze sectie...", "In dit hoofdstuk...", "Hier leer je...".
    Start directly with the content (the concept/mechanism), as if it's a normal textbook paragraph.
    Do NOT add any labels like "Verdieping:" (layout handles it).
    Do NOT use any HTML tags.`
                  : (u.kind === "composite_list"
                      ? INSTRUCTION_COMPOSITE_LIST
                      : (u.kind === "list" || u.kind === "steps")
                        ? INSTRUCTION_LIST_ONLY
                        : `Write a concise paragraph using these facts.
    Target Level: MBO N3 (Vocational).
    CRITICAL: SIMPLIFY complex details into accessible explanations.
    Style: Short sentences. Active voice. "Je" form.
    Preserve any existing <<BOLD_START>>...<<BOLD_END>> spans from the facts exactly as-is. Do NOT invent any new markers.`)));

        const microHint = micro
          ? `Micro-heading (already shown above your paragraph): "${micro}". Do NOT repeat this heading as the first words of the paragraph. Do NOT output any <<MICRO_TITLE>> markers.`
          : `Do NOT include any <<MICRO_TITLE>> markers in the output.`;

        const facts = factsForUnit(u);
        if (!facts.length) throw new Error(`No facts to rewrite for unit ${u.unit_id} (${u.kind || "unknown"})`);
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
          outText = await withRetries(
            () => anthropicText({ system: BOOKGEN_PROMPT_GENERATE_SYSTEM, user: userMsg, model: rewriteModel, temperature: 0.3, maxTokens: 1024 }),
            { attempts: 3 },
          );
        } else {
          outText = await withRetries(
            () => openaiChatText({ system: BOOKGEN_PROMPT_GENERATE_SYSTEM, user: userMsg, model: rewriteModel, temperature: 0.3, maxTokens: 1024 }),
            { attempts: 3 },
          );
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

        // If we output a box-lead span, ensure a space after it (avoid "...</span>Text" gluing).
        bodyText = bodyText.replace(/^(<span class="box-lead">[\s\S]*?<\/span>)(\S)/, "$1 $2");

        if (u.kind === "praktijk") {
          const pid = u.paragraph_id;
          if (typeof pid === "string" && pid) praktijkByParagraphId.set(pid, bodyText);
          continue;
        }
        if (u.kind === "verdieping_existing") {
          const pid = u.paragraph_id;
          if (typeof pid === "string" && pid) verdiepingExistingByParagraphId.set(pid, bodyText);
          continue;
        }

        if (isVerd) {
          verdiepingById.set(u.unit_id, bodyText);
        } else {
          rewrittenById.set(u.unit_id, bodyText);
        }

        if ((i + 1) % 5 === 0 || i === units.length - 1) {
          const pct = 12 + Math.round(((i + 1) / units.length) * 48);
          await reportBookgenProgress({ stage: "bookgen:rewrite", percent: pct, message: `BookGen Pro: rewritten ${i + 1}/${units.length}` }).catch(() => {});
        }
      }

      // Pass: generate Praktijk boxes (when missing from source canonical).
      const praktijkToGenerate = Array.from(praktijkSet).filter((pid) => typeof pid === "string" && pid && !praktijkByParagraphId.has(pid) && !verdSet.has(pid));
      if (praktijkToGenerate.length) {
        await reportBookgenProgress({
          stage: "bookgen:praktijk",
          percent: 60,
          message: `BookGen Pro: generating In de praktijk boxes (${praktijkToGenerate.length})…`,
        }).catch(() => {});

        const unitById = new Map(planUnits.map((u) => [u.unit_id, u]));
        const praktijkInput = {
          book_title: bookTitle,
          chapter_index: chapterIndex,
          units: praktijkToGenerate.map((pid) => {
            const u = unitById.get(pid) || units.find((x) => x && x.unit_id === pid) || {};
            const rewritten = rewrittenById.get(pid);
            const base = typeof rewritten === "string" && rewritten.trim()
              ? rewritten
              : (typeof u.basis === "string" && u.basis.trim() ? u.basis : (typeof u.text === "string" ? u.text : ""));
            const facts = toFacts(base, { maxFacts: 10 });
            return {
              unit_id: pid,
              section: u.section || "",
              subsection: u.subsection || "",
              basis_facts: facts,
            };
          }),
        };

        const praktijkOut = rewriteProvider === "anthropic"
          ? await withRetries(() => anthropicJson({
            system: BOOKGEN_PROMPT_PRAKTIJK_GENERATE_SYSTEM,
            user: `INPUT JSON:\n${JSON.stringify(praktijkInput)}`,
            model: rewriteModel,
            temperature: 0.3,
            maxTokens: 2200,
          }), { attempts: 3 })
          : await withRetries(() => openaiChatJson({
            system: BOOKGEN_PROMPT_PRAKTIJK_GENERATE_SYSTEM,
            user: `INPUT JSON:\n${JSON.stringify(praktijkInput)}`,
            model: rewriteModel,
            temperature: 0.3,
            maxTokens: 2200,
          }), { attempts: 3 });

        const praktijkMapRaw = praktijkOut && typeof praktijkOut === "object" ? praktijkOut.praktijk : null;
        if (!praktijkMapRaw || typeof praktijkMapRaw !== "object") {
          throw new Error("Praktijk generation returned invalid JSON (missing praktijk map)");
        }

        for (const pid of praktijkToGenerate) {
          const raw = typeof praktijkMapRaw[pid] === "string" ? praktijkMapRaw[pid] : "";
          const trimmed = String(raw || "").trim();
          if (!trimmed) continue;

          let bodyText = trimmed.replace(/^In\s+de\s+praktijk\s*:?\s*/i, "").trim();
          bodyText = bodyText
            .replace(/<<BOLD_START>>/g, "<strong>")
            .replace(/<<BOLD_END>>/g, "</strong>");
          bodyText = bodyText.replace(/^(<span class="box-lead">[\s\S]*?<\/span>)(\S)/, "$1 $2");

          praktijkByParagraphId.set(pid, bodyText);
        }

        const missing = praktijkToGenerate.filter((pid) => !praktijkByParagraphId.has(pid));
        if (missing.length) {
          throw new Error(`Praktijk generation missing output for ${missing.length}/${praktijkToGenerate.length} unit(s) (e.g. ${missing[0]})`);
        }
      }

      // Pass: hyphenation QA + fix (Claude Sonnet 4.5)
      // Goal: reduce awkward PDF hyphenation artifacts in narrow columns (e.g. cholesteroldeeltjes -> "deeltjes van cholesterol").
      const hyphenPassEnabled = String(process.env.BOOKGEN_HYPHEN_PASSES || "true").trim().toLowerCase() === "true";
      const hyphenProvider = String(process.env.BOOKGEN_HYPHEN_PROVIDER || "anthropic").trim().toLowerCase();
      if (hyphenPassEnabled && !["anthropic"].includes(hyphenProvider)) {
        throw new Error(`Invalid BOOKGEN_HYPHEN_PROVIDER: ${hyphenProvider}`);
      }
      const hyphenCheckModel = String(process.env.BOOKGEN_HYPHEN_CHECK_MODEL || "claude-sonnet-4-5-20250929").trim();
      const hyphenFixModel = String(process.env.BOOKGEN_HYPHEN_FIX_MODEL || "claude-sonnet-4-5-20250929").trim();
      if (hyphenPassEnabled && hyphenProvider === "anthropic") requireAnthropicKey();

      const stripTags = (s) => String(s || "").replace(/<[^>]*>/g, " ");
      const unique = (arr) => Array.from(new Set(arr));
      const findLongWords = (s) => unique((stripTags(s).match(/[\p{L}]{16,}/gu) || []).map((w) => String(w)));
      const findWeirdHyphen = (s) => unique((stripTags(s).match(/[\p{L}]{1,3}-[\p{L}]{3,}/gu) || []).map((w) => String(w)));
      const hasSoftHyphen = (s) => String(s || "").includes("\u00ad");

      const buildHyphenBlocks = () => {
        const blocks = [];
        for (const [id, text] of rewrittenById.entries()) {
          blocks.push({ block_id: `basis:${id}`, kind: "basis", text });
        }
        for (const [id, text] of verdiepingById.entries()) {
          blocks.push({ block_id: `verdieping:${id}`, kind: "verdieping", text });
        }
        for (const [pid, text] of praktijkByParagraphId.entries()) {
          blocks.push({ block_id: `praktijk:${pid}`, kind: "praktijk", text });
        }
        for (const [pid, text] of verdiepingExistingByParagraphId.entries()) {
          blocks.push({ block_id: `verdieping_existing:${pid}`, kind: "verdieping_existing", text });
        }
        return blocks;
      };

      // Use smaller batches to keep model output within strict JSON limits (avoid truncation).
      const hyphenBatchSize = 8;
      const hyphenIssuesAll = [];
      const hyphenFixedAll = {};
      if (hyphenPassEnabled) {
        await reportBookgenProgress({ stage: "bookgen:hyphen-check", percent: 62, message: "BookGen Pro: checking hyphenation risks…" }).catch(() => {});

        const allBlocks = buildHyphenBlocks();
        const candidates = allBlocks
          .map((b) => {
            const t = String(b.text || "");
            const longWords = findLongWords(t).slice(0, 6);
            const weirdHyphen = findWeirdHyphen(t).slice(0, 6);
            const soft = hasSoftHyphen(t);
            return {
              ...b,
              long_words: longWords,
              weird_hyphen: weirdHyphen,
              has_soft_hyphen: soft,
              excerpt: stripTags(t).replace(/\s+/g, " ").trim().slice(0, 220),
            };
          })
          .filter((b) => (b.long_words?.length || 0) > 0 || (b.weird_hyphen?.length || 0) > 0 || b.has_soft_hyphen);

        const HYPHEN_CHECK_SYSTEM = `You are a QA pass for Dutch textbook typography in narrow columns.

Problem:
- Long Dutch compound words can hyphenate awkwardly in PDFs (e.g. "cholesteroldeeltjes" might break as "cholesterold-eeltjes").

Task:
- For each block, decide if we should REWRITE the text slightly to avoid awkward hyphenation.
- Prefer rewriting long compounds into shorter phrases (e.g. "deeltjes van cholesterol") or splitting compounds into two words.
- Keep meaning the same and keep MBO N3 tone.

Return STRICT JSON ONLY (keep it short):
{
  "to_fix": ["basis:...", "praktijk:...", "..."],
  "notes": "..."
}`;

        const HYPHEN_FIX_SYSTEM = `You are fixing Dutch textbook text to avoid awkward PDF hyphenation in narrow columns.

Rules:
- Minimal edits. Keep meaning the same.
- Keep MBO N3 style (short sentences, clear words).
- Prefer replacing long compounds with short phrases (e.g. "deeltjes van cholesterol").
- Do NOT add headings/titles.
- Allowed HTML tags: ONLY <strong> and </strong> (may already exist). Do NOT add any other tags.

Return STRICT JSON ONLY:
{ "fixed": { "block_id": "corrected text", "...": "..." } }`;

        for (let offset = 0; offset < candidates.length; offset += hyphenBatchSize) {
          const batch = candidates.slice(offset, offset + hyphenBatchSize);
          const checkInput = {
            book_title: bookTitle,
            chapter_index: chapterIndex,
            blocks: batch.map((b) => ({
              block_id: b.block_id,
              kind: b.kind,
              long_words: b.long_words,
              weird_hyphen: b.weird_hyphen,
              has_soft_hyphen: b.has_soft_hyphen,
              excerpt: b.excerpt,
            })),
          };

          let checkOut = null;
          try {
            checkOut = hyphenProvider === "anthropic"
              ? await withRetries(
                () => anthropicJson({ system: HYPHEN_CHECK_SYSTEM, user: `INPUT JSON:\n${JSON.stringify(checkInput)}`, model: hyphenCheckModel, temperature: 0.2, maxTokens: 1200 }),
                { attempts: 3 },
              )
              : null;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Hyphenation is a best-effort QA pass; do NOT fail the entire book render if it flakes.
            console.warn(`[book-worker] Hyphen check failed (chapter=${chapterIndex} batchOffset=${offset}): ${msg}`);
            continue;
          }

          const toFixIds = (Array.isArray(checkOut?.to_fix) ? checkOut.to_fix : [])
            .map((x) => String(x || "").trim())
            .filter(Boolean);

          if (!toFixIds.length) continue;

          // Record issues even if some fixes fail (observability).
          for (const id of toFixIds) hyphenIssuesAll.push({ block_id: id });

          const blockById = new Map(batch.map((b) => [b.block_id, b]));
          const hyphenFixBatchSize = 2; // keep output JSON small to avoid truncation
          for (let j = 0; j < toFixIds.length; j += hyphenFixBatchSize) {
            const idsSlice = toFixIds.slice(j, j + hyphenFixBatchSize);

            const runFix = async (ids) => {
              const fixInput = {
                book_title: bookTitle,
                chapter_index: chapterIndex,
                blocks: ids.map((id) => ({
                  block_id: id,
                  kind: blockById.get(id)?.kind || "",
                  text: String(blockById.get(id)?.text || ""),
                  focus_tokens: (blockById.get(id)?.long_words || []).slice(0, 6),
                })),
              };
              return await withRetries(
                () => anthropicJson({ system: HYPHEN_FIX_SYSTEM, user: `INPUT JSON:\n${JSON.stringify(fixInput)}`, model: hyphenFixModel, temperature: 0.2, maxTokens: 3200 }),
                { attempts: 3 },
              );
            };

            let fixOut = null;
            try {
              fixOut = hyphenProvider === "anthropic" ? await runFix(idsSlice) : null;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              // If a multi-block fix fails, retry one-by-one (bounded).
              if (idsSlice.length > 1) {
                console.warn(`[book-worker] Hyphen fix failed (chapter=${chapterIndex} blocks=${idsSlice.length}) — retrying individually: ${msg}`);
                for (const singleId of idsSlice) {
                  try {
                    const singleOut = await runFix([singleId]);
                    const fixedSingle = singleOut && typeof singleOut === "object" ? singleOut.fixed : null;
                    if (fixedSingle && typeof fixedSingle === "object") {
                      for (const [block_id, newTextRaw] of Object.entries(fixedSingle)) {
                        const newText = String(newTextRaw || "").trim();
                        if (!block_id || !newText) continue;
                        hyphenFixedAll[block_id] = newText;
                        if (block_id.startsWith("basis:")) rewrittenById.set(block_id.slice("basis:".length), newText);
                        else if (block_id.startsWith("verdieping:")) verdiepingById.set(block_id.slice("verdieping:".length), newText);
                        else if (block_id.startsWith("praktijk:")) praktijkByParagraphId.set(block_id.slice("praktijk:".length), newText);
                        else if (block_id.startsWith("verdieping_existing:")) verdiepingExistingByParagraphId.set(block_id.slice("verdieping_existing:".length), newText);
                      }
                    }
                  } catch (e2) {
                    const msg2 = e2 instanceof Error ? e2.message : String(e2);
                    console.warn(`[book-worker] Hyphen fix failed (chapter=${chapterIndex} block=${singleId}): ${msg2}`);
                  }
                }
              } else {
                console.warn(`[book-worker] Hyphen fix failed (chapter=${chapterIndex} block=${idsSlice[0] || "unknown"}): ${msg}`);
              }
              continue;
            }

            const fixed = fixOut && typeof fixOut === "object" ? fixOut.fixed : null;
            if (!fixed || typeof fixed !== "object") continue;

            for (const [block_id, newTextRaw] of Object.entries(fixed)) {
              const newText = String(newTextRaw || "").trim();
              if (!block_id || !newText) continue;
              hyphenFixedAll[block_id] = newText;

              if (block_id.startsWith("basis:")) {
                const id = block_id.slice("basis:".length);
                rewrittenById.set(id, newText);
                continue;
              }
              if (block_id.startsWith("verdieping:")) {
                const id = block_id.slice("verdieping:".length);
                verdiepingById.set(id, newText);
                continue;
              }
              if (block_id.startsWith("praktijk:")) {
                const pid = block_id.slice("praktijk:".length);
                praktijkByParagraphId.set(pid, newText);
                continue;
              }
              if (block_id.startsWith("verdieping_existing:")) {
                const pid = block_id.slice("verdieping_existing:".length);
                verdiepingExistingByParagraphId.set(pid, newText);
                continue;
              }
            }
          }
        }

        await reportBookgenProgress({
          stage: "bookgen:hyphen-fix",
          percent: 64,
          message: `BookGen Pro: hyphenation fixes applied (${Object.keys(hyphenFixedAll).length})`,
        }).catch(() => {});
      }

      const rewritesOut = {
        generatedAt: new Date().toISOString(),
        bookId,
        bookVersionId,
        chapterIndex,
        rewriteProvider,
        rewriteModel,
        units: units.map((u) => ({
          unit_id: u.unit_id,
          kind: u.kind,
          order: u.order,
          section: u.section,
          subsection: u.subsection,
        })),
        rewritten: Object.fromEntries(rewrittenById.entries()),
        verdieping: Object.fromEntries(verdiepingById.entries()),
        praktijk: Object.fromEntries(praktijkByParagraphId.entries()),
        verdieping_existing: Object.fromEntries(verdiepingExistingByParagraphId.entries()),
        hyphenation: hyphenPassEnabled
          ? {
            provider: hyphenProvider,
            checkModel: hyphenCheckModel,
            fixModel: hyphenFixModel,
            issues: hyphenIssuesAll.slice(0, 200),
            appliedFixesCount: Object.keys(hyphenFixedAll).length,
          }
          : { enabled: false },
      };

      const rewritesBuf = Buffer.from(JSON.stringify(rewritesOut, null, 2), "utf-8");
      bookgenArtifacts.push({
        kind: "debug",
        ...(await uploadArtifact({
          orgId,
          jobId,
          fileName: fileNameForAttempt(target === "book" ? `rewrites.ch${chapterIndex}.json` : "rewrites.json"),
          buf: rewritesBuf,
          contentType: "application/json",
        })),
        chapterIndex,
      });

      await reportBookgenProgress({ stage: "bookgen:assemble", percent: 65, message: "BookGen Pro: assembling rewritten chapter…" }).catch(() => {});

      // Assemble: apply basis rewrites + insert microheadings by wrapping paragraphs into subparagraph blocks.
      const applyToBlocks = (blocks) => {
        if (!Array.isArray(blocks)) return blocks;
        const out = [];
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (!b || typeof b !== "object") continue;
          const t = typeof b.type === "string" ? b.type : "";

          if (t === "subparagraph") {
            const next = { ...b };
            const inner = b.content || b.blocks || b.items;
            next.content = applyToBlocks(inner);
            out.push(next);
            continue;
          }

          // Composite: intro paragraph rewrites + remove following list/steps blocks (merge their figures).
          if (t === "paragraph" && typeof b.id === "string" && compositeByIntroId.has(b.id)) {
            const pid = b.id;
            const composite = compositeByIntroId.get(pid);
            const removeIds = Array.isArray(composite?.removeBlockIds) ? composite.removeBlockIds : [];
            const removeSet = new Set(removeIds);

            const nextPara = { ...b };
            let mergedImages = Array.isArray(nextPara.images) ? [...nextPara.images] : [];

            let j = i + 1;
            while (j < blocks.length) {
              const nb = blocks[j];
              const nid = typeof nb?.id === "string" ? nb.id : "";
              if (!nid || !removeSet.has(nid)) break;
              if (Array.isArray(nb.images) && nb.images.length) mergedImages.push(...nb.images);
              j++;
            }

            if (mergedImages.length) nextPara.images = mergedImages;

            const micro = microMap.get(pid) || null;
            const isVerd = verdSet.has(pid);
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

            // Apply Praktijk / existing Verdieping rewrites (when present on the paragraph).
            const pr = praktijkByParagraphId.get(pid);
            if (typeof pr === "string") nextPara.praktijk = pr;
            if (!isVerd) {
              const ve = verdiepingExistingByParagraphId.get(pid);
              if (typeof ve === "string") nextPara.verdieping = ve;
            }

            if (micro) {
              out.push({ type: "subparagraph", title: micro, content: [nextPara] });
            } else {
              out.push(nextPara);
            }

            // Skip consumed list/steps blocks
            i = j - 1;
            continue;
          }

          // Regular paragraph rewrite
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

            // Apply Praktijk / existing Verdieping rewrites (when present on the paragraph).
            const pr = praktijkByParagraphId.get(pid);
            if (typeof pr === "string") nextPara.praktijk = pr;
            if (!isVerd) {
              const ve = verdiepingExistingByParagraphId.get(pid);
              if (typeof ve === "string") nextPara.verdieping = ve;
            }

            if (micro) {
              out.push({ type: "subparagraph", title: micro, content: [nextPara] });
            } else {
              out.push(nextPara);
            }
            continue;
          }

          // Rewrite list/steps blocks by converting them into paragraph blocks.
          if ((t === "list" || t === "steps") && typeof b.id === "string") {
            const id = b.id;
            const micro = microMap.get(id) || null;
            const isVerd = verdSet.has(id);
            const nextPara = {
              type: "paragraph",
              id,
              styleHint: "•Basis",
              role: "body",
              ...(Array.isArray(b.images) && b.images.length ? { images: b.images } : {}),
              basis: "",
            };

            if (isVerd) {
              const v = verdiepingById.get(id);
              if (typeof v === "string") nextPara.verdieping = v;
            } else {
              const r = rewrittenById.get(id);
              if (typeof r === "string") nextPara.basis = r;
            }

            if (nextPara.basis || nextPara.verdieping) {
              if (micro) {
                out.push({ type: "subparagraph", title: micro, content: [nextPara] });
              } else {
                out.push(nextPara);
              }
              continue;
            }

            // No rewrite available: keep original list/steps block.
            out.push(b);
            continue;
          }

          // Fallback recursion
          const next = { ...b };
          if (Array.isArray(b.content)) next.content = applyToBlocks(b.content);
          out.push(next);
        }
        return out;
      };

      const ch = assembledClone.chapters?.[chapterIndex];
      if (!ch || typeof ch !== "object") {
        throw new Error(`BookGen Pro: chapter ${chapterIndex} not found during assemble`);
      }
      if (Array.isArray(ch.sections) && ch.sections.length) {
        ch.sections = ch.sections.map((s) => ({
          ...s,
          content: applyToBlocks(s.content),
        }));
      } else {
        const content = ch.content || ch.blocks || ch.items;
        ch.content = applyToBlocks(content);
      }

      assembled = assembledClone;
      await reportBookgenProgress({ stage: "bookgen:assemble", percent: 72, message: "BookGen Pro: assembled chapter ready" }).catch(() => {});
      }

      assembled = assembledClone;
      if (target === "book") {
        await reportProgress({ stage: "bookgen:assemble", percent: 80, message: "BookGen Pro: assembled book ready" }).catch(() => {});
      }

      // Placeholder-only mode: ensure core correctness by doing semantic figure membership + placement.
      // We do NOT trust the numeric autoChapterFigures grouping; instead we let the LLM place each figure
      // onto the best paragraph across the (assembled) book.
      // NOTE: Figure placement is handled later (shared for bookgen + non-bookgen).
      // Keep this disabled to avoid double-attaching figures.
      if (false && placeholdersOnly) {
        await reportProgress({
          stage: "bookgen:placeholders",
          percent: target === "book" ? 81 : 73,
          message: "Placing figure placeholders (LLM)…",
        }).catch(() => {});

        const chaptersAll = Array.isArray(assembled?.chapters) ? assembled.chapters : [];

        const figuresAll = (() => {
          const out = [];
          const seen = new Set();
          if (autoChapterFigures && typeof autoChapterFigures === "object") {
            for (const v of Object.values(autoChapterFigures)) {
              if (!Array.isArray(v)) continue;
              for (const f of v) {
                if (!f || typeof f !== "object") continue;
                const src = typeof f.src === "string" ? f.src.trim() : "";
                if (!src) continue;
                const key = src.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({
                  src,
                  alt: typeof f.alt === "string" ? f.alt : "",
                  caption: typeof f.caption === "string" ? f.caption : "",
                  figureNumber: typeof f.figureNumber === "string" ? f.figureNumber : "",
                });
              }
            }
          }
          return out;
        })();

        const buildParagraphCandidatesForBook = () => {
          const candidates = [];
          const seen = new Set();
          let globalIdx = 0;

          const walk = ({ blocks, chapterIndex, chapterNumber, chapterTitle, sectionLabel, subLabel }) => {
            if (!Array.isArray(blocks)) return;
            for (const b of blocks) {
              if (!b || typeof b !== "object") continue;
              const t = typeof b.type === "string" ? b.type : "";

              if (t === "paragraph") {
                const id = typeof b.id === "string" ? b.id : "";
                if (!id || seen.has(id)) continue;

                const basisRaw = typeof b.basis === "string" ? b.basis : "";
                const praktijkRaw = typeof b.praktijk === "string" ? b.praktijk : "";
                const verdiepingRaw = typeof b.verdieping === "string" ? b.verdieping : "";
                const combinedRaw = [basisRaw, praktijkRaw, verdiepingRaw].filter((x) => typeof x === "string" && x.trim()).join("\n\n");
                const combined = stripHtml(combinedRaw);
                if (!combined) continue;

                const snippet = normalizeWs(toFacts(combinedRaw, { maxFacts: 6 }).join(" "));
                const text = snippet.length > 360 ? `${snippet.slice(0, 357).trim()}…` : snippet;

                candidates.push({
                  paragraph_id: id,
                  paragraph_index: globalIdx++,
                  chapter_index: chapterIndex,
                  chapter_number: chapterNumber || "",
                  chapter_title: chapterTitle || "",
                  section: sectionLabel || "",
                  subheading: subLabel || "",
                  role: typeof b.role === "string" ? b.role : "",
                  text,
                  block: b,
                });
                seen.add(id);
                continue;
              }

              if (t === "subparagraph") {
                const title = typeof b.title === "string" ? stripHtml(b.title) : "";
                const prev = subLabel;
                const nextSub = title ? title : prev;
                walk({
                  blocks: b.content || b.blocks || b.items,
                  chapterIndex,
                  chapterNumber,
                  chapterTitle,
                  sectionLabel,
                  subLabel: nextSub,
                });
                continue;
              }

              const child = b.content || b.blocks || b.items;
              if (Array.isArray(child)) {
                walk({ blocks: child, chapterIndex, chapterNumber, chapterTitle, sectionLabel, subLabel });
              }
            }
          };

          for (let ci = 0; ci < chaptersAll.length; ci++) {
            const ch = chaptersAll[ci];
            if (!ch || typeof ch !== "object") continue;
            const chapterNumber = typeof ch.number === "string" ? String(ch.number).trim() : "";
            const chapterTitle = String(ch?.title || ch?.meta?.title || `Hoofdstuk ${ci + 1}`);

            if (Array.isArray(ch.sections) && ch.sections.length) {
              for (const s of ch.sections) {
                const sn = typeof s?.number === "string" ? String(s.number).trim() : "";
                const st = typeof s?.title === "string" ? stripHtml(s.title) : "";
                const sectionLabel = normalizeWs([sn, st].filter(Boolean).join(" "));
                walk({
                  blocks: s?.content || s?.blocks || s?.items,
                  chapterIndex: ci,
                  chapterNumber,
                  chapterTitle,
                  sectionLabel,
                  subLabel: "",
                });
              }
            } else {
              walk({
                blocks: ch?.content || ch?.blocks || ch?.items,
                chapterIndex: ci,
                chapterNumber,
                chapterTitle,
                sectionLabel: "",
                subLabel: "",
              });
            }
          }

          return candidates;
        };

        const candidatesAll = buildParagraphCandidatesForBook();
        if (!candidatesAll.length) {
          throw new Error("BLOCKED: No paragraph candidates found for figure placeholder placement");
        }

        const STOP = new Set([
          "de", "het", "een", "en", "van", "voor", "met", "op", "in", "aan", "bij", "dat", "die", "dit", "als",
          "je", "jij", "u", "uw", "we", "wij", "ze", "zij", "zijn", "haar", "hun", "ons", "mij", "me", "mijn",
          "is", "zijn", "was", "waren", "wordt", "worden", "kan", "kunnen", "ook", "niet", "wel", "naar", "om", "te",
        ]);
        const norm = (s) => normalizeWs(stripHtml(s)).toLowerCase().replace(/[^a-z0-9]+/g, " ");
        const tok = (s) => norm(s).split(" ").filter((t) => t.length >= 4 && !STOP.has(t));

        const candidateText = candidatesAll.map((c) => norm(c.text || ""));
        const pickCandidatesForFigure = (fig, k = 14) => {
          const query = [fig.figureNumber || "", fig.caption || "", fig.alt || ""].join(" ");
          const toks = tok(query);
          const scores = [];
          for (let i = 0; i < candidatesAll.length; i++) {
            const t = candidateText[i];
            let score = 0;
            const fn = String(fig.figureNumber || "").trim();
            if (fn && t.includes(fn.toLowerCase())) score += 6;
            for (const w of toks) {
              if (t.includes(w)) score += 1;
            }
            scores.push({ i, score });
          }
          scores.sort((a, b) => (b.score - a.score) || (a.i - b.i));
          const best = scores.filter((x) => x.score > 0).slice(0, k);
          const picked = best.length ? best : scores.slice(0, Math.min(k, scores.length));
          return { paragraphIds: picked.map((x) => candidatesAll[x.i].paragraph_id), noMatch: best.length === 0 };
        };

        const callPlannerJson = planProvider === "anthropic"
          ? (args) => anthropicJson(args)
          : (args) => openaiChatJson(args);

        const BATCH = 8;
        const placementsAll = [];
        for (let start = 0; start < figuresAll.length; start += BATCH) {
          const batch = figuresAll.slice(start, start + BATCH);

          const perFig = new Map();
          const usedParaIds = new Set();
          for (const f of batch) {
            const sel = pickCandidatesForFigure(f, 14);
            perFig.set(f.src, sel);
            for (const pid of sel.paragraphIds) usedParaIds.add(pid);
          }

          const paragraphs = candidatesAll
            .filter((c) => usedParaIds.has(c.paragraph_id))
            .map((c) => ({
              paragraph_id: c.paragraph_id,
              paragraph_index: c.paragraph_index,
              chapter_index: c.chapter_index,
              chapter_number: c.chapter_number || "",
              chapter_title: c.chapter_title || "",
              section: c.section || "",
              subheading: c.subheading || "",
              role: c.role || "",
              text: c.text || "",
            }));

          const figuresIn = batch.map((f) => ({
            src: f.src,
            figureNumber: f.figureNumber || "",
            caption: stripHtml(f.caption || ""),
            alt: stripHtml(f.alt || ""),
            candidate_paragraph_ids: perFig.get(f.src)?.paragraphIds || [],
            no_match: perFig.get(f.src)?.noMatch === true,
          }));

          const BOOKGEN_PROMPT_BOOK_FIGURE_PLACEMENT_SYSTEM = `You are placing figure placeholders inside a Dutch MBO textbook (whole book scope).

You will receive:
- figures: each figure has candidate_paragraph_ids (the ONLY allowed targets for that figure)
- paragraphs: details for the candidate paragraph_ids across the book

Task:
For EVERY figure, choose exactly ONE paragraph_id (from its candidate_paragraph_ids) AFTER which the placeholder should appear.

Guidelines:
- Prefer the paragraph whose text best matches the figure caption/alt (and figureNumber when present).
- Keep the flow readable: avoid putting many unrelated figures under one paragraph.
- If a figure has no_match=true, still pick the best-fit paragraph among its candidates, but treat it as uncertain.

Hard requirements:
- Use ONLY paragraph_id values from candidate_paragraph_ids for that figure.
- Output STRICT JSON ONLY:
{ \"placements\": [ { \"src\": \"...\", \"paragraph_id\": \"...\" } ] }`;

          const planned = await withRetries(
            () => callPlannerJson({ system: BOOKGEN_PROMPT_BOOK_FIGURE_PLACEMENT_SYSTEM, user: `INPUT JSON:\n${JSON.stringify({ figures: figuresIn, paragraphs })}`, model: planModel, temperature: 0.1, maxTokens: 2400 }),
            { attempts: 3 },
          );

          const placementsArr = Array.isArray(planned?.placements) ? planned.placements : null;
          if (!placementsArr) throw new Error("BLOCKED: Figure placement LLM returned invalid shape (missing placements array)");

          const bySrc = new Map();
          for (const p of placementsArr) {
            const src = typeof p?.src === "string" ? p.src.trim() : "";
            const pid = typeof p?.paragraph_id === "string" ? p.paragraph_id.trim() : "";
            if (!src || !pid) continue;
            bySrc.set(src, pid);
          }

          const allowedParagraphIds = new Set(paragraphs.map((p) => String(p?.paragraph_id || "").trim()).filter(Boolean));
          for (const f of batch) {
            const pid = bySrc.get(f.src);
            if (!pid) throw new Error(`BLOCKED: Figure placement missing src=${f.src}`);
            // Retrieval candidates are a heuristic to keep context small. We require the chosen paragraph_id
            // to be within the paragraphs list we provided to the model (so it can't hallucinate IDs),
            // but we do NOT hard-require it to be within the per-figure top-K list.
            if (!allowedParagraphIds.has(pid)) {
              throw new Error(`BLOCKED: Figure placement chose paragraph_id not present in provided paragraphs for src=${f.src}`);
            }
            const suggested = perFig.get(f.src)?.paragraphIds || [];
            const offCandidates = suggested.length ? !suggested.includes(pid) : true;
            placementsAll.push({
              ...f,
              paragraph_id: pid,
              no_match: perFig.get(f.src)?.noMatch === true,
              off_candidates: offCandidates,
            });
          }
        }

        // Attach figures to paragraph blocks (Book Studio-compatible shape: paragraph.images[])
        const blockById = new Map(candidatesAll.map((c) => [c.paragraph_id, c.block]));
        const chapterIndexByParagraph = new Map(candidatesAll.map((c) => [c.paragraph_id, c.chapter_index]));
        const usedByChapter = new Map(); // chapterIndex -> Set(paragraph_id)
        const placementsByChapter = new Map(); // chapterIndex -> list

        placeholderImageSrcMap = {};
        for (const p of placementsAll) {
          const blk = blockById.get(p.paragraph_id);
          if (!blk) throw new Error(`BLOCKED: Internal: paragraph_id not found for placement: ${p.paragraph_id}`);
          if (!Array.isArray(blk.images)) blk.images = [];
          blk.images.push({
            src: p.src,
            alt: p.alt || "",
            caption: p.caption ? stripHtml(p.caption) : (p.alt ? stripHtml(p.alt) : (p.figureNumber ? `Afbeelding ${p.figureNumber}` : "Afbeelding")),
            figureNumber: p.figureNumber || "",
            placeholder: true,
          });

          const label = p.figureNumber ? `Afbeelding ${p.figureNumber}` : "Afbeelding";
          placeholderImageSrcMap[p.src] = makeFigurePlaceholderDataUri(label);

          const ci = chapterIndexByParagraph.get(p.paragraph_id);
          const chapterIdx = typeof ci === "number" && Number.isFinite(ci) ? ci : -1;
          if (chapterIdx >= 0) {
            const used = usedByChapter.get(chapterIdx) || new Set();
            used.add(p.paragraph_id);
            usedByChapter.set(chapterIdx, used);
            const list = placementsByChapter.get(chapterIdx) || [];
            list.push({
              src: p.src,
              figureNumber: p.figureNumber || "",
              paragraph_id: p.paragraph_id,
              no_match: p.no_match === true,
              off_candidates: p.off_candidates === true,
            });
            placementsByChapter.set(chapterIdx, list);
          }
        }

        const placementReport = {
          generatedAt: new Date().toISOString(),
          bookId,
          bookVersionId,
          runId,
          jobId,
          scope: "book",
          figures: figuresAll.length,
          placed: placementsAll.length,
          chapters: chaptersAll.map((_, idx) => ({
            chapterIndex: idx,
            figures: (placementsByChapter.get(idx) || []).length,
            uniqueParagraphs: (usedByChapter.get(idx) || new Set()).size,
            placements: placementsByChapter.get(idx) || [],
          })),
        };

        const placementBuf = Buffer.from(JSON.stringify(placementReport, null, 2), "utf-8");
        bookgenArtifacts.push({
          kind: "debug",
          ...(await uploadArtifact({
            orgId,
            jobId,
            fileName: fileNameForAttempt("figure-placeholders.report.json"),
            buf: placementBuf,
            contentType: "application/json",
          })),
          chapterIndex,
        });
      }
    }

    if (isBookGenPro) {
      await reportProgress({
        stage: "render:html",
        percent: target === "book" ? 82 : 75,
        message: "Rendering HTML…",
      }).catch(() => {});
    }

    // 2c) Semantic figure membership + placement (Book Studio compatible)
    //
    // We never trust filename/figureNumber -> chapter mappings for membership.
    // Instead:
    // - If persisted placements exist (book_versions.figure_placements), use them.
    // - Otherwise, compute placements via LLM (book-scoped), persist them, then use them.
    //
    // This applies only when the canonical is effectively "text-only" (very few embedded images)
    // and the edge function provided library-derived figure descriptors.
    if (autoChapterFigures && typeof autoChapterFigures === "object") {
      const normalizeWs = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const stripHtml = (s) => normalizeWs(String(s || "").replace(/<\s*br\b[^>]*\/?>/gi, " ").replace(/<[^>]+>/g, " "));

      const collectParagraphBlocks = (canon) => {
        const out = [];
        const seen = new Set();

        const chaptersArr = Array.isArray(canon?.chapters) ? canon.chapters : [];
        for (let chapterIdx = 0; chapterIdx < chaptersArr.length; chapterIdx++) {
          const ch = chaptersArr[chapterIdx];
          if (!ch || typeof ch !== "object") continue;

          const chapterNumber = typeof ch.number === "string" ? String(ch.number).trim() : "";
          const chapterTitle = String(ch?.title || ch?.meta?.title || `Hoofdstuk ${chapterIdx + 1}`);

          const walk = (blocks, sectionLabel, subLabel) => {
            if (!Array.isArray(blocks)) return;
            for (const b of blocks) {
              if (!b || typeof b !== "object") continue;
              const t = typeof b.type === "string" ? b.type : "";
              if (t === "paragraph") {
                const id = typeof b.id === "string" ? b.id : "";
                if (!id || seen.has(id)) continue;
                seen.add(id);

                const basisRaw = typeof b.basis === "string" ? b.basis : "";
                const praktijkRaw = typeof b.praktijk === "string" ? b.praktijk : "";
                const verdiepingRaw = typeof b.verdieping === "string" ? b.verdieping : "";
                const combinedRaw = [basisRaw, praktijkRaw, verdiepingRaw].filter((x) => typeof x === "string" && x.trim()).join("\n\n");
                const combined = stripHtml(combinedRaw);
                if (!combined) continue;

                const text = combined.length > 420 ? `${combined.slice(0, 417).trim()}…` : combined;
                out.push({
                  paragraph_id: id,
                  chapter_index: chapterIdx,
                  chapter_number: chapterNumber,
                  chapter_title: chapterTitle,
                  section: sectionLabel || "",
                  subheading: subLabel || "",
                  role: typeof b.role === "string" ? b.role : "",
                  text,
                  block: b,
                });
                continue;
              }
              if (t === "subparagraph") {
                const title = typeof b.title === "string" ? stripHtml(b.title) : "";
                const nextSub = title || subLabel || "";
                walk(b.content || b.blocks || b.items, sectionLabel, nextSub);
                continue;
              }
              const child = b.content || b.blocks || b.items;
              if (Array.isArray(child)) walk(child, sectionLabel, subLabel);
            }
          };

          if (Array.isArray(ch.sections) && ch.sections.length) {
            for (const s of ch.sections) {
              const sn = typeof s?.number === "string" ? String(s.number).trim() : "";
              const st = typeof s?.title === "string" ? stripHtml(s.title) : "";
              const sectionLabel = normalizeWs([sn, st].filter(Boolean).join(" "));
              walk(s?.content || s?.blocks || s?.items, sectionLabel, "");
            }
          } else {
            walk(ch?.content || ch?.blocks || ch?.items, "", "");
          }
        }
        return out;
      };

      const collectEmbeddedImageCount = (canon) => {
        const srcs = new Set();
        const walk = (node) => {
          if (!node) return;
          if (Array.isArray(node)) {
            for (const v of node) walk(v);
            return;
          }
          if (typeof node !== "object") return;
          if (Array.isArray(node.images)) {
            for (const im of node.images) {
              const s = im && typeof im.src === "string" ? im.src.trim() : "";
              if (s) srcs.add(s);
            }
          }
          for (const v of Object.values(node)) walk(v);
        };
        walk(canon);
        return srcs.size;
      };

      // Guard: only do library attachment for "text-only" canonicals.
      // (Mirrors book-version-input-urls's heuristic.)
      const embeddedImageCount = collectEmbeddedImageCount(assembled);
      const isTextOnlyCanonical = embeddedImageCount <= 3;

      if (isTextOnlyCanonical) {
        const flattenFigures = (auto) => {
          const out = [];
          const seen = new Set();
          for (const v of Object.values(auto || {})) {
            if (!Array.isArray(v)) continue;
            for (const f of v) {
              if (!f || typeof f !== "object") continue;
              const src = typeof f.src === "string" ? f.src.trim() : "";
              if (!src) continue;
              const key = src.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              out.push({
                src,
                alt: typeof f.alt === "string" ? f.alt : "",
                caption: typeof f.caption === "string" ? f.caption : "",
                figureNumber: typeof f.figureNumber === "string" ? f.figureNumber : "",
              });
            }
          }
          return out;
        };

        const paragraphsAll = collectParagraphBlocks(assembled);
        const paragraphById = new Map(paragraphsAll.map((p) => [p.paragraph_id, p]));

        const placementsObj = figurePlacementsFromEdge && typeof figurePlacementsFromEdge === "object"
          ? asPlainObject(figurePlacementsFromEdge.placements)
          : null;

        const applyPlacements = ({ placements, figuresBySrc }) => {
          const report = {
            generatedAt: new Date().toISOString(),
            bookId,
            bookVersionId,
            runId,
            jobId,
            target,
            chapterIndex,
            source: "book_version",
            applied: 0,
            missingParagraphs: 0,
            uncertain: 0,
            placements: [],
          };

          const shouldInclude = (meta) => {
            if (target !== "chapter") return true;
            if (typeof chapterIndex !== "number") return false;
            const chIdx = typeof meta?.chapter_index === "number" ? meta.chapter_index : null;
            return chIdx === chapterIndex;
          };

          for (const [src, meta] of Object.entries(placements || {})) {
            if (!shouldInclude(meta)) continue;
            const pid = typeof meta?.paragraph_id === "string" ? meta.paragraph_id.trim() : "";
            const chIdx = typeof meta?.chapter_index === "number" ? meta.chapter_index : null;
            const uncertain = meta?.uncertain === true || meta?.no_match === true || meta?.off_candidates === true;
            if (uncertain) report.uncertain += 1;

            const para = paragraphById.get(pid) || null;
            if (!para || !para.block) {
              report.missingParagraphs += 1;
              report.placements.push({ src, paragraph_id: pid, chapter_index: chIdx, uncertain, error: "paragraph_not_found" });
              continue;
            }

            const fig = figuresBySrc.get(src) || { src, alt: "", caption: "", figureNumber: "" };
            if (!Array.isArray(para.block.images)) para.block.images = [];
            const already = para.block.images.some((im) => im && typeof im === "object" && typeof im.src === "string" && im.src.trim() === src);
            if (!already) {
              para.block.images.push({
                src: fig.src,
                alt: fig.alt || "",
                caption: fig.caption || "",
                figureNumber: fig.figureNumber || "",
                placeholder: placeholdersOnly === true,
              });
            }
            report.applied += 1;
            report.placements.push({ src, paragraph_id: pid, chapter_index: chIdx, uncertain });
          }

          return report;
        };

        // Build figure meta map from whatever the edge provided (even if chapter grouping is wrong).
        // We attach based on placements, not based on the autoChapterFigures chapter index.
        const figuresBySrc = new Map(flattenFigures(autoChapterFigures).map((f) => [f.src, f]));

        if (placementsObj) {
          const report = applyPlacements({ placements: placementsObj, figuresBySrc });
          const reportBuf = Buffer.from(JSON.stringify(report, null, 2), "utf-8");
          bookgenArtifacts.push({
            kind: "debug",
            ...(await uploadArtifact({
              orgId,
              jobId,
              fileName: fileNameForAttempt("figure-placement.report.json"),
              buf: reportBuf,
              contentType: "application/json",
            })),
            chapterIndex,
          });

          // Placeholder-only rendering: override image URLs to render neutral placeholders.
          if (placeholdersOnly) {
            placeholderImageSrcMap = {};
            for (const f of figuresBySrc.values()) {
              const label = f.figureNumber ? `Afbeelding ${f.figureNumber}` : "Afbeelding";
              placeholderImageSrcMap[f.src] = makeFigurePlaceholderDataUri(label);
            }
          }
        } else {
          // No persisted placements: compute once (book-scoped), persist, then continue.
          await reportProgress({
            stage: "figures:place",
            percent: isBookGenPro ? 74 : 10,
            message: "Placing library figures (LLM)…",
          }).catch(() => {});

          // Fetch full library figure set by requesting book scope (chapter scope may be incomplete).
          const fullInputs = await callEdge(
            "book-version-input-urls",
            {
              bookId,
              bookVersionId,
              overlayId,
              target: "book",
              allowMissingImages,
              includeFigurePlacements: false,
              includeChapterOpeners: true,
              autoAttachLibraryImages: true,
            },
            { orgId },
          );
          const autoFull = asPlainObject(fullInputs?.autoChapterFigures) || autoChapterFigures;
          const figuresAll = flattenFigures(autoFull);
          const figuresAllBySrc = new Map(figuresAll.map((f) => [f.src, f]));

          if (!figuresAll.length) {
            throw new Error("BLOCKED: No library figures available for placement (autoChapterFigures empty)");
          }
          if (!paragraphsAll.length) {
            throw new Error("BLOCKED: No paragraph candidates available for figure placement");
          }

          const redactSecrets = (raw) => {
            const s = String(raw ?? "");
            return s
              .replace(/sk-[A-Za-z0-9_-]{10,}/g, "sk-[REDACTED]")
              .replace(/sbp_[A-Za-z0-9_-]{10,}/g, "sbp_[REDACTED]")
              .replace(/Bearer\\s+[A-Za-z0-9._-]{10,}/gi, "Bearer [REDACTED]");
          };

          const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim()
            ? String(process.env.ANTHROPIC_API_KEY).trim()
            : null;
          const OPENAI_API_KEY = process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim()
            ? String(process.env.OPENAI_API_KEY).trim()
            : null;

          const requireKey = (name) => {
            const v = process.env[name];
            if (!v || typeof v !== "string" || !v.trim()) {
              throw new Error(`BLOCKED: ${name} is REQUIRED for figure placement - set env var before running`);
            }
            return v.trim();
          };

          const placementProviderRaw =
            (typeof payload.figurePlacementProvider === "string" && payload.figurePlacementProvider.trim())
              ? payload.figurePlacementProvider.trim()
              : (process.env.BOOK_FIGURE_PLACEMENT_PROVIDER && String(process.env.BOOK_FIGURE_PLACEMENT_PROVIDER).trim()
                ? String(process.env.BOOK_FIGURE_PLACEMENT_PROVIDER).trim()
                : "");
          const placementProvider = placementProviderRaw || (ANTHROPIC_API_KEY ? "anthropic" : "openai");
          if (!["anthropic", "openai"].includes(placementProvider)) {
            throw new Error(`Invalid BOOK_FIGURE_PLACEMENT_PROVIDER: ${placementProvider}`);
          }
          if (placementProvider === "anthropic") requireKey("ANTHROPIC_API_KEY");
          if (placementProvider === "openai") requireKey("OPENAI_API_KEY");

          const placementModel =
            (typeof payload.figurePlacementModel === "string" && payload.figurePlacementModel.trim())
              ? payload.figurePlacementModel.trim()
              : (process.env.BOOK_FIGURE_PLACEMENT_MODEL && String(process.env.BOOK_FIGURE_PLACEMENT_MODEL).trim()
                ? String(process.env.BOOK_FIGURE_PLACEMENT_MODEL).trim()
                : (placementProvider === "anthropic"
                  ? (process.env.ANTHROPIC_MODEL && String(process.env.ANTHROPIC_MODEL).trim() ? String(process.env.ANTHROPIC_MODEL).trim() : "claude-haiku-4-5-20251001")
                  : "gpt-4o-mini"));

          const safeJsonParse = (raw) => {
            const t = String(raw || "").trim();
            if (!t) return null;
            try {
              return JSON.parse(t);
            } catch {
              return null;
            }
          };

          const normalizeJsonStringLiterals = (rawText) => {
            const s = String(rawText || "");
            let out = "";
            let inStr = false;
            let esc = false;
            for (let i = 0; i < s.length; i++) {
              const ch = s[i];
              if (esc) {
                out += ch;
                esc = false;
                continue;
              }
              if (ch === "\\") {
                out += ch;
                if (inStr) esc = true;
                continue;
              }
              if (ch === "\"") {
                out += ch;
                inStr = !inStr;
                continue;
              }
              if (inStr && (ch === "\n" || ch === "\r")) continue;
              out += ch;
            }
            return out.trim();
          };

          const extractFirstJsonObject = (rawText) => {
            const s = String(rawText || "");
            const start = s.indexOf("{");
            if (start < 0) return null;
            let depth = 0;
            let inStr = false;
            let esc = false;
            for (let i = start; i < s.length; i++) {
              const ch = s[i];
              if (esc) {
                esc = false;
                continue;
              }
              if (ch === "\\") {
                if (inStr) esc = true;
                continue;
              }
              if (ch === "\"") {
                inStr = !inStr;
                continue;
              }
              if (!inStr) {
                if (ch === "{") depth++;
                if (ch === "}") {
                  depth--;
                  if (depth === 0) return s.slice(start, i + 1).trim();
                }
              }
            }
            return null;
          };

          const anthropicJson = async ({ system, user, model, temperature, maxTokens }) => {
            let resp;
            try {
              resp = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": requireKey("ANTHROPIC_API_KEY"),
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
            } catch (e) {
              const cause = e && typeof e === "object" ? e.cause : null;
              const code = cause && typeof cause === "object" ? cause.code : "";
              const syscall = cause && typeof cause === "object" ? cause.syscall : "";
              const hostname = cause && typeof cause === "object" ? cause.hostname : "";
              const hint = [code, syscall, hostname].filter(Boolean).join(" ");
              throw new Error(`Anthropic fetch failed: ${hint || "fetch failed"}`);
            }
            const text = await resp.text().catch(() => "");
            if (!resp.ok) {
              throw new Error(`Anthropic failed (${resp.status}): ${redactSecrets(text).slice(0, 800)}`);
            }
            const j = safeJsonParse(text);
            const contentArr = Array.isArray(j?.content) ? j.content : [];
            const first = contentArr.find((c) => c && c.type === "text" && typeof c.text === "string");
            const out = first?.text;
            if (!out || typeof out !== "string") {
              throw new Error("Anthropic returned empty content");
            }
            const t = String(out || "").trim()
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/```$/i, "")
              .trim();
            const parsed = safeJsonParse(t);
            if (parsed) return parsed;
            const normalized = normalizeJsonStringLiterals(t);
            const parsed2 = safeJsonParse(normalized);
            if (parsed2) return parsed2;
            const extracted = extractFirstJsonObject(normalized);
            if (extracted) {
              const parsed3 = safeJsonParse(extracted);
              if (parsed3) return parsed3;
            }
            throw new Error(`Anthropic returned non-JSON: ${t.slice(0, 800)}`);
          };

          const openaiChatJson = async ({ system, user, model, temperature, maxTokens }) => {
            let resp;
            try {
              resp = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${requireKey("OPENAI_API_KEY")}`,
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
            } catch (e) {
              const cause = e && typeof e === "object" ? e.cause : null;
              const code = cause && typeof cause === "object" ? cause.code : "";
              const syscall = cause && typeof cause === "object" ? cause.syscall : "";
              const hostname = cause && typeof cause === "object" ? cause.hostname : "";
              const hint = [code, syscall, hostname].filter(Boolean).join(" ");
              throw new Error(`OpenAI fetch failed: ${hint || "fetch failed"}`);
            }
            const text = await resp.text().catch(() => "");
            if (!resp.ok) {
              throw new Error(`OpenAI failed (${resp.status}): ${redactSecrets(text).slice(0, 800)}`);
            }
            const j = safeJsonParse(text);
            const out = j?.choices?.[0]?.message?.content;
            const parsed = safeJsonParse(out);
            if (parsed) return parsed;
            throw new Error("OpenAI returned non-JSON");
          };

          const callPlacement = async ({ system, user }) => {
            return placementProvider === "anthropic"
              ? await anthropicJson({ system, user, model: placementModel, temperature: 0.1, maxTokens: 2200 })
              : await openaiChatJson({ system, user, model: placementModel, temperature: 0.1, maxTokens: 2200 });
          };

          const STOP = new Set([
            "de", "het", "een", "en", "van", "voor", "met", "op", "in", "aan", "bij", "dat", "die", "dit", "als",
            "je", "jij", "u", "uw", "we", "wij", "ze", "zij", "zijn", "haar", "hun", "ons", "mij", "me", "mijn",
            "is", "zijn", "was", "waren", "wordt", "worden", "kan", "kunnen", "ook", "niet", "wel", "naar", "om", "te",
          ]);
          const norm = (s) => normalizeWs(stripHtml(s)).toLowerCase().replace(/[^a-z0-9]+/g, " ");
          const tok = (s) => norm(s).split(" ").filter((t) => t.length >= 4 && !STOP.has(t));
          const candidateText = paragraphsAll.map((c) => norm(c.text || ""));
          const pickCandidatesForFigure = (fig, k = 16) => {
            const query = [fig.figureNumber || "", fig.caption || "", fig.alt || ""].join(" ");
            const toks = tok(query);
            const scores = [];
            for (let i = 0; i < paragraphsAll.length; i++) {
              const t = candidateText[i];
              let score = 0;
              const fn = String(fig.figureNumber || "").trim();
              if (fn && t.includes(fn.toLowerCase())) score += 6;
              for (const w of toks) if (t.includes(w)) score += 1;
              scores.push({ i, score });
            }
            scores.sort((a, b) => (b.score - a.score) || (a.i - b.i));
            const best = scores.filter((x) => x.score > 0).slice(0, k);
            const picked = best.length ? best : scores.slice(0, Math.min(k, scores.length));
            return { paragraphIds: picked.map((x) => paragraphsAll[x.i].paragraph_id), noMatch: best.length === 0 };
          };

          const BATCH = 8;
          const placementBySrc = new Map();
          const flagsBySrc = new Map();

          for (let start = 0; start < figuresAll.length; start += BATCH) {
            const batch = figuresAll.slice(start, start + BATCH);
            const perFig = new Map();
            const usedParaIds = new Set();
            for (const f of batch) {
              const sel = pickCandidatesForFigure(f, 16);
              perFig.set(f.src, sel);
              for (const pid of sel.paragraphIds) usedParaIds.add(pid);
            }

            const paragraphs = paragraphsAll
              .filter((c) => usedParaIds.has(c.paragraph_id))
              .map((c) => ({
                paragraph_id: c.paragraph_id,
                chapter_index: c.chapter_index,
                chapter_title: c.chapter_title || "",
                section: c.section || "",
                subheading: c.subheading || "",
                role: c.role || "",
                text: c.text || "",
              }));

            const figuresIn = batch.map((f) => ({
              src: f.src,
              figureNumber: f.figureNumber || "",
              caption: stripHtml(f.caption || ""),
              alt: stripHtml(f.alt || ""),
              no_match: perFig.get(f.src)?.noMatch === true,
            }));

            const SYSTEM = `You are placing figures inside a Dutch MBO textbook.\n\nReturn STRICT JSON only:\n{ \"placements\": [ { \"src\": \"...\", \"paragraph_id\": \"...\" } ] }\n\nRules:\n- Use ONLY paragraph_id values that exist in the input paragraphs list.\n- Output exactly one placement per figure.src.\n- Prefer semantic fit: match caption/alt to the paragraph text and chapter title.\n- Avoid placing many figures on the same paragraph unless it clearly introduces a set.\n- If a figure is weakly related, pick the best fit and assume it is uncertain (do not refuse).`;

            const planned = await withRetries(
              () => callPlacement({ system: SYSTEM, user: `INPUT JSON:\n${JSON.stringify({ figures: figuresIn, paragraphs })}` }),
              { attempts: 3 },
            );

            const placementsArr = Array.isArray(planned?.placements) ? planned.placements : null;
            if (!placementsArr) throw new Error("BLOCKED: Figure placement LLM returned invalid shape (missing placements array)");

            const allowedParagraphIds = new Set(paragraphs.map((p) => String(p?.paragraph_id || "").trim()).filter(Boolean));
            for (const p of placementsArr) {
              const src = typeof p?.src === "string" ? p.src.trim() : "";
              const pid = typeof p?.paragraph_id === "string" ? p.paragraph_id.trim() : "";
              if (!src || !pid) continue;
              if (!allowedParagraphIds.has(pid)) {
                throw new Error(`BLOCKED: Figure placement chose paragraph_id not present in provided paragraphs for src=${src}`);
              }
              placementBySrc.set(src, pid);
            }

            for (const f of batch) {
              const pid = placementBySrc.get(f.src);
              if (!pid) throw new Error(`BLOCKED: Figure placement missing src=${f.src}`);
              const suggested = perFig.get(f.src)?.paragraphIds || [];
              flagsBySrc.set(f.src, {
                no_match: perFig.get(f.src)?.noMatch === true,
                off_candidates: suggested.length ? !suggested.includes(pid) : true,
              });
            }
          }

          // Build persisted placements payload (per plan)
          const placementsToPersist = {};
          for (const f of figuresAll) {
            const pid = placementBySrc.get(f.src);
            const para = pid ? paragraphById.get(pid) : null;
            const chapterIdx = para && typeof para.chapter_index === "number" ? para.chapter_index : null;
            const flags = flagsBySrc.get(f.src) || { no_match: true, off_candidates: true };
            const uncertain = flags.no_match === true || flags.off_candidates === true;
            placementsToPersist[f.src] = {
              paragraph_id: pid,
              chapter_index: chapterIdx,
              confidence: uncertain ? 0.2 : 0.8,
              uncertain,
              no_match: flags.no_match === true,
              off_candidates: flags.off_candidates === true,
            };
          }

          const payloadToSave = {
            schemaVersion: "1.0",
            generatedAt: new Date().toISOString(),
            provider: placementProvider,
            model: placementModel,
            placements: placementsToPersist,
          };

          await callEdge(
            "book-version-save-figure-placements",
            { bookId, bookVersionId, figurePlacements: payloadToSave },
            { orgId },
          );

          // Refresh inputs so imageSrcMap includes signed URLs for all placed figures.
          // (book-version-input-urls signs image srcs from figurePlacements.)
          const refreshed = await callEdge(
            "book-version-input-urls",
            {
              bookId,
              bookVersionId,
              overlayId,
              target,
              chapterIndex,
              allowMissingImages,
              includeFigurePlacements: true,
              includeChapterOpeners: true,
              autoAttachLibraryImages: true,
            },
            { orgId },
          );
          const refreshedImageSrcMap = asPlainObject(refreshed?.imageSrcMap);
          if (refreshedImageSrcMap) imageSrcMap = refreshedImageSrcMap;
          const refreshedPlacements = asPlainObject(refreshed?.figurePlacements);
          if (refreshedPlacements) figurePlacementsFromEdge = refreshedPlacements;

          const figuresBySrc2 = figuresAllBySrc;
          const report = applyPlacements({ placements: placementsToPersist, figuresBySrc: figuresBySrc2 });
          report.source = "llm";
          report.provider = placementProvider;
          report.model = placementModel;

          const reportBuf = Buffer.from(JSON.stringify(report, null, 2), "utf-8");
          bookgenArtifacts.push({
            kind: "debug",
            ...(await uploadArtifact({
              orgId,
              jobId,
              fileName: fileNameForAttempt("figure-placement.report.json"),
              buf: reportBuf,
              contentType: "application/json",
            })),
            chapterIndex,
          });

          if (placeholdersOnly) {
            placeholderImageSrcMap = {};
            for (const f of figuresBySrc2.values()) {
              const label = f.figureNumber ? `Afbeelding ${f.figureNumber}` : "Afbeelding";
              placeholderImageSrcMap[f.src] = makeFigurePlaceholderDataUri(label);
            }
          }
        }
      }
    }

    // 3) Render HTML
    // If the edge function provided an imageSrcMap (canonical src -> signed URL),
    // merge it into figures.srcMap so the renderer resolves images without requiring assets.zip.
    let figuresForRender = figures;
    const effectiveImageSrcMap = placeholderImageSrcMap || imageSrcMap;
    if (effectiveImageSrcMap) {
      const base = asPlainObject(figures) || {};
      const existing = asPlainObject(base.srcMap) || asPlainObject(base.src_map) || {};
      // placeholderImageSrcMap overrides remote URLs so the PDF is truly placeholder-only.
      figuresForRender = { ...base, srcMap: { ...existing, ...effectiveImageSrcMap } };
    }

    let html = renderBookHtml(assembled, {
      target,
      chapterIndex: target === "chapter" ? chapterIndex : null,
      assetsBaseUrl: "assets",
      figures: figuresForRender,
      designTokens,
      chapterOpeners: placeholdersOnly ? null : chapterOpeners,
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
    if (isBookGenPro) {
      await reportProgress({
        stage: "render:pdf",
        percent: target === "book" ? 90 : 85,
        message: `Rendering PDF via ${renderProvider}…`,
      }).catch(() => {});
    }
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
    if (isBookGenPro) {
      await reportProgress({
        stage: "upload:artifacts",
        percent: target === "book" ? 94 : 92,
        message: "Uploading artifacts…",
      }).catch(() => {});
    }
    const [htmlBuf, assembledBuf, pdfBuf, logBuf] = await Promise.all([
      readFile(htmlPath),
      readFile(assembledPath),
      readFile(pdfPath),
      readFile(logPath),
    ]);

    const uploaded = [];
    uploaded.push({
      kind: "html",
      ...(await uploadArtifact({ orgId, jobId, fileName: fileNameForAttempt("render.html"), buf: htmlBuf, contentType: "text/html" })),
      chapterIndex,
    });
    uploaded.push({
      kind: "assembled",
      ...(await uploadArtifact({ orgId, jobId, fileName: fileNameForAttempt("assembled.json"), buf: assembledBuf, contentType: "application/json" })),
      chapterIndex,
    });
    uploaded.push({
      kind: "pdf",
      ...(await uploadArtifact({ orgId, jobId, fileName: fileNameForAttempt("output.pdf"), buf: pdfBuf, contentType: "application/pdf" })),
      chapterIndex,
    });
    uploaded.push({
      kind: renderProvider === "docraptor_api" ? "debug" : "prince_log",
      ...(await uploadArtifact({
        orgId,
        jobId,
        fileName: fileNameForAttempt(renderProvider === "docraptor_api" ? "docraptor.log" : "prince.log"),
        buf: logBuf,
        contentType: "text/plain",
      })),
      chapterIndex,
    });

    if (missingImageReport) {
      const reportBuf = Buffer.from(JSON.stringify(missingImageReport, null, 2), "utf-8");
      uploaded.push({
        kind: "layout_report",
        ...(await uploadArtifact({ orgId, jobId, fileName: fileNameForAttempt("layout_report.json"), buf: reportBuf, contentType: "application/json" })),
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
  const runOnce = String(process.env.BOOK_WORKER_RUN_ONCE || "").trim().toLowerCase() === "true";
  const stopAfterJobIdRaw = String(process.env.BOOK_WORKER_STOP_AFTER_JOB_ID || "").trim();
  const stopAfterJobId = stopAfterJobIdRaw && /^[0-9a-f-]{36}$/i.test(stopAfterJobIdRaw) ? stopAfterJobIdRaw : "";
  const maxJobsRaw = String(process.env.BOOK_WORKER_MAX_JOBS || "").trim();
  const maxJobs = maxJobsRaw ? Math.max(1, Math.min(500, Number(maxJobsRaw))) : null;
  let processedJobs = 0;

  while (true) {
    try {
      const res = await callEdge("book-claim-job", {}, {});
      const job = res?.job || null;
      if (!job) {
        if (runOnce) {
          console.log("[book-worker] No pending jobs (run-once). Exiting.");
          return;
        }
        if (stopAfterJobId && maxJobs !== null && processedJobs >= maxJobs) {
          console.log(`[book-worker] Reached max jobs (${maxJobs}) without hitting target jobId=${stopAfterJobId}. Exiting.`);
          return;
        }
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`[book-worker] Claimed job ${job.id} (run ${job.run_id}, target ${job.target})`);
      let jobOk = true;
      try {
        await processJob(job);
      } catch (e) {
        jobOk = false;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[book-worker] Job ${job.id} failed: ${msg}`);
      }
      console.log(`[book-worker] Completed job ${job.id}${jobOk ? "" : " (failed)"}`);
      processedJobs++;
      if (stopAfterJobId && String(job.id) === stopAfterJobId) {
        console.log(`[book-worker] Processed target jobId=${stopAfterJobId}${jobOk ? "" : " (failed)"} . Exiting.`);
        return;
      }
      if (runOnce) {
        console.log("[book-worker] Completed one job (run-once). Exiting.");
        return;
      }
      if (maxJobs !== null && processedJobs >= maxJobs) {
        console.log(`[book-worker] Reached max jobs (${maxJobs}). Exiting.`);
        return;
      }
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


