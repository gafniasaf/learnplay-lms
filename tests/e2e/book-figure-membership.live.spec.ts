import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { loadLocalEnvForTests } from "../helpers/load-local-env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

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

function encodeStoragePath(p: string): string {
  return String(p || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

async function runWorkerUntilDone(jobId: string, env: Record<string, string>, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("node", ["book-worker/worker.mjs"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new Error(`Worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`Worker failed (exit ${code})\nSTDOUT:\n${out.slice(0, 2000)}\nSTDERR:\n${err.slice(0, 2000)}`));
    });
  });
}

test("live: semantic figure membership persists and beats filename numbering (real DB + real LLM)", async ({ request }) => {
  // This test runs a full book render + semantic figure placement (real LLM) and can take longer than the suite default.
  test.setTimeout(15 * 60_000);
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
  const SUPABASE_ANON_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    requireEnv("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  // Required for the worker (local Prince render).
  requireEnv("PRINCE_PATH");

  // Required for semantic figure placement (real LLM).
  requireEnv("ANTHROPIC_API_KEY");

  const bookId = safeNowId("e2e-figure-membership");
  const bookTitle = `E2E Figure Membership ${new Date().toISOString().slice(0, 19)}`;

  // Minimal text-only canonical: two chapters with non-sequential numbers.
  // Chapter numbers intentionally mismatch the figure numbering to reproduce the drift bug.
  const gordonParagraphId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const avgParagraphId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const canonical = {
    meta: { id: bookId, title: bookTitle },
    chapters: [
      {
        number: "2",
        title: "Gordon en patronen",
        sections: [
          {
            number: "2.1",
            title: "Gordon in de praktijk",
            content: [
              {
                type: "paragraph",
                id: gordonParagraphId,
                basis:
                  "In deze sectie gaat het over Gordon, patronen en uitscheiding. " +
                  "Patroon 3 van Gordon gaat bijvoorbeeld over uitscheiding en voeding.",
              },
            ],
          },
        ],
      },
      {
        number: "5",
        title: "Persoonsgegevens en AVG",
        sections: [
          {
            number: "5.1",
            title: "AVG en persoonsgegevens",
            content: [
              {
                type: "paragraph",
                id: avgParagraphId,
                basis:
                  "In deze sectie gaat het over persoonsgegevens en de AVG. " +
                  "Het is belangrijk om in het zorg(leef)plan zorgvuldig met persoonsgegevens om te gaan.",
              },
            ],
          },
        ],
      },
    ],
  };

  const headers = {
    "Content-Type": "application/json",
    "x-agent-token": AGENT_TOKEN,
    "x-organization-id": ORGANIZATION_ID,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  } as const;

  let primaryError: unknown = null;
  let cleanupError: string | null = null;

  // Capture for cleanup/assertions
  let bookVersionId = "";
  let runId = "";
  let jobId = "";
  const libraryObjectPaths: string[] = [];

  const gordonFigureSrc = "Image 5.1 Patroon 3 van Gordon uitscheiding.svg";
  const avgFigureSrc = "Image 2.1 Schema AVG persoonsgegevens.svg";

  try {
    // 1) Ingest canonical version (text-only; no embedded images).
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

    // 2) Upload two "misleadingly numbered" library images and upsert the library index.
    const svgPath = path.join(process.cwd(), "samples", "books", "assets", "figures", "sample", "figure_1.svg");
    const svgBuf = await readFile(svgPath);

    async function uploadLibraryImage(canonicalSrc: string): Promise<string> {
      const uploadUrlResp = await request.post(`${SUPABASE_URL}/functions/v1/book-library-upload-url`, {
        headers,
        data: { bookId, canonicalSrc },
        timeout: 60_000,
      });
      const uploadUrlJson = (await uploadUrlResp.json().catch(() => null)) as any;
      expect(uploadUrlResp.ok()).toBeTruthy();
      expect(uploadUrlJson?.ok).toBe(true);
      const signedUrl = String(uploadUrlJson?.signedUrl || "");
      const objectPath = String(uploadUrlJson?.path || "");
      expect(signedUrl).toContain("http");
      expect(objectPath).toContain(`library/${bookId}/images/`);

      const put = await request.put(signedUrl, {
        headers: { "Content-Type": "image/svg+xml" },
        data: svgBuf,
        timeout: 60_000,
      });
      expect(put.ok()).toBeTruthy();
      libraryObjectPaths.push(objectPath);
      return objectPath;
    }

    const gordonStoragePath = await uploadLibraryImage(gordonFigureSrc);
    const avgStoragePath = await uploadLibraryImage(avgFigureSrc);

    const upsertResp = await request.post(`${SUPABASE_URL}/functions/v1/book-library-upsert-index`, {
      headers,
      data: {
        bookId,
        mappings: [
          { canonicalSrc: gordonFigureSrc, storagePath: gordonStoragePath },
          { canonicalSrc: avgFigureSrc, storagePath: avgStoragePath },
        ],
      },
      timeout: 60_000,
    });
    const upsertJson = (await upsertResp.json().catch(() => null)) as any;
    expect(upsertResp.ok()).toBeTruthy();
    if (upsertJson?.ok !== true) {
      throw new Error(`book-library-upsert-index failed: ${JSON.stringify(upsertJson)}`);
    }

    // 3) Enqueue a chapter render job that will need library figure placement.
    const enqueueResp = await request.post(`${SUPABASE_URL}/functions/v1/book-enqueue-render`, {
      headers,
      data: {
        bookId,
        bookVersionId,
        target: "chapter",
        chapterIndex: 1, // chapter number "5" (AVG) — numeric heuristic would wrongly attach gordonFigureSrc here
        renderProvider: "prince_local",
        allowMissingImages: false,
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

    // 4) Run the worker until the specific job is processed.
    await runWorkerUntilDone(
      jobId,
      {
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        AGENT_TOKEN,
        PRINCE_PATH: requireEnv("PRINCE_PATH"),
        BOOK_WORKER_STOP_AFTER_JOB_ID: jobId,
        BOOK_WORKER_MAX_JOBS: "50",
        POLL_INTERVAL_MS: "750",
        BOOK_WORKER_DNS_RESULT_ORDER: "ipv4first",
        BOOK_FIGURE_PLACEMENT_PROVIDER: "anthropic",
        BOOK_FIGURE_PLACEMENT_MODEL: "claude-haiku-4-5-20251001",
      },
      12 * 60_000
    );

    // 5) Assert the persisted placements exist and reflect semantic membership (real DB).
    const adminHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    } as const;

    const fpResp = await request.get(
      `${SUPABASE_URL}/rest/v1/book_versions?select=book_id,book_version_id,figure_placements&book_id=eq.${encodeURIComponent(bookId)}&book_version_id=eq.${encodeURIComponent(bookVersionId)}`,
      { headers: adminHeaders, timeout: 60_000 }
    );
    expect(fpResp.ok()).toBeTruthy();
    const fpRows = (await fpResp.json().catch(() => null)) as any;
    expect(Array.isArray(fpRows)).toBe(true);
    expect(fpRows.length).toBe(1);

    const fp = fpRows?.[0]?.figure_placements;
    expect(fp && typeof fp === "object").toBe(true);
    const placements = fp?.placements;
    expect(placements && typeof placements === "object").toBe(true);

    const gordonPlacement = placements?.[gordonFigureSrc];
    const avgPlacement = placements?.[avgFigureSrc];
    expect(gordonPlacement).toBeTruthy();
    expect(avgPlacement).toBeTruthy();

    // Gordon figure is misleadingly numbered 5.1 but MUST land in the Gordon chapter (index 0).
    expect(gordonPlacement.chapter_index).toBe(0);
    expect(String(gordonPlacement.paragraph_id)).toBe(gordonParagraphId);

    // AVG figure is misleadingly numbered 2.1 but MUST land in the AVG chapter (index 1).
    expect(avgPlacement.chapter_index).toBe(1);
    expect(String(avgPlacement.paragraph_id)).toBe(avgParagraphId);

    // 6) Assert the job finished (sanity).
    const jobsResp = await request.get(
      `${SUPABASE_URL}/functions/v1/book-list?scope=jobs&runId=${encodeURIComponent(runId)}&limit=50&offset=0`,
      {
        headers: {
          "x-agent-token": AGENT_TOKEN,
          "x-organization-id": ORGANIZATION_ID,
          Accept: "application/json",
        },
        timeout: 60_000,
      }
    );
    const jobsJson = (await jobsResp.json().catch(() => null)) as any;
    expect(jobsResp.ok()).toBeTruthy();
    expect(jobsJson?.ok).toBe(true);
    const jobs = Array.isArray(jobsJson?.jobs) ? jobsJson.jobs : [];
    const row = jobs.find((j: any) => String(j?.id) === jobId);
    expect(row).toBeTruthy();
    expect(["done", "failed"].includes(String(row?.status))).toBe(true);
    if (String(row?.status) === "failed") {
      throw new Error(`Job failed unexpectedly: ${String(row?.error || "").slice(0, 2000)}`);
    }
  } catch (e) {
    primaryError = e;
  } finally {
    // Cleanup: remove library objects + canonical, then delete book row (cascades to versions/runs/jobs/artifacts).
    try {
      const problems: string[] = [];
      const adminHeaders = {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      } as const;

      const toDelete: string[] = [];
      if (bookVersionId) toDelete.push(`${bookId}/${bookVersionId}/canonical.json`);
      toDelete.push(`library/${bookId}/images-index.json`);
      for (const p of libraryObjectPaths) toDelete.push(p);

      for (const p of toDelete) {
        try {
          const resp = await request.delete(`${SUPABASE_URL}/storage/v1/object/books/${encodeStoragePath(p)}`, {
            headers: adminHeaders,
            timeout: 60_000,
          });
          const status = resp.status();
          if ([200, 204, 404].includes(status)) continue;
          const t = await resp.text().catch(() => "");
          const isNotFoundDisguised =
            status === 400 &&
            (t.includes('"statusCode":"404"') || t.includes('"statusCode":404') || t.toLowerCase().includes("object not found"));
          if (isNotFoundDisguised) continue;
          problems.push(`storage delete failed for ${p}: ${status} ${t.slice(0, 300)}`);
        } catch (e) {
          problems.push(`storage delete threw for ${p}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      try {
        const delResp = await request.delete(`${SUPABASE_URL}/rest/v1/books?id=eq.${encodeURIComponent(bookId)}`, {
          headers: { ...adminHeaders, Prefer: "return=minimal" },
          timeout: 60_000,
        });
        if (![200, 204].includes(delResp.status())) {
          const t = await delResp.text().catch(() => "");
          problems.push(`db delete failed for books.id=${bookId}: ${delResp.status()} ${t.slice(0, 300)}`);
        }
      } catch (e) {
        problems.push(`db delete threw for books.id=${bookId}: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (problems.length) cleanupError = `BLOCKED: cleanup failed for ${bookId}: ${problems.join(" | ").slice(0, 1200)}`;
    } catch (e) {
      cleanupError = `BLOCKED: cleanup failed for ${bookId}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (cleanupError) {
    if (primaryError) {
      console.warn(cleanupError);
    } else {
      throw new Error(cleanupError);
    }
  }
  if (primaryError) throw primaryError;
});


