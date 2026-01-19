import { test, expect } from "@playwright/test";
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { loadLocalEnvForTests } from "../helpers/load-local-env";

import { renderBookHtml } from "../../src/lib/books/bookRendererCore.js";

// Attempt to auto-resolve required env vars from local env files (supabase/.deploy.env, learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function requireSupabaseUrl(): string {
  const vite = process.env.VITE_SUPABASE_URL;
  const plain = process.env.SUPABASE_URL;
  const value = (vite || plain || "").trim();
  if (!value) throw new Error("BLOCKED: VITE_SUPABASE_URL (or SUPABASE_URL) is required");
  return value;
}

function requireWriteModelSpec(): string {
  const explicit = process.env.E2E_BOOK_WRITE_MODEL;
  if (explicit && explicit.trim()) {
    const s = explicit.trim();
    const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL must be 'openai:<model>' or 'anthropic:<model>'");
    const provider = parts[0];
    if (provider !== "openai" && provider !== "anthropic") throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL provider must be 'openai' or 'anthropic'");
    const model = parts.slice(1).join(":").trim();
    if (!model) throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL model is missing");
    return `${provider}:${model}`;
  }

  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY);
  const hasOpenai = !!(process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY);
  if (hasAnthropic) return "anthropic:claude-sonnet-4-5";
  if (hasOpenai) return "openai:gpt-5.2";
  throw new Error("BLOCKED: Set ANTHROPIC_API_KEY or OPENAI_API_KEY (or set E2E_BOOK_WRITE_MODEL) to run live BookGen tests");
}

async function enqueueFactoryJob(opts: {
  request: any;
  supabaseUrl: string;
  agentToken: string;
  organizationId: string;
  jobType: string;
  payload: Record<string, unknown>;
}) {
  const { request, supabaseUrl, agentToken, organizationId, jobType, payload } = opts;
  const enqueueResp = await request.post(`${supabaseUrl}/functions/v1/enqueue-job`, {
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Token": agentToken,
      "X-Organization-Id": organizationId,
    },
    data: { jobType, payload },
  });
  expect(enqueueResp.ok()).toBeTruthy();
  const enqueueJson: any = await enqueueResp.json();
  if (enqueueJson?.ok !== true) {
    throw new Error(`enqueue-job returned ok=false: ${JSON.stringify(enqueueJson).slice(0, 800)}`);
  }
  const jobId = String(enqueueJson.jobId || "").trim();
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);
  return jobId;
}

