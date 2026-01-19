import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { loadLocalEnvForTests } from "../helpers/load-local-env";

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

async function driveAgentQueueOnce(opts: {
  request: any;
  supabaseUrl: string;
  agentToken: string;
  organizationId: string;
}) {
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

async function getAgentJob(opts: {
  request: any;
  supabaseUrl: string;
  agentToken: string;
  organizationId: string;
  jobId: string;
}) {
  const { request, supabaseUrl, agentToken, organizationId, jobId } = opts;
  const jobResp = await request.get(`${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=50`, {
    headers: {
      "X-Agent-Token": agentToken,
      "X-Organization-Id": organizationId,
    },
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

test.describe("Live: Admin Book Generation Monitor (real DB + real LLM)", () => {
  test("Can load /admin/book-monitor and pause/resume chaining between chapters", async ({ page, request }) => {
    test.setTimeout(25 * 60 * 1000);

    const supabaseUrl = requireEnvVar("VITE_SUPABASE_URL");
    const agentToken = requireEnvVar("AGENT_TOKEN");
    const organizationId = requireEnvVar("ORGANIZATION_ID");

    const bookId = `e2e-bookmonitor-${Date.now()}`;
    const chapterCount = 2;

    // 1) Create book + version + scaffold, but do NOT enqueue chapters yet.
    const rootJobId = await enqueueFactoryJob({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobType: "book_generate_full",
      payload: {
        mode: "create",
        bookId,
        title: "E2E Book Monitor",
        level: "n4",
        language: "nl",
        chapterCount,
        topic: "Korte uitleg over diffusie en osmose voor MBO.",
        enqueueChapters: false,
        writeModel: "anthropic:claude-sonnet-4-5",
      },
    });

    const rootFinal = await driveQueueUntilDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: rootJobId,
      timeoutMs: 8 * 60 * 1000,
    });
    const rootResult = rootFinal?.job?.result || {};
    const bookVersionId = String(rootResult.bookVersionId || "").trim();
    expect(bookVersionId).toMatch(/^[0-9a-f-]{36}$/i);

    // 2) Seed a minimal multi-chapter outline (2 chapters, 1 section each, 2 subparagraphs each)
    const outlineSkeleton: any = {
      meta: {
        bookId,
        bookVersionId,
        title: "E2E Monitor Outline",
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
                  blocks: [{ type: "paragraph", id: "seed-p-0001", basisHtml: "", images: null }],
                },
                {
                  type: "subparagraph",
                  id: "1.1.2",
                  title: "1.1.2 Osmose",
                  blocks: [{ type: "paragraph", id: "seed-p-0002", basisHtml: "", images: null }],
                },
              ],
            },
          ],
        },
        {
          id: "ch-2",
          number: 2,
          title: "2. Factoren en toepassingen",
          openerImageSrc: null,
          sections: [
            {
              id: "2.1",
              title: "2.1 Factoren",
              blocks: [
                {
                  type: "subparagraph",
                  id: "2.1.1",
                  title: "2.1.1 Temperatuur",
                  blocks: [{ type: "paragraph", id: "seed-p-0003", basisHtml: "", images: null }],
                },
                {
                  type: "subparagraph",
                  id: "2.1.2",
                  title: "2.1.2 Toepassing",
                  blocks: [{ type: "paragraph", id: "seed-p-0004", basisHtml: "", images: null }],
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
        note: "Seed E2E monitor outline",
        compileCanonical: true,
      },
    });
    expect(saveResp.ok()).toBeTruthy();
    const saveJson: any = await saveResp.json();
    expect(saveJson.ok).toBe(true);

    // 3) Open monitor UI + select book
    await page.goto("/admin/book-monitor?includeTest=1");
    await expect(page.locator("text=Book Generation Monitor")).toBeVisible();

    const select = page.locator('select[data-cta-id="cta-bookmonitor-book-select"]');
    await expect(select).toBeVisible();
    await select.selectOption({ value: bookId });

    // Wait until the version badge reflects the created version (ensures skeleton/meta loaded)
    await expect(page.locator(".book-meta")).toContainText(bookVersionId.slice(0, 8), { timeout: 30_000 });

    // 4) Click Generate All (intercept enqueue-job response to capture jobId)
    const enqueueRespP = page.waitForResponse((r) => r.url().includes("/functions/v1/enqueue-job") && r.request().method() === "POST");
    await page.locator('button[data-cta-id="cta-generate-all"]').click();
    const enqueueResp = await enqueueRespP;
    expect(enqueueResp.ok()).toBeTruthy();
    const enqueueJson: any = await enqueueResp.json();
    expect(enqueueJson.ok).toBe(true);
    const chapterJobId = String(enqueueJson.jobId || "").trim();
    expect(chapterJobId).toMatch(/^[0-9a-f-]{36}$/i);

    // 5) Pause chaining before chapter 1 completes
    const pauseRespP = page.waitForResponse((r) => r.url().includes("/functions/v1/book-generation-control") && r.request().method() === "POST");
    await page.locator('button[data-cta-id="cta-pause"]').click();
    const pauseResp = await pauseRespP;
    expect(pauseResp.ok()).toBeTruthy();
    const pauseJson: any = await pauseResp.json();
    expect(pauseJson.ok).toBe(true);

    // 6) Drive queue until chapter 1 completes (real LLM work happens here)
    await driveQueueUntilDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: chapterJobId,
      timeoutMs: 18 * 60 * 1000,
    });

    // Assert: Ch2 is NOT queued (pause stops between chapters)
    const ch2Cell = page.locator('.chapter-cell[data-payload-chapter="2"]');
    await expect(ch2Cell).toHaveClass(/pending|failed|done/);
    await expect(ch2Cell).not.toHaveClass(/queued|active/);

    // 7) Resume (should enqueue next chapter)
    const resumeEnqueueP = page.waitForResponse((r) => r.url().includes("/functions/v1/enqueue-job") && r.request().method() === "POST");
    await page.locator('button[data-cta-id="cta-resume"]').click();
    const enqueue2Resp = await resumeEnqueueP;
    expect(enqueue2Resp.ok()).toBeTruthy();
    const enqueue2Json: any = await enqueue2Resp.json();
    expect(enqueue2Json.ok).toBe(true);
    const chapter2JobId = String(enqueue2Json.jobId || "").trim();
    expect(chapter2JobId).toMatch(/^[0-9a-f-]{36}$/i);

    // 8) Drive queue until chapter 2 completes
    await driveQueueUntilDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: chapter2JobId,
      timeoutMs: 18 * 60 * 1000,
    });

    // Assert: chapter 2 shows done in UI
    await expect(ch2Cell).toHaveClass(/done/, { timeout: 60_000 });
  });
});


