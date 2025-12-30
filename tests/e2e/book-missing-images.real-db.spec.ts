import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { loadLocalEnvForTests } from "../helpers/load-local-env";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Attempt to auto-resolve required env vars from local env files (learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env before running real-db E2E`);
  }
  return String(v).trim();
}

function safeNowId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

test("real-db: book missing-images manager shows report + allows upload", async ({ page, request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
  const SUPABASE_ANON_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    requireEnv("SUPABASE_ANON_KEY");

  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const bookId = safeNowId("e2e-missing-images");
  const bookTitle = `E2E Missing Images ${new Date().toISOString().slice(0, 19)}`;

  const canonicalPath = path.join(process.cwd(), "samples", "books", "canonical.sample.json");
  const canonicalRaw = await readFile(canonicalPath, "utf-8");
  const canonical = JSON.parse(canonicalRaw) as any;
  canonical.meta = canonical.meta || {};
  canonical.meta.id = bookId;
  canonical.meta.title = bookTitle;

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

  // 2) Enqueue a render (creates run + job)
  const enqueueResp = await request.post(`${SUPABASE_URL}/functions/v1/book-enqueue-render`, {
    headers,
    data: {
      bookId,
      bookVersionId,
      target: "chapter",
      chapterIndex: 0,
      renderProvider: "prince_local",
      allowMissingImages: true,
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

  // 3) Upload a layout_report artifact to Storage (missing images report)
  const report = {
    generatedAt: new Date().toISOString(),
    allowMissingImages: true,
    missingImages: [
      {
        canonicalSrc: "figures/sample/figure_1.svg",
        basename: "figure_1.svg",
        suggestedUploadPath: `library/${bookId}/images/figure_1.svg`,
      },
    ],
  };
  const reportBuf = Buffer.from(JSON.stringify(report, null, 2), "utf-8");

  const upResp = await request.post(`${SUPABASE_URL}/functions/v1/book-job-upload-url`, {
    headers,
    data: { jobId, fileName: "layout_report.json" },
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
    headers: { "Content-Type": "application/json" },
    data: reportBuf,
    timeout: 60_000,
  });
  expect(putResp.ok()).toBeTruthy();

  // 4) Finalize job with the layout_report artifact (records DB row for the UI to load)
  const finalizeResp = await request.post(`${SUPABASE_URL}/functions/v1/book-job-apply-result`, {
    headers,
    data: {
      jobId,
      status: "done",
      progressStage: "completed",
      progressPercent: 100,
      progressMessage: "E2E missing images report",
      artifacts: [
        {
          kind: "layout_report",
          path: objectPath,
          bytes: reportBuf.byteLength,
          contentType: "application/json",
          chapterIndex: 0,
        },
      ],
    },
    timeout: 60_000,
  });
  const finalizeJson = (await finalizeResp.json().catch(() => null)) as any;
  expect(finalizeResp.ok()).toBeTruthy();
  expect(finalizeJson?.ok).toBe(true);

  // 5) Open the new admin page (real UI, real DB)
  await page.goto(`/admin/books/missing-images?bookId=${encodeURIComponent(bookId)}&runId=${encodeURIComponent(runId)}`);
  await page.waitForLoadState("domcontentloaded");

  // Wait for the missing image row to render from the layout_report
  await expect(page.getByText("figures/sample/figure_1.svg")).toBeVisible({ timeout: 60_000 });

  // 6) Upload an image for the missing canonicalSrc via the UI (real Storage + index upsert)
  const svgPath = path.join(process.cwd(), "samples", "books", "assets", "figures", "sample", "figure_1.svg");
  const uploadUrlWait = page.waitForResponse(
    (r) => r.url().includes("/functions/v1/book-library-upload-url") && r.request().method() === "POST",
    { timeout: 30_000 }
  );
  const upsertWait = page.waitForResponse(
    (r) => r.url().includes("/functions/v1/book-library-upsert-index") && r.request().method() === "POST",
    { timeout: 120_000 }
  );
  const uploadButton = page.getByRole("button", { name: "Upload image" }).first();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    uploadButton.click(),
  ]);
  await chooser.setFiles(svgPath);
  await page.dispatchEvent("#bookmissing-upload-0", "change", { bubbles: true, cancelable: true });
  await uploadUrlWait;

  const upsertResp = await upsertWait;
  expect(upsertResp.ok()).toBeTruthy();

  // Assert the mapping is actually usable by the pipeline (real DB + real Storage):
  // book-version-input-urls should now return a signed URL for the canonical src.
  const inputResp = await request.post(`${SUPABASE_URL}/functions/v1/book-version-input-urls`, {
    headers,
    data: {
      bookId,
      bookVersionId,
      target: "chapter",
      chapterIndex: 0,
      expiresIn: 3600,
      allowMissingImages: true,
    },
    timeout: 60_000,
  });
  const inputJson = (await inputResp.json().catch(() => null)) as any;
  expect(inputResp.ok()).toBeTruthy();
  expect(inputJson?.ok).toBe(true);
  const imageSrcMap = inputJson?.imageSrcMap as Record<string, string> | null | undefined;
  expect(imageSrcMap && typeof imageSrcMap === "object").toBeTruthy();
  const signed = imageSrcMap ? String(imageSrcMap["figures/sample/figure_1.svg"] || "") : "";
  expect(signed).toContain("http");
});


