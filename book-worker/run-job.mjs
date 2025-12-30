// Deterministic one-off runner for a specific book render job.
// This is primarily used by live E2E tests to avoid claiming unrelated jobs.
//
// Usage:
//   node book-worker/run-job.mjs --jobId <uuid> --bookId <id> --bookVersionId <hash> --overlayId <uuid|none> --target chapter --chapterIndex 0
//
// Required env:
//   SUPABASE_URL, SUPABASE_ANON_KEY, AGENT_TOKEN, ORGANIZATION_ID
//   PRINCE_PATH (recommended; must point to local Prince executable)

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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
const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args.set(k, v);
  }
  return args;
}

async function callEdge(name, body, { orgId } = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
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
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Downloaded input was not valid JSON");
  }
}

async function downloadBinaryFromSignedUrl(signedUrl) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
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
  await fs.mkdir(destDir, { recursive: true });
  if (process.platform === "win32") {
    const ps = [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ];
    await runCmd("powershell", ps);
    return;
  }
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
      await fs.stat(path.join(workDir, rel));
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
    `Upload assets.zip for this bookVersion and ensure image src paths are relative (or mapped via figures.srcMap). ` +
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

async function uploadArtifact({ jobId, fileName, buf, contentType }) {
  const { signedUrl, path: objectPath } = await callEdge("book-job-upload-url", { jobId, fileName }, {});
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: buf,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}) for ${fileName}: ${t.slice(0, 200)}`);
  }
  return { path: objectPath, bytes: buf.byteLength, contentType: contentType || "application/octet-stream" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const jobId = String(args.get("jobId") || "").trim();
  const bookId = String(args.get("bookId") || "").trim();
  const bookVersionId = String(args.get("bookVersionId") || "").trim();
  const overlayIdRaw = String(args.get("overlayId") || "").trim();
  const overlayId = overlayIdRaw && overlayIdRaw !== "none" ? overlayIdRaw : null;
  const target = String(args.get("target") || "").trim();
  const chapterIndexRaw = args.get("chapterIndex");
  const chapterIndex = chapterIndexRaw !== undefined ? Number(chapterIndexRaw) : null;
  const allowMissingImagesRaw = String(args.get("allowMissingImages") || "").trim().toLowerCase();
  const allowMissingImages = allowMissingImagesRaw === "true" || allowMissingImagesRaw === "1" || allowMissingImagesRaw === "yes";

  if (!jobId) throw new Error("Missing --jobId");
  if (!bookId) throw new Error("Missing --bookId");
  if (!bookVersionId) throw new Error("Missing --bookVersionId");
  if (target !== "chapter" && target !== "book") throw new Error("Missing/invalid --target (chapter|book)");
  if (target === "chapter" && !(Number.isFinite(chapterIndex) && chapterIndex >= 0)) {
    throw new Error("Missing/invalid --chapterIndex (must be >= 0) for chapter target");
  }

  // 1) Get signed input URLs
  const inputs = await callEdge(
    "book-version-input-urls",
    { bookId, bookVersionId, overlayId, target, chapterIndex, allowMissingImages },
    { orgId: ORGANIZATION_ID }
  );

  const canonicalUrl = inputs?.urls?.canonical?.signedUrl;
  if (!canonicalUrl) throw new Error("Missing canonical signedUrl");

  const canonical = await downloadJsonFromSignedUrl(canonicalUrl);
  const figures = inputs?.urls?.figures?.signedUrl ? await downloadJsonFromSignedUrl(inputs.urls.figures.signedUrl) : null;
  const designTokens = inputs?.urls?.designTokens?.signedUrl ? await downloadJsonFromSignedUrl(inputs.urls.designTokens.signedUrl) : null;
  const overlay = inputs?.urls?.overlay?.signedUrl ? await downloadJsonFromSignedUrl(inputs.urls.overlay.signedUrl) : null;
  const asPlainObject = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : null);
  const imageSrcMap = asPlainObject(inputs?.imageSrcMap);

  // Optional assets bundle (zip)
  const assetsZipUrl = inputs?.urls?.assetsZip?.signedUrl || null;

  // 2) Apply overlay
  const assembled = applyRewritesOverlay(canonical, overlay);

  // 3) Render HTML
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "iz-book-job-"));

  if (assetsZipUrl) {
    const zipBuf = await downloadBinaryFromSignedUrl(assetsZipUrl);
    const zipPath = path.join(workDir, "assets.zip");
    const assetsDir = path.join(workDir, "assets");
    await fs.writeFile(zipPath, zipBuf);
    await extractZip(zipPath, assetsDir);
  }

  // Auto-discover chapter openers from extracted assets (convention-based)
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
        await fs.stat(path.join(workDir, "assets", rel));
        chapterOpeners[i] = rel;
        break;
      } catch {
        // keep scanning
      }
    }
  }

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
  const logPath = path.join(workDir, "prince.log");

  const missingCheck = await findMissingLocalImageAssets({ html, workDir });
  const missingImages = missingCheck.missing || [];
  const missingImageReport = missingImages.length
    ? {
        generatedAt: new Date().toISOString(),
        bookId,
        bookVersionId,
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

  await fs.writeFile(htmlPath, html, "utf-8");
  await fs.writeFile(assembledPath, JSON.stringify(assembled, null, 2), "utf-8");

  await validateLocalImageAssets({ html, workDir });

  // 4) Render PDF (local Prince)
  const renderStart = Date.now();
  await runPrince({ htmlPath, pdfPath, logPath });
  const renderDurationMs = Date.now() - renderStart;

  const pdfStat = await fs.stat(pdfPath);
  if (!pdfStat || pdfStat.size <= 0) throw new Error("PDF render produced an empty file");

  // 5) Upload artifacts (via signed upload URLs)
  const [htmlBuf, assembledBuf, pdfBuf, logBuf] = await Promise.all([
    fs.readFile(htmlPath),
    fs.readFile(assembledPath),
    fs.readFile(pdfPath),
    fs.readFile(logPath),
  ]);

  const uploaded = [];
  uploaded.push({ kind: "html", ...(await uploadArtifact({ jobId, fileName: "render.html", buf: htmlBuf, contentType: "text/html" })) });
  uploaded.push({ kind: "assembled", ...(await uploadArtifact({ jobId, fileName: "assembled.json", buf: assembledBuf, contentType: "application/json" })) });
  uploaded.push({ kind: "pdf", ...(await uploadArtifact({ jobId, fileName: "output.pdf", buf: pdfBuf, contentType: "application/pdf" })) });
  uploaded.push({ kind: "prince_log", ...(await uploadArtifact({ jobId, fileName: "prince.log", buf: logBuf, contentType: "text/plain" })) });
  if (missingImageReport) {
    const reportBuf = Buffer.from(JSON.stringify(missingImageReport, null, 2), "utf-8");
    uploaded.push({ kind: "layout_report", ...(await uploadArtifact({ jobId, fileName: "layout_report.json", buf: reportBuf, contentType: "application/json" })) });
  }

  // 6) Finalize job + artifacts
  await callEdge(
    "book-job-apply-result",
    {
      jobId,
      status: "done",
      progressStage: "completed",
      progressPercent: 100,
      progressMessage: `Rendered via prince_local in ${renderDurationMs}ms`,
      resultPath: uploaded.find((u) => u.kind === "pdf")?.path || null,
      processingDurationMs: renderDurationMs,
      artifacts: uploaded.map((u) => ({
        kind: u.kind,
        path: u.path,
        bytes: u.bytes,
        contentType: u.contentType,
        chapterIndex: target === "chapter" ? chapterIndex : null,
      })),
    },
    {}
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ book-worker run-job failed: ${msg}`);
  process.exit(1);
});


