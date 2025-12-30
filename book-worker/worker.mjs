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

    // 1) Get signed input URLs
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
    const assembled = applyRewritesOverlay(canonical, overlay);

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


