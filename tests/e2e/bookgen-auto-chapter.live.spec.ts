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

function requireSupabaseUrl(): string {
  // Prefer Vite-style env; allow server-side equivalent for CI shells.
  const vite = process.env.VITE_SUPABASE_URL;
  const plain = process.env.SUPABASE_URL;
  const value = (vite || plain || "").trim();
  if (!value) throw new Error("BLOCKED: VITE_SUPABASE_URL (or SUPABASE_URL) is required");
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

  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY);
  const hasOpenai = !!(process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY);
  if (hasAnthropic) return "anthropic:claude-sonnet-4-5";
  if (hasOpenai) return "openai:gpt-4o-mini";
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
    const jobResp = await request.get(`${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=200`, {
      headers: {
        "X-Agent-Token": agentToken,
        "X-Organization-Id": organizationId,
      },
    });
    expect(jobResp.ok()).toBeTruthy();
    const jobJson: any = await jobResp.json();
    expect(jobJson.ok).toBe(true);

    const status = String(jobJson.job?.status || "").toLowerCase();
    lastStatus = status;
    lastErr = String(jobJson.job?.error || "");

    if (status === "done") return jobJson;
    if (status === "failed" || status === "dead_letter" || status === "stale") {
      throw new Error(`Job ${jobId} failed (status=${status}): ${lastErr || "unknown error"}`);
    }

    await sleep(7_000);
  }

  throw new Error(`Timed out waiting for job ${jobId} to complete (lastStatus=${lastStatus}): ${lastErr}`);
}

function extractImagesFromSkeleton(skeleton: any): Array<{ src: string; suggestedPrompt: string }> {
  const out: Array<{ src: string; suggestedPrompt: string }> = [];

  const walkBlocks = (blocksRaw: any[]) => {
    const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const type = typeof (b as any).type === "string" ? (b as any).type : "";
      if (type === "subparagraph") {
        walkBlocks(Array.isArray((b as any).blocks) ? (b as any).blocks : []);
        continue;
      }

      const images = Array.isArray((b as any).images) ? (b as any).images : [];
      for (const img of images) {
        const src = typeof img?.src === "string" ? img.src.trim() : "";
        const suggestedPrompt = typeof img?.suggestedPrompt === "string" ? img.suggestedPrompt.trim() : "";
        if (!src) continue;
        out.push({ src, suggestedPrompt });
      }
    }
  };

  const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters : [];
  for (const ch of chapters) {
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (const s of sections) {
      walkBlocks(Array.isArray(s?.blocks) ? s.blocks : []);
    }
  }

  return out;
}

function extractAllHtmlStringsFromSkeleton(skeleton: any): string[] {
  const out: string[] = [];
  const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters : [];
  for (const ch of chapters) {
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (const s of sections) {
      const blocks = Array.isArray(s?.blocks) ? s.blocks : [];
      for (const b of blocks) {
        if (typeof b?.basisHtml === "string") out.push(b.basisHtml);
        if (typeof b?.praktijkHtml === "string") out.push(b.praktijkHtml);
        if (typeof b?.verdiepingHtml === "string") out.push(b.verdiepingHtml);
      }
    }
  }
  return out;
}

test.describe("Live: BookGen chapter auto-processing (real DB + real LLM)", () => {
  test("Enqueue book_generate_full and wait for the chapter to complete (no manual worker kick)", async ({ request }) => {
    test.setTimeout(15 * 60 * 1000);

    const supabaseUrl = requireSupabaseUrl();
    const agentToken = requireEnvVar("AGENT_TOKEN");
    const organizationId = requireEnvVar("ORGANIZATION_ID");
    const writeModel = requireWriteModelSpec();

    const bookId = `e2e-bookgen-auto-${Date.now()}`;
    const chapterCount = 1;

    // 1) Enqueue root BookGen job (factory job)
    const rootJobId = await enqueueFactoryJob({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobType: "book_generate_full",
      payload: {
        mode: "create",
        bookId,
        title: "E2E Auto BookGen (no manual worker kick)",
        level: "n3",
        language: "nl",
        chapterCount,
        topic: "Korte test-hoofdstuk over diffusie en osmose.",
        userInstructions: "Houd het kort. Voeg minstens één afbeelding-suggestie toe met suggestedPrompt.",
        imagePromptLanguage: "en",
        writeModel,
      },
    });

    // 2) Wait for root job completion (cron/worker should pick it up)
    const rootFinal = await waitForAgentJobDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: rootJobId,
      timeoutMs: 6 * 60 * 1000,
    });
    const rootResult = rootFinal?.job?.result || {};
    const bookVersionId = String(rootResult.bookVersionId || "").trim();
    const firstChapterJobId = String(rootResult.firstChapterJobId || "").trim();
    expect(bookVersionId).toBeTruthy();
    expect(firstChapterJobId).toMatch(/^[0-9a-f-]{36}$/i);

    // 3) Wait for the chapter job to complete (this is the real-LLM step)
    const chFinal = await waitForAgentJobDone({
      request,
      supabaseUrl,
      agentToken,
      organizationId,
      jobId: firstChapterJobId,
      timeoutMs: 10 * 60 * 1000,
    });
    expect(String(chFinal?.job?.status || "").toLowerCase()).toBe("done");

    // 4) Fetch skeleton for chapter 0 and validate content + image prompts exist
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

    // Basic “chapter has content” sanity checks
    const ch0 = sk.chapters?.[0] || {};
    expect(typeof ch0?.title === "string" || ch0?.title == null).toBeTruthy();

    // Image placeholders should exist and at least one should have suggestedPrompt
    const images = extractImagesFromSkeleton(sk);
    expect(images.length).toBeGreaterThan(0);
    const withPrompt = images.filter((x) => x.suggestedPrompt.length > 0);
    expect(withPrompt.length).toBeGreaterThan(0);

    // N3 guardrail: discourage unexpected heavy math/formula dumps in verdiepingHtml for non-math topics.
    // We allow "=" generally (could appear in normal text), so we only flag high-signal patterns.
    const allHtml = extractAllHtmlStringsFromSkeleton(sk).join("\n");
    expect(allHtml).not.toMatch(/\bvan\s*['’]t\s*Hoff\b/i);
    expect(allHtml).not.toMatch(/\bFick\b/i);
    expect(allHtml).not.toMatch(/π\s*=/i);
  });
});


