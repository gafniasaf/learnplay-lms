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
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const bookId = safeNowId("e2e-missing-images");
  const bookTitle = `E2E Missing Images ${new Date().toISOString().slice(0, 19)}`;

  function encodeStoragePath(p: string): string {
    return String(p || "")
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
  }

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

  let primaryError: unknown = null;
  let cleanupError: string | null = null;

  // Ensure an empty image library index exists for this book.
  // book-ingest-version fails loudly if canonical references local images and there is no index.
  const emptyIndexPath = `library/${bookId}/images-index.json`;
  const emptyIndexObjectPath = encodeStoragePath(emptyIndexPath);
  const emptyIndex = {
    bookId,
    updatedAt: new Date().toISOString(),
    entries: [],
  };

  // Capture IDs/paths for cleanup.
  let bookVersionId = "";
  let runId = "";
  let jobId = "";
  let layoutReportObjectPath = "";

  try {
    // 0) Seed empty images-index.json (so ingest can reference a library mapping if canonical includes local images)
    const indexResp = await request.post(`${SUPABASE_URL}/storage/v1/object/books/${emptyIndexObjectPath}`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "x-upsert": "true",
      },
      data: Buffer.from(JSON.stringify(emptyIndex, null, 2), "utf-8"),
      timeout: 60_000,
    });
    expect(indexResp.ok()).toBeTruthy();

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
    bookVersionId = String(ingestJson?.bookVersionId || "").trim();
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
    runId = String(enqueueJson?.runId || "").trim();
    jobId = String(enqueueJson?.jobId || "").trim();
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
    layoutReportObjectPath = String(upJson?.path || "");
    expect(signedUrl).toContain("http");
    expect(layoutReportObjectPath).toContain(`/runs/${runId}/`);

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
            path: layoutReportObjectPath,
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
  } catch (e) {
    primaryError = e;
  } finally {
    // Cleanup: delete E2E fixture rows and known Storage objects so the real DB stays tidy.
    const adminHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    } as const;

    try {
      const problems: string[] = [];

      // Best-effort: delete known objects (ignore 404).
      const toDelete: string[] = [];
      if (bookVersionId) {
        toDelete.push(`${bookId}/${bookVersionId}/canonical.json`);
      }
      if (layoutReportObjectPath) {
        toDelete.push(layoutReportObjectPath);
      }
      toDelete.push(`library/${bookId}/images/figure_1.svg`);
      toDelete.push(`library/${bookId}/images-index.json`);

      for (const p of toDelete) {
        try {
          const resp = await request.delete(`${SUPABASE_URL}/storage/v1/object/books/${encodeStoragePath(p)}`, {
            headers: adminHeaders,
            timeout: 60_000,
          });
          const status = resp.status();
          if ([200, 204, 404].includes(status)) continue;

          const t = await resp.text().catch(() => "");
          // Supabase Storage sometimes returns 400 with a JSON body indicating a 404 not_found.
          const isNotFoundDisguised =
            status === 400 &&
            (t.includes('"statusCode":"404"') || t.includes('"statusCode":404') || t.toLowerCase().includes("object not found"));
          if (isNotFoundDisguised) continue;

          problems.push(`storage delete failed for ${p}: ${status} ${t.slice(0, 400)}`);
        } catch (e) {
          problems.push(`storage delete threw for ${p}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Delete the book row (cascades to versions/runs/jobs/artifacts).
      try {
        const delResp = await request.delete(`${SUPABASE_URL}/rest/v1/books?id=eq.${encodeURIComponent(bookId)}`, {
          headers: { ...adminHeaders, Prefer: "return=minimal" },
          timeout: 60_000,
        });
        if (![200, 204].includes(delResp.status())) {
          const t = await delResp.text().catch(() => "");
          problems.push(`db delete failed for books.id=${bookId}: ${delResp.status()} ${t.slice(0, 400)}`);
        }
      } catch (e) {
        problems.push(`db delete threw for books.id=${bookId}: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (problems.length) {
        cleanupError = `BLOCKED: cleanup failed for ${bookId}: ${problems.join(" | ").slice(0, 1200)}`;
      }
    } catch (e) {
      cleanupError = `BLOCKED: cleanup failed for ${bookId}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (cleanupError) {
    // Avoid masking the primary test failure with a cleanup failure.
    if (primaryError) {
      console.warn(cleanupError);
    } else {
      throw new Error(cleanupError);
    }
  }
  if (primaryError) throw primaryError;
});