async function waitForAgentJobDone(opts: {
  request: any;
  supabaseUrl: string;
  agentToken: string;
  organizationId: string;
  jobId: string;
  timeoutMs: number;
}) {
  const { request, supabaseUrl, agentToken, organizationId, jobId, timeoutMs } = opts;
  const start = Date.now();
  let lastStatus = "";
  let lastErr = "";

  while (Date.now() - start < timeoutMs) {
    const jobResp = await request.get(`${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=50`, {
      headers: {
        "X-Agent-Token": agentToken,
        "X-Organization-Id": organizationId,
      },
    });
    if (!jobResp.ok()) {
      const status = jobResp.status();
      const body = await jobResp.text().catch(() => "");
      // Treat transient gateway/rate-limit responses as retryable in live environments.
      if ([429, 502, 503, 504].includes(status)) {
        await new Promise((r) => setTimeout(r, 2_000));
        continue;
      }
      throw new Error(`get-job HTTP ${status}: ${String(body || "").slice(0, 300)}`);
    }
    const jobJson: any = await jobResp.json();
    expect(jobJson.ok).toBe(true);

    const status = String(jobJson.job?.status || "").toLowerCase();
    lastStatus = status;
    lastErr = String(jobJson.job?.error || "");

    if (status === "done") return jobJson;
    if (status === "failed" || status === "dead_letter" || status === "stale") {
      throw new Error(`Job ${jobId} failed (status=${status}): ${lastErr || "unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, 7_000));
  }

  throw new Error(`Timed out waiting for job ${jobId} to complete (lastStatus=${lastStatus}): ${lastErr}`);
}

async function runPrince(args: string[], { logPath }: { logPath: string }) {
  const princeCmd = (process.env.PRINCE_PATH || "").trim() || "prince";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(princeCmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      const combined = [out, err].filter(Boolean).join("\n");
      void writeFile(logPath, combined || "(no prince output)\n");
      if (code === 0) return resolve();
      reject(new Error(`Prince failed (exit ${code}). See log: ${logPath}`));
    });
  });
}

test.describe("Live: BookGen chapter → Prince PDF (microheadings + boxes + CSS)", () => {
  test("Generates a chapter and renders a styled chapter PDF + PNG preview", async ({ request }) => {
    test.setTimeout(25 * 60 * 1000);

    const supabaseUrl = requireSupabaseUrl();
    const agentToken = requireEnvVar("AGENT_TOKEN");
    const organizationId = requireEnvVar("ORGANIZATION_ID");
    const writeModel = requireWriteModelSpec();
    requireEnvVar("PRINCE_PATH"); // fail-loud if missing

    const bookId = `e2e-bookgen-pdf-${Date.now()}`;
    const chapterCount = 1;

    // 1) Create book + version + scaffold, but do NOT enqueue chapters yet.
    // We seed a deterministic PASS2-ish outline so this test is stable and actually validates:
    // - numbering (1.1 / 1.1.1)
    // - microheadings
    // - praktijk + verdieping boxes with box-lead spans
    const rootJobId = await enqueueFactoryJob({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobType: "book_generate_full",
      payload: {
        mode: "create",
        bookId,
        title: "E2E BookGen PDF (chapter render)",
        level: "n4",
        language: "nl",
        chapterCount,
        topic: "Korte uitleg over diffusie en osmose voor MBO.",
        enqueueChapters: false,
        layoutProfile: "pass2",
        microheadingDensity: "medium",
        sectionMaxTokens: 8000,
        // Ensure the chapter includes microheadings + both boxes in at least one paragraph.
        userInstructions:
          "Gebruik microheadings binnen elke sectie. " +
          "Gebruik voor praktijk/verdieping een lead met <span class=\"box-lead\">...</span>. " +
          "Zorg dat er minstens één In-de-praktijk én één Verdieping tekstblok voorkomt.",
        imagePromptLanguage: "book",
        writeModel,
      },
    });

    const rootFinal = await waitForAgentJobDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: rootJobId,
      timeoutMs: 7 * 60 * 1000,
    });
    const rootResult = rootFinal?.job?.result || {};
    const bookVersionId = String(rootResult.bookVersionId || "").trim();
    expect(bookVersionId).toMatch(/^[0-9a-f-]{36}$/i);

    // 2) Seed a minimal PASS2-style outline (single chapter, 1 section, 2 numbered subparagraphs)
    const outlineSkeleton: any = {
      meta: {
        bookId,
        bookVersionId,
        title: "E2E PASS2 mini outline (chapter PDF)",
        level: "n4",
        language: "nl",
        schemaVersion: "skeleton_v1",
      },
      styleProfile: null,
      chapters: [
        {
          id: "ch-1",
          number: 1,
          title: "1. Transport door membranen",
          openerImageSrc: null,
          sections: [
            {
              id: "1.1",
              title: "1.1 Diffusie en osmose",
              blocks: [
                {
                  type: "subparagraph",
                  id: "1.1.1",
                  title: "1.1.1 Diffusie",
                  blocks: [
                    { type: "paragraph", id: "seed-p-0001", basisHtml: "", images: null },
                  ],
                },
                {
                  type: "subparagraph",
                  id: "1.1.2",
                  title: "1.1.2 Osmose",
                  blocks: [
                    { type: "paragraph", id: "seed-p-0002", basisHtml: "", images: null },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const saveResp = await request.post(`${supabaseUrl}/functions/v1/book-version-save-skeleton`, {
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Token": agentToken,
        "X-Organization-Id": organizationId,
      },
      data: {
        bookId,
        bookVersionId,
        skeleton: outlineSkeleton,
        note: "Seed PASS2 mini outline (chapter PDF live test)",
        compileCanonical: true,
      },
    });
    expect(saveResp.ok()).toBeTruthy();
    const saveJson: any = await saveResp.json();
    expect(saveJson.ok).toBe(true);

    // 3) Enqueue + wait for the orchestrated chapter job (section subjobs + yield/requeue)
    const chapterJobId = await enqueueFactoryJob({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobType: "book_generate_chapter",
      payload: {
        organization_id: organizationId,
        bookId,
        bookVersionId,
        chapterIndex: 0,
        chapterCount,
        topic: "Korte uitleg over diffusie en osmose voor MBO.",
        level: "n4",
        language: "nl",
        userInstructions:
          "Volg de outline exact. " +
          "Gebruik microheadings (korte labels, zonder leestekens). " +
          "Zorg voor minstens één praktijkblok en één verdiepingblok met <span class=\"box-lead\">...</span> als lead.",
        imagePromptLanguage: "book",
        layoutProfile: "pass2",
        microheadingDensity: "medium",
        sectionMaxTokens: 8000,
        writeModel,
      },
    });

    await waitForAgentJobDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: chapterJobId,
      timeoutMs: 18 * 60 * 1000,
    });

    // 4) Download compiled canonical (preferred for rendering; reflects skeleton-first source of truth)
    const inputsResp = await request.post(`${supabaseUrl}/functions/v1/book-version-input-urls`, {
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Token": agentToken,
        "X-Organization-Id": organizationId,
      },
      data: {
        bookId,
        bookVersionId,
        expiresIn: 3600,
        target: "chapter",
        chapterIndex: 0,
        allowMissingImages: true,
        includeChapterOpeners: true,
      },
    });
    expect(inputsResp.ok()).toBeTruthy();
    const inputsJson: any = await inputsResp.json();
    expect(inputsJson.ok).toBe(true);

    // IMPORTANT: compiledCanonical reflects skeleton-first *structure* (used for image signing),
    // but the generated chapter content is persisted to canonical.json. Use canonical for rendering assertions.
    const canonicalUrl = String(inputsJson?.urls?.canonical?.signedUrl || "").trim();
    expect(canonicalUrl).toMatch(/^https?:\/\//i);

    const canonResp = await request.get(canonicalUrl);
    expect(canonResp.ok()).toBeTruthy();
    const canonical: any = await canonResp.json();

    // 5) Render HTML using the shared PASS2-inspired renderer
    const html = renderBookHtml(canonical, {
      target: "chapter",
      chapterIndex: 0,
      placeholdersOnly: true, // render visible placeholders instead of requiring assets.zip
    });

    // Assert: numbering + microheadings + both boxes + lead span + figure placeholder exist in HTML
    expect(html).toContain('class="micro-title"');
    expect(html).toContain('class="section-number">1.1</span>');
    expect(html).toContain('class="subparagraph-title"');
    expect(html).toContain('class="box praktijk"');
    expect(html).toContain('class="box verdieping"');
    expect(html).toContain('class="box-lead"');
    expect(html).toContain('figure-placeholder');

    // 6) Produce PDF + PNG preview via Prince
    const outDir = path.join("tmp", "e2e-bookgen-pdf", bookId);
    await mkdir(outDir, { recursive: true });
    const htmlPath = path.join(outDir, "chapter.html");
    const pdfPath = path.join(outDir, "chapter.pdf");
    const pdfLogPath = path.join(outDir, "prince-pdf.log");
    const pngLogPath = path.join(outDir, "prince-png.log");

    await writeFile(htmlPath, html, "utf8");

    // PDF
    await runPrince([htmlPath, "-o", pdfPath], { logPath: pdfLogPath });

    // PNG preview (first page)
    await runPrince(
      [
        "--raster-output=" + path.join(outDir, "chapter-preview-%d.png"),
        "--raster-format=png",
        "--raster-pages=all",
        "--raster-dpi=110",
        htmlPath,
      ],
      { logPath: pngLogPath },
    );

    // Final assertion: the preview image should be generated for page 1.
    const previewPath = path.join(outDir, "chapter-preview-1.png");
    expect(previewPath.endsWith("chapter-preview-1.png")).toBe(true);
    await stat(previewPath);
  });
});


