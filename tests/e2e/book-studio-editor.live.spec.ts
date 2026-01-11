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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function requireWriteModelSpec(): string {
  const explicit = process.env.E2E_BOOK_WRITE_MODEL;
  if (explicit && explicit.trim()) {
    const s = explicit.trim();
    const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) {
      throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL must be 'openai:<model>' or 'anthropic:<model>'");
    }
    const provider = parts[0];
    if (provider !== "openai" && provider !== "anthropic") {
      throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL provider must be 'openai' or 'anthropic'");
    }
    const model = parts.slice(1).join(":").trim();
    if (!model) throw new Error("BLOCKED: E2E_BOOK_WRITE_MODEL model is missing");
    return `${provider}:${model}`;
  }

  // Choose based on which local env is configured (should match Supabase secrets for live runs).
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

async function runAgentJobToDone(opts: {
  request: any;
  supabaseUrl: string;
  agentToken: string;
  organizationId: string;
  jobId: string;
  maxAttempts?: number;
}) {
  const { request, supabaseUrl, agentToken, organizationId, jobId, maxAttempts = 6 } = opts;
  let final: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const workerResp = await request.post(
      `${supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`,
      {
        timeout: 240_000,
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Token": agentToken,
          "X-Organization-Id": organizationId,
        },
        data: { worker: true, queue: "agent", jobId },
      }
    );
    expect(workerResp.ok()).toBeTruthy();

    const jobResp = await request.get(`${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=200`, {
      headers: {
        "X-Agent-Token": agentToken,
        "X-Organization-Id": organizationId,
      },
    });
    expect(jobResp.ok()).toBeTruthy();
    const jobJson: any = await jobResp.json();
    expect(jobJson.ok).toBe(true);
    final = jobJson;
    const status = String(jobJson.job?.status || "").toLowerCase();
    if (status === "done") return final;
    if (status === "failed" || status === "dead_letter" || status === "stale") {
      const err = String(jobJson.job?.error || "job failed");
      throw new Error(`Job ${jobId} failed (status=${status}): ${err}`);
    }
    await sleep(2500);
  }
  throw new Error(`Timed out waiting for job ${jobId} to complete`);
}

test.describe("Live: Book Studio editor (real DB + real LLM)", () => {
  test("BookGen Pro generates a skeleton-first version and it opens in the chapter editor", async ({ request, page }) => {
    test.setTimeout(10 * 60 * 1000);

    const supabaseUrl = requireEnvVar("VITE_SUPABASE_URL");
    const agentToken = requireEnvVar("AGENT_TOKEN");
    const organizationId = requireEnvVar("ORGANIZATION_ID");
    const writeModel = requireWriteModelSpec();

    const bookId = `e2e-bookgen-${Date.now()}`;
    const chapterCount = 1;

    // 1) Enqueue BookGen Pro (factory job)
    const rootJobId = await enqueueFactoryJob({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobType: "book_generate_full",
      payload: {
        mode: "create",
        bookId,
        title: "E2E BookGen Pro",
        level: "n3",
        language: "nl",
        chapterCount,
        topic: "Korte test-hoofdstuk over diffusie en osmose.",
        userInstructions: "Houd het kort. Voeg minstens één afbeelding-suggestie toe met suggestedPrompt.",
        writeModel,
      },
    });

    // 2) Run the orchestrator job to completion
    const rootFinal = await runAgentJobToDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: rootJobId,
      maxAttempts: 6,
    });
    const rootResult = rootFinal?.job?.result || {};
    const bookVersionId = String(rootResult.bookVersionId || "").trim();
    const firstChapterJobId = String(rootResult.firstChapterJobId || "").trim();
    expect(bookVersionId).toBeTruthy();
    expect(firstChapterJobId).toMatch(/^[0-9a-f-]{36}$/i);

    // 3) Run the chapter job (this is the real-LLM step)
    const chFinal = await runAgentJobToDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: firstChapterJobId,
      maxAttempts: 8,
    });
    const chStatus = String(chFinal?.job?.status || "").toLowerCase();
    expect(chStatus).toBe("done");

    // 4) Assert skeleton is present and loadable (via signed URL)
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
      },
    });
    expect(inputsResp.ok()).toBeTruthy();
    const inputsJson: any = await inputsResp.json();
    expect(inputsJson.ok).toBe(true);
    expect(String(inputsJson.authoringMode || "")).toBe("skeleton");
    const skeletonSignedUrl = String(inputsJson?.urls?.skeleton?.signedUrl || "").trim();
    expect(skeletonSignedUrl).toMatch(/^https?:\/\//i);

    const skDl = await request.get(skeletonSignedUrl);
    expect(skDl.ok()).toBeTruthy();
    const sk: any = await skDl.json();
    expect(sk?.meta?.schemaVersion).toBe("skeleton_v1");
    expect(sk?.meta?.bookId).toBe(bookId);
    expect(sk?.meta?.bookVersionId).toBe(bookVersionId);
    expect(Array.isArray(sk?.chapters)).toBe(true);
    expect(sk.chapters.length).toBeGreaterThanOrEqual(1);

    // 5) Open Book Studio UI and verify skeleton-first editor loads
    await page.goto(`/admin/book-studio/${encodeURIComponent(bookId)}?bookVersionId=${encodeURIComponent(bookVersionId)}`);

    await expect(page.locator('[data-cta-id="cta-bookstudio-book-refresh"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-bookstudio-chapter-edit-0"]')).toBeVisible({ timeout: 120_000 });
    await page.locator('[data-cta-id="cta-bookstudio-chapter-edit-0"]').click();

    // Chapter editor: skeleton-first banner should be visible.
    await expect(page.locator('[data-cta-id="cta-bookstudio-chapter-save"]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("text=Skeleton-first")).toBeVisible({ timeout: 120_000 });
  });
});


