import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { loadLocalEnvForTests } from "../helpers/load-local-env";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { applyRewritesOverlay, renderBookHtml, runPrince } from "../../book-worker/lib/bookRenderer.js";

// Load local-only env files into process.env for live E2E runs.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env before running live E2E`);
  }
  return String(v).trim();
}

function safeNowId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await import("node:fs/promises").then((m) => m.mkdir(destDir, { recursive: true }));

  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const ps = [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ];
      const child = spawn("powershell", ps, { stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => reject(e));
      child.on("close", (code) => {
        if (code === 0) return resolve();
        reject(new Error(`Expand-Archive failed (exit ${code}) ${err.slice(0, 1000)}`));
      });
    });
    return;
  }

  // Non-windows: rely on `unzip` being available
  await new Promise<void>((resolve, reject) => {
    const child = spawn("unzip", ["-o", zipPath, "-d", destDir], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`unzip failed (exit ${code}) ${err.slice(0, 1000)}`));
    });
  });
}

test("live: book ingest + AI rewrite overlay + local Prince render (real DB + real LLM)", async ({ request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
  const SUPABASE_ANON_KEY =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || requireEnv("SUPABASE_ANON_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  // Local Prince is REQUIRED for this test. Use PRINCE_PATH to avoid PATH ambiguity.
  requireEnv("PRINCE_PATH");

  const bookId = safeNowId("e2e-book");
  const bookTitle = `E2E Book ${new Date().toISOString().slice(0, 19)}`;

  // Load sample canonical and make it unique per run (meta.id/title only)
  const canonicalPath = path.join(process.cwd(), "samples", "books", "canonical.sample.json");
  const canonicalRaw = await readFile(canonicalPath, "utf-8");
  const canonical = JSON.parse(canonicalRaw) as any;
  canonical.meta = canonical.meta || {};
  canonical.meta.id = bookId;
  canonical.meta.title = bookTitle;

  // Pick a stable paragraph to rewrite (first paragraph in sample)
  const paragraphId = "8befd569-7961-4648-b28c-460533225b6a";
  const originalBasis: unknown = canonical?.chapters?.[0]?.sections?.[0]?.content?.[0]?.basis;
  if (typeof originalBasis !== "string" || !originalBasis.trim()) {
    throw new Error("BLOCKED: sample canonical JSON is missing the expected paragraph basis text");
  }

  const headers = {
    "Content-Type": "application/json",
    "x-agent-token": AGENT_TOKEN,
    "x-organization-id": ORGANIZATION_ID,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  } as const;

  // 1) Ingest canonical version
  const ingestResp = await request.post(`${SUPABASE_URL}/functions/v1/book-ingest-version`, {
    headers,
    data: {
      bookId,
      title: bookTitle,
      level: "n3",
      source: "E2E",
      canonical,
    },
    timeout: 60_000,
  });
  const ingestJson = (await ingestResp.json().catch(() => null)) as any;
  expect(ingestResp.ok()).toBeTruthy();
  expect(ingestJson?.ok).toBe(true);
  const bookVersionId = String(ingestJson?.bookVersionId || "").trim();
  expect(bookVersionId.length).toBeGreaterThan(10);

  // 1b) Upload PASS2-like assets bundle for this version (assets.zip)
  const zipPath = path.join(process.cwd(), "samples", "books", "assets.sample.zip");
  const zipBuf = await readFile(zipPath);

  const uploadUrlResp = await request.post(`${SUPABASE_URL}/functions/v1/book-version-upload-url`, {
    headers,
    data: { bookId, bookVersionId, fileName: "assets.zip" },
    timeout: 60_000,
  });
  const uploadUrlJson = (await uploadUrlResp.json().catch(() => null)) as any;
  expect(uploadUrlResp.ok()).toBeTruthy();
  expect(uploadUrlJson?.ok).toBe(true);
  const assetsSignedUrl = String(uploadUrlJson?.signedUrl || "");
  expect(assetsSignedUrl).toContain("http");

  const putAssets = await request.put(assetsSignedUrl, {
    headers: { "Content-Type": "application/zip" },
    data: zipBuf,
    timeout: 60_000,
  });
  expect(putAssets.ok()).toBeTruthy();

  // 2) Create overlay
  const overlayResp = await request.post(`${SUPABASE_URL}/functions/v1/book-create-overlay`, {
    headers,
    data: { bookId, bookVersionId, label: "E2E overlay" },
    timeout: 60_000,
  });
  const overlayJson = (await overlayResp.json().catch(() => null)) as any;
  expect(overlayResp.ok()).toBeTruthy();
  expect(overlayJson?.ok).toBe(true);
  const overlayId = String(overlayJson?.overlayId || "").trim();
  expect(overlayId).toMatch(/[0-9a-f-]{36}/i);

  // 3) Use REAL LLM to rewrite the paragraph (ai-rewrite-text)
  const rewriteResp = await request.post(`${SUPABASE_URL}/functions/v1/ai-rewrite-text`, {
    headers: {
      ...headers,
      // ai-rewrite-text does not require orgId, but hybrid auth accepts it.
    },
    data: {
      segmentType: "reference",
      currentText: originalBasis,
      context: { userPrompt: "Rewrite this paragraph in simpler Dutch, keep meaning and factual correctness." },
      candidateCount: 1,
    },
    timeout: 180_000,
  });
  const rewriteJson = (await rewriteResp.json().catch(() => null)) as any;
  expect(rewriteResp.ok()).toBeTruthy();
  expect(Array.isArray(rewriteJson?.candidates)).toBe(true);
  const rewritten = String(rewriteJson?.candidates?.[0]?.text || "").trim();
  expect(rewritten.length).toBeGreaterThan(10);
  expect(rewritten).not.toBe(originalBasis);

  // 4) Save overlay rewrites.json (conflict detection enabled)
  const saveOverlayResp = await request.post(`${SUPABASE_URL}/functions/v1/book-save-overlay`, {
    headers,
    data: {
      overlayId,
      rewrites: { paragraphs: [{ paragraph_id: paragraphId, rewritten }] },
    },
    timeout: 60_000,
  });
  const saveOverlayJson = (await saveOverlayResp.json().catch(() => null)) as any;
  expect(saveOverlayResp.ok()).toBeTruthy();
  expect(saveOverlayJson?.ok).toBe(true);

  // 5) Enqueue chapter render (provider=prince_local)
  const enqueueResp = await request.post(`${SUPABASE_URL}/functions/v1/book-enqueue-render`, {
    headers,
    data: {
      bookId,
      bookVersionId,
      overlayId,
      target: "chapter",
      chapterIndex: 0,
      renderProvider: "prince_local",
    },
    timeout: 60_000,
  });
  const enqueueJson = (await enqueueResp.json().catch(() => null)) as any;
  expect(enqueueResp.ok()).toBeTruthy();
  expect(enqueueJson?.ok).toBe(true);
  const runId = String(enqueueJson?.runId || "").trim();
  const jobId = String(enqueueJson?.jobId || "").trim();
  expect(runId).toMatch(/[0-9a-f-]{36}/i);
  expect(jobId).toMatch(/[0-9a-f-]{36}/i);

  // 6) Process the job deterministically (no claim) using local Prince, then upload artifacts and finalize.
  // 6.1 Signed input URLs
  const inputResp = await request.post(`${SUPABASE_URL}/functions/v1/book-version-input-urls`, {
    headers,
    data: { bookId, bookVersionId, overlayId, expiresIn: 3600 },
    timeout: 60_000,
  });
  const inputJson = (await inputResp.json().catch(() => null)) as any;
  expect(inputResp.ok()).toBeTruthy();
  expect(inputJson?.ok).toBe(true);
  const canonicalUrl = String(inputJson?.urls?.canonical?.signedUrl || "");
  const overlayUrl = String(inputJson?.urls?.overlay?.signedUrl || "");
  const assetsZipUrl = String(inputJson?.urls?.assetsZip?.signedUrl || "");
  expect(canonicalUrl).toContain("http");
  expect(overlayUrl).toContain("http");
  expect(assetsZipUrl).toContain("http");

  const canonDl = await request.get(canonicalUrl, { timeout: 60_000 });
  expect(canonDl.ok()).toBeTruthy();
  const canonJson = await canonDl.json();

  const overlayDl = await request.get(overlayUrl, { timeout: 60_000 });
  expect(overlayDl.ok()).toBeTruthy();
  const overlayJson2 = await overlayDl.json();

  const assembled = applyRewritesOverlay(canonJson as any, overlayJson2 as any) as any;
  const assembledParagraphBasis =
    assembled?.chapters?.[0]?.sections?.[0]?.content?.[0]?.basis || "";
  expect(String(assembledParagraphBasis)).toBe(rewritten);

  // Download + extract assets.zip to match worker behavior (portable, no absolute paths)
  const workDir = await import("node:fs/promises").then((m) => m.mkdtemp(path.join(os.tmpdir(), "iz-book-e2e-")));
  const assetsDl = await request.get(assetsZipUrl, { timeout: 60_000 });
  expect(assetsDl.ok()).toBeTruthy();
  const assetsZipBuf = Buffer.from(await assetsDl.body());
  const localZip = path.join(workDir, "assets.zip");
  const assetsDir = path.join(workDir, "assets");
  await import("node:fs/promises").then(async (m) => {
    await m.writeFile(localZip, assetsZipBuf);
  });
  await extractZip(localZip, assetsDir);

  const html = renderBookHtml(assembled, {
    target: "chapter",
    chapterIndex: 0,
    assetsBaseUrl: "assets",
    chapterOpeners: { 0: "images/chapter_openers/chapter_1_opener.svg" },
  });

  // Write to temp + render PDF via Prince
  await request
    .post(`${SUPABASE_URL}/functions/v1/book-job-heartbeat`, {
      // Optional: nudge heartbeat so job isn't marked stale if another process is watching.
      headers,
      data: { jobId },
      timeout: 30_000,
    })
    .catch(() => {});

  const htmlPath = path.join(workDir, "render.html");
  const assembledPath = path.join(workDir, "assembled.json");
  const pdfPath = path.join(workDir, "output.pdf");
  const logPath = path.join(workDir, "prince.log");

  await import("node:fs/promises").then(async (m) => {
    await m.writeFile(htmlPath, html, "utf-8");
    await m.writeFile(assembledPath, JSON.stringify(assembled, null, 2), "utf-8");
  });

  await runPrince({ htmlPath, pdfPath, logPath });

  const [htmlBuf, assembledBuf, pdfBuf, logBuf] = await import("node:fs/promises").then(async (m) => [
    await m.readFile(htmlPath),
    await m.readFile(assembledPath),
    await m.readFile(pdfPath),
    await m.readFile(logPath),
  ]);
  expect(pdfBuf.byteLength).toBeGreaterThan(1000);

  async function upload(fileName: string, buf: Buffer, contentType: string) {
    const upResp = await request.post(`${SUPABASE_URL}/functions/v1/book-job-upload-url`, {
      headers,
      data: { jobId, fileName },
      timeout: 60_000,
    });
    const upJson = (await upResp.json().catch(() => null)) as any;
    expect(upResp.ok()).toBeTruthy();
    expect(upJson?.ok).toBe(true);
    const signedUrl = String(upJson?.signedUrl || "");
    const objectPath = String(upJson?.path || "");
    expect(signedUrl).toContain("http");
    expect(objectPath).toContain(`/runs/${runId}/`);

    const putResp = await request.put(signedUrl, {
      headers: { "Content-Type": contentType },
      data: buf,
      timeout: 60_000,
    });
    expect(putResp.ok()).toBeTruthy();

    return { path: objectPath, bytes: buf.byteLength, contentType };
  }

  const upHtml = await upload("render.html", htmlBuf as any, "text/html");
  const upAssembled = await upload("assembled.json", assembledBuf as any, "application/json");
  const upPdf = await upload("output.pdf", pdfBuf as any, "application/pdf");
  const upLog = await upload("prince.log", logBuf as any, "text/plain");

  // Finalize
  const finalizeResp = await request.post(`${SUPABASE_URL}/functions/v1/book-job-apply-result`, {
    headers,
    data: {
      jobId,
      status: "done",
      progressStage: "completed",
      progressPercent: 100,
      progressMessage: "E2E local Prince render",
      resultPath: upPdf.path,
      artifacts: [
        { kind: "html", path: upHtml.path, bytes: upHtml.bytes, contentType: upHtml.contentType, chapterIndex: 0 },
        { kind: "assembled", path: upAssembled.path, bytes: upAssembled.bytes, contentType: upAssembled.contentType, chapterIndex: 0 },
        { kind: "pdf", path: upPdf.path, bytes: upPdf.bytes, contentType: upPdf.contentType, chapterIndex: 0 },
        { kind: "prince_log", path: upLog.path, bytes: upLog.bytes, contentType: upLog.contentType, chapterIndex: 0 },
      ],
    },
    timeout: 60_000,
  });
  const finalizeJson = (await finalizeResp.json().catch(() => null)) as any;
  expect(finalizeResp.ok()).toBeTruthy();
  expect(finalizeJson?.ok).toBe(true);

  // 7) Verify job status + artifacts recorded (real DB)
  const jobsResp = await request.get(
    `${SUPABASE_URL}/functions/v1/book-list?scope=jobs&runId=${encodeURIComponent(runId)}&limit=50&offset=0`,
    {
      headers: {
        "x-agent-token": AGENT_TOKEN,
        "x-organization-id": ORGANIZATION_ID,
      },
      timeout: 60_000,
    }
  );
  const jobsJson = (await jobsResp.json().catch(() => null)) as any;
  expect(jobsResp.ok()).toBeTruthy();
  expect(jobsJson?.ok).toBe(true);
  const jobs = Array.isArray(jobsJson?.jobs) ? jobsJson.jobs : [];
  const jobRow = jobs.find((j: any) => String(j?.id) === jobId);
  expect(jobRow).toBeTruthy();
  expect(String(jobRow.status)).toBe("done");
});


