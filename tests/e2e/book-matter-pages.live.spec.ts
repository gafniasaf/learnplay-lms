import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { loadLocalEnvForTests } from "../helpers/load-local-env";
import { spawn } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Attempt to auto-resolve required env vars from local env files (supabase/.deploy.env, learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set env var before running live E2E`);
  }
  return String(v).trim();
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
    timeout: 60_000,
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

async function driveAgentQueueOnce(opts: { request: any; supabaseUrl: string; agentToken: string; organizationId: string }) {
  const { request, supabaseUrl, agentToken, organizationId } = opts;
  const workerResp = await request.post(`${supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent`, {
    timeout: 240_000,
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Token": agentToken,
      "X-Organization-Id": organizationId,
    },
    data: { worker: true, queue: "agent" },
  });
  expect(workerResp.ok()).toBeTruthy();
}

async function getAgentJob(opts: { request: any; supabaseUrl: string; agentToken: string; organizationId: string; jobId: string }) {
  const { request, supabaseUrl, agentToken, organizationId, jobId } = opts;
  const jobResp = await request.get(`${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=50`, {
    headers: {
      "X-Agent-Token": agentToken,
      "X-Organization-Id": organizationId,
    },
    timeout: 60_000,
  });
  expect(jobResp.ok()).toBeTruthy();
  const jobJson: any = await jobResp.json();
  expect(jobJson.ok).toBe(true);
  return jobJson;
}

async function driveQueueUntilDone(opts: {
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
    await driveAgentQueueOnce({ request, supabaseUrl, agentToken, organizationId });
    const jobJson = await getAgentJob({ request, supabaseUrl, agentToken, organizationId, jobId });
    const status = String(jobJson.job?.status || "").toLowerCase();
    lastStatus = status;
    lastErr = String(jobJson.job?.error || "");
    if (status === "done") return jobJson;
    if (status === "failed" || status === "dead_letter" || status === "stale") {
      throw new Error(`Job ${jobId} failed (status=${status}): ${lastErr || "unknown error"}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Timed out waiting for job ${jobId} to complete (lastStatus=${lastStatus}): ${lastErr}`);
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

async function extractPdfTextPagesFromBuf(buf: Buffer) {
  const loadingTask = pdfjs.getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    const str = (text.items || []).map((it: any) => (it && typeof it.str === "string" ? it.str : "")).join(" ");
    pages.push(str);
  }
  return pages;
}

test.describe("Live: book matter PNG pages (real DB + real LLM)", () => {
  test("Index+Begrippen jobs + full-book render produces matter PNGs and valid page-map", async ({ request }) => {
    test.setTimeout(30 * 60_000);

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      requireEnv("SUPABASE_ANON_KEY");

    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
    const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");
    const PRINCE_PATH = requireEnv("PRINCE_PATH");

    const bookId = `e2e-matter-${Date.now()}`;
    const chapterCount = 2;

    // 1) Create book scaffold
    const rootJobId = await enqueueFactoryJob({
      request,
      supabaseUrl: SUPABASE_URL,
      agentToken: AGENT_TOKEN,
      organizationId: ORGANIZATION_ID,
      jobType: "book_generate_full",
      payload: {
        mode: "create",
        bookId,
        title: "E2E Matter Book",
        level: "n4",
        language: "nl",
        chapterCount,
        topic: "E2E matter pages test.",
        enqueueChapters: false,
        writeModel: "anthropic:claude-sonnet-4-5",
      },
    });

    const rootFinal = await driveQueueUntilDone({
      request,
      supabaseUrl: SUPABASE_URL,
      agentToken: AGENT_TOKEN,
      organizationId: ORGANIZATION_ID,
      jobId: rootJobId,
      timeoutMs: 10 * 60_000,
    });
    const rootResult = rootFinal?.job?.result || {};
    const bookVersionId = String(rootResult.bookVersionId || "").trim();
    expect(bookVersionId).toMatch(/^[0-9a-f-]{36}$/i);

    // 2) Seed skeleton with enough <<BOLD_START>> terms for Index/Begrippen generation
    const terms = Array.from({ length: 140 }, (_, i) => `Term${i + 1}`);
    const mkParas = (startIdx: number, count: number) =>
      Array.from({ length: count }, (_, i) => {
        const term = terms[startIdx + i];
        return {
          type: "paragraph",
          id: `seed-p-${String(startIdx + i + 1).padStart(4, "0")}`,
          basisHtml: `In deze paragraaf leer je over <<BOLD_START>>${term}<<BOLD_END>> in de praktijk.`,
          images: null,
        };
      });

    const outlineSkeleton: any = {
      meta: {
        bookId,
        bookVersionId,
        title: "E2E Matter Outline",
        level: "n4",
        language: "nl",
        schemaVersion: "skeleton_v1",
      },
      styleProfile: null,
      chapters: [
        {
          id: "ch-1",
          number: 1,
          title: "1. Hoofdstuk Eén",
          openerImageSrc: null,
          sections: [
            {
              id: "1.1",
              title: "1.1 Inleiding",
              blocks: [
                { type: "subparagraph", id: "1.1.1", title: "1.1.1 Basis", blocks: mkParas(0, 70) },
              ],
            },
          ],
        },
        {
          id: "ch-2",
          number: 2,
          title: "2. Hoofdstuk Twee",
          openerImageSrc: null,
          sections: [
            {
              id: "2.1",
              title: "2.1 Verdieping",
              blocks: [
                { type: "subparagraph", id: "2.1.1", title: "2.1.1 Vervolg", blocks: mkParas(70, 70) },
              ],
            },
          ],
        },
      ],
    };

    const headers = {
      "Content-Type": "application/json",
      "X-Agent-Token": AGENT_TOKEN,
      "X-Organization-Id": ORGANIZATION_ID,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    } as const;

    const saveSkResp = await request.post(`${SUPABASE_URL}/functions/v1/book-version-save-skeleton`, {
      headers,
      data: { bookId, bookVersionId, skeleton: outlineSkeleton, note: "E2E matter seed", compileCanonical: true },
      timeout: 120_000,
    });
    const saveSkJson: any = await saveSkResp.json().catch(() => null);
    expect(saveSkResp.ok()).toBeTruthy();
    expect(saveSkJson?.ok).toBe(true);

    // 3) Upload matter-pack.json
    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const matterPack = {
      schemaVersion: "matter_pack_v1",
      bookId,
      bookVersionId,
      language: "nl",
      theme: {
        pageWidthMm: 210,
        pageHeightMm: 297,
        colors: {
          hboDonkerblauw: "#1e3a5f",
          vpGroen: "#2ba573",
          vpGroenLight: "#4cc793",
          textBlack: "#222222",
          textGray: "#666666",
          textLightGray: "#888888",
          bgWhite: "#ffffff",
          bgOffWhite: "#f9f9f9",
          accentBlue: "#007bc7",
        },
      },
      titlePage: {
        titleHtml: "E2E<br>Boek<br><em>voor het mbo</em>",
        authors: ["E2E Author"],
        logoText: "ExpertCollege",
      },
      colophon: {
        isbn: "9780000000000",
        nur: "184",
        trefwoorden: "test, e2e, matter",
        blocks: ["Dit is een E2E uitgave van ExpertCollege"],
        legalText: "© Copyright 2026 ExpertCollege\nAlle rechten voorbehouden.",
      },
      toc: { title: "Inhoudsopgave", preamble: [{ label: "Introductie", page: "xv" }] },
      promo: {
        enabled: true,
        title: "MBOLEREN.NL",
        paragraphs: ["Mboleren.nl is het online leerplatform van ExpertCollege."],
        sections: [{ title: "Over de e-learningmodulen", paragraphs: ["Onze e-learningmodulen zijn overzichtelijk."] }],
        bullets: ["videomateriaal: Video’s en animaties", "simulaties: Handelingen oefenen"],
        ctaLabel: "Bekijk de interactieve animatie online",
      },
      index: { title: "Index" },
      glossary: { title: "Begrippen", footerLabel: "BEGRIPPEN" },
    };

    const mpPath = `books/${bookId}/${bookVersionId}/matter/matter-pack.json`;
    const { error: mpErr } = await adminSupabase.storage.from("books").upload(mpPath, JSON.stringify(matterPack, null, 2), {
      upsert: true,
      contentType: "application/json",
    });
    if (mpErr) throw new Error(`Failed to upload matter pack: ${mpErr.message}`);

    // 4) Generate index + glossary via real Edge LLM calls
    const idxJobId = await enqueueFactoryJob({
      request,
      supabaseUrl: SUPABASE_URL,
      agentToken: AGENT_TOKEN,
      organizationId: ORGANIZATION_ID,
      jobType: "book_generate_index",
      payload: { bookId, bookVersionId, language: "nl", writeModel: "anthropic:claude-sonnet-4-5" },
    });
    await driveQueueUntilDone({
      request,
      supabaseUrl: SUPABASE_URL,
      agentToken: AGENT_TOKEN,
      organizationId: ORGANIZATION_ID,
      jobId: idxJobId,
      timeoutMs: 12 * 60_000,
    });

    const glJobId = await enqueueFactoryJob({
      request,
      supabaseUrl: SUPABASE_URL,
      agentToken: AGENT_TOKEN,
      organizationId: ORGANIZATION_ID,
      jobType: "book_generate_glossary",
      payload: { bookId, bookVersionId, language: "nl", writeModel: "anthropic:claude-sonnet-4-5" },
    });
    await driveQueueUntilDone({
      request,
      supabaseUrl: SUPABASE_URL,
      agentToken: AGENT_TOKEN,
      organizationId: ORGANIZATION_ID,
      jobId: glJobId,
      timeoutMs: 12 * 60_000,
    });

    // 5) Enqueue full-book render (prince_local required for rasterization)
    const enqueueResp = await request.post(`${SUPABASE_URL}/functions/v1/book-enqueue-render`, {
      headers,
      data: {
        bookId,
        bookVersionId,
        target: "book",
        renderProvider: "prince_local",
        pipelineMode: "render_only",
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

    // 6) Run local worker until this job is processed
    await runWorkerUntilDone(
      jobId,
      {
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        AGENT_TOKEN,
        PRINCE_PATH,
        BOOK_WORKER_STOP_AFTER_JOB_ID: jobId,
        BOOK_WORKER_MAX_JOBS: "50",
        POLL_INTERVAL_MS: "750",
        BOOK_WORKER_DNS_RESULT_ORDER: "ipv4first",
      },
      15 * 60_000
    );

    // 7) Assert artifacts include matter PNGs and page-map + body-only PDF
    const artifactsResp = await request.get(
      `${SUPABASE_URL}/functions/v1/book-list?scope=artifacts&runId=${encodeURIComponent(runId)}&limit=200&offset=0`,
      {
        headers: {
          "x-agent-token": AGENT_TOKEN,
          "x-organization-id": ORGANIZATION_ID,
          Accept: "application/json",
        },
        timeout: 60_000,
      }
    );
    expect(artifactsResp.ok()).toBeTruthy();
    const artifactsJson: any = await artifactsResp.json().catch(() => null);
    expect(artifactsJson?.ok).toBe(true);
    const artifacts = Array.isArray(artifactsJson?.artifacts) ? artifactsJson.artifacts : [];

    const paths = artifacts.map((a: any) => String(a?.path || ""));
    const has = (needle: string) => paths.some((p: string) => p.includes(needle));

    expect(has("output.pdf")).toBe(true);
    expect(has("page-map.json")).toBe(true);
    expect(has("body-only.output.pdf")).toBe(true);
    expect(has("matter.title.1.png")).toBe(true);
    expect(has("matter.index.1.png")).toBe(true);
    expect(has("matter.glossary.1.png")).toBe(true);

    // 8) Download page-map + body-only PDF and assert a couple term page refs are consistent
    async function signedUrlForObject(objectPath: string): Promise<string> {
      const res = await request.post(`${SUPABASE_URL}/functions/v1/book-artifact-url`, {
        headers,
        data: { path: objectPath, expiresIn: 3600 },
        timeout: 60_000,
      });
      const j: any = await res.json().catch(() => null);
      expect(res.ok()).toBeTruthy();
      expect(j?.ok).toBe(true);
      const url = String(j?.signedUrl || "").trim();
      expect(url).toContain("http");
      return url;
    }

    const pageMapPath = paths.find((p: string) => p.includes("page-map.json"))!;
    const pageMapUrl = await signedUrlForObject(pageMapPath);
    const pageMapText = await (await fetch(pageMapUrl)).text();
    const pageMap = JSON.parse(pageMapText);
    expect(pageMap.schemaVersion).toBe("page_map_v1");
    expect(typeof pageMap.pages).toBe("number");

    const bodyPdfPath = paths.find((p: string) => p.includes("body-only.output.pdf"))!;
    const bodyPdfUrl = await signedUrlForObject(bodyPdfPath);
    const bodyPdfBuf = Buffer.from(await (await fetch(bodyPdfUrl)).arrayBuffer());
    const bodyPages = await extractPdfTextPagesFromBuf(bodyPdfBuf);
    expect(bodyPages.length).toBeGreaterThan(0);

    const termPages: Record<string, number> = pageMap?.index?.termPages || {};
    const sampleTerms = ["Term1", "Term20", "Term70"].filter((t) => typeof termPages[t] === "number");
    expect(sampleTerms.length).toBeGreaterThan(0);
    for (const t of sampleTerms) {
      const pageNum = termPages[t];
      expect(pageNum).toBeGreaterThanOrEqual(1);
      expect(pageNum).toBeLessThanOrEqual(bodyPages.length);
      const text = String(bodyPages[pageNum - 1] || "");
      expect(text).toContain(t);
    }

    // Sanity: TOC chapter 1 should resolve to page 1 in the body page-map (since we reset counters in final assembly).
    const toc = Array.isArray(pageMap?.toc) ? pageMap.toc : [];
    const ch1 = toc.find((x: any) => x?.type === "chapter" && x?.chapterIndex === 0);
    expect(ch1?.page).toBe(1);
  });
});


