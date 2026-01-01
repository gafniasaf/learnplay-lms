// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Deno runtime import
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonOk, jsonError, Errors } from "../_shared/error.ts";
import { withCors } from "../_shared/cors.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Deno runtime import
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { buildSkeleton } from "../_shared/skeleton.ts";
import { fillSkeleton } from "../_shared/filler.ts";
import { validateCourse } from "../_shared/course-validator.ts";
import { logError } from "../_shared/log.ts";
import { generateCourseDeterministic } from "../_shared/deterministic.ts";
import { selectGenerationStrategy } from "../_shared/generation-strategy.ts";
import { upsertCourseMetadata } from "../_shared/metadata.ts";
import { createGenerationRunner } from "./orchestrator.ts";

// Minimal Deno shim for local TypeScript tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(key: string): string | undefined }; serve: any };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const InputSchema = z.object({
  subject: z.string().min(1).max(200).default("english-verbs"),
  title: z.string().min(1).max(120).optional(),
  gradeBand: z.string().max(50).default("All Grades"),
  grade: z.string().max(50).nullable().optional(),
  itemsPerGroup: z.number().int().min(1).max(100).default(12),
  levelsCount: z.number().int().min(1).max(10).optional(),
  mode: z.enum(["options", "numeric"]).default("options"),
  // Special requests passed from the UI (AIPipelineV2) via enqueue-job.
  // Also accepted directly for manual POSTs.
  notes: z.string().max(5000).optional(),
  // Optional explicit override (else derived from notes).
  studyTextsCount: z.number().int().min(1).max(12).optional(),
  // Optional explicit toggle (else derived from notes).
  generateStudyTextImages: z.boolean().optional(),
  // Protocol ID for exercise generation (e.g., 'standard', 'ec-expert')
  protocol: z.string().max(50).optional(),
  // Optional explicit study text used by protocol-based generation (e.g., EC Expert).
  // This is distinct from `notes` (special requests) to avoid conflation.
  studyText: z.string().max(20000).optional(),
});

function normalizeSubjectForSafety(subject: string, gradeBand: string): string {
  const raw = String(subject || "").trim();
  // Generic approach: do not maintain a term blacklist here.
  // If a provider refuses the request, the filler will surface a content-policy error
  // and the job will fail with a clear "please rephrase" message.
  void gradeBand; // kept for signature stability
  return raw;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJobCourseId(supabase: any, jobId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_course_jobs")
    .select("course_id")
    .eq("id", jobId)
    .single();

  if (error) {
    throw new Error(`Failed to load job ${jobId}: ${error.message}`);
  }

  return (data as any)?.course_id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJobNotes(supabase: any, jobId: string): Promise<string | null> {
  // Store special requests in Storage so we don't depend on `job_events` being deployed / in schema cache.
  // Path written by enqueue-job: debug/jobs/<jobId>/special_requests.json
  try {
    const path = `debug/jobs/${jobId}/special_requests.json`;
    const { data: file, error } = await supabase.storage.from("courses").download(path);
    if (error) {
      const msg = String((error as any)?.message || "").toLowerCase();
      const status = Number((error as any)?.statusCode || (error as any)?.status || 0);
      // If missing, treat as "no notes" (notes are optional).
      // NOTE: Some Storage deployments return `{}` as the error "message" for missing objects (status=400).
      // Treat that as "missing" to keep notes optional and avoid false-negative failures in live E2E.
      const normalizedMsg = msg.replace(/\s+/g, "");
      const looksMissing =
        status === 404 ||
        msg.includes("not found") ||
        msg.includes("does not exist") ||
        msg.includes("object not found") ||
        normalizedMsg === "{}" ||
        (status === 400 && (msg === ""));
      if (looksMissing) return null;
      throw new Error(error.message ?? String(error));
    }
    if (!file) return null;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const notes = typeof parsed?.notes === "string" ? String(parsed.notes).trim() : "";
    return notes || null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to load special requests for ${jobId}: ${msg}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJobProtocol(supabase: any, jobId: string): Promise<string | null> {
  // Protocol is stored alongside notes in special_requests.json
  try {
    const path = `debug/jobs/${jobId}/special_requests.json`;
    const { data: file, error } = await supabase.storage.from("courses").download(path);
    if (error) {
      const msg = String((error as any)?.message || "").toLowerCase();
      const status = Number((error as any)?.statusCode || (error as any)?.status || 0);
      // If missing, treat as "no protocol" (protocol is optional).
      if (status === 404 || msg.includes("not found") || msg.includes("does not exist")) return null;
      return null; // Non-fatal
    }
    if (!file) return null;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const protocol = typeof parsed?.protocol === "string" ? String(parsed.protocol).trim() : "";
    return protocol || null;
  } catch (e) {
    // Non-fatal: protocol is optional
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJobStudyText(supabase: any, jobId: string): Promise<string | null> {
  // studyText is stored alongside notes in special_requests.json
  try {
    const path = `debug/jobs/${jobId}/special_requests.json`;
    const { data: file, error } = await supabase.storage.from("courses").download(path);
    if (error) {
      const msg = String((error as any)?.message || "").toLowerCase();
      const status = Number((error as any)?.statusCode || (error as any)?.status || 0);
      // If missing, treat as "no studyText" (optional).
      if (status === 404 || msg.includes("not found") || msg.includes("does not exist")) return null;
      return null; // Non-fatal
    }
    if (!file) return null;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const studyText = typeof parsed?.studyText === "string" ? String(parsed.studyText).trim() : "";
    return studyText || null;
  } catch {
    // Non-fatal: studyText is optional
    return null;
  }
}

function parseStudyTextsCountFromNotes(notes: string): number | null {
  const s = String(notes || "").trim();
  if (!s) return null;
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const m = s.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+study\s*texts?\b/i);
  if (!m?.[1]) return null;
  const raw = m[1].toLowerCase();
  const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : words[raw];
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

function wantsStudyTextImagesFromNotes(notes: string): boolean {
  const s = String(notes || "").trim();
  if (!s) return false;
  if (/\bwithout\s+images?\b/i.test(s)) return false;
  return /\b(with|include|add|generate|create)\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+)?(ai\s+)?images?\b/i
    .test(s);
}

function extractImageMarkers(text: string): string[] {
  const s = String(text || "");
  const out: string[] = [];
  const re = /\[IMAGE:([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const desc = String(m[1] || "").trim();
    if (desc) out.push(desc);
  }
  return out;
}

function buildStudyTextImagePrompt(args: {
  subject: string;
  gradeBand: string;
  courseTitle: string;
  studyTextTitle: string;
  description: string;
}): string {
  const { subject, gradeBand, courseTitle, studyTextTitle, description } = args;
  return [
    `Create an educational illustration for a study text section in a course.`,
    `Course: "${courseTitle}"`,
    `Subject: "${subject}"`,
    `Grade band: "${gradeBand}"`,
    `Section: "${studyTextTitle}"`,
    `Visual description: "${description}"`,
    ``,
    `Style requirements: clean, high-contrast, classroom-appropriate. Use simple labels only if necessary. No watermarks. No dense text blocks.`,
  ].join("\n");
}

type PlaceholderInput = {
  subject: string;
  title: string | undefined;
  gradeBand: string;
  mode: "options" | "numeric";
  itemsPerGroup: number;
  levelsCount?: number;
  courseId?: string;
};

function buildPlaceholderCourse({
  subject,
  title,
  gradeBand,
  mode,
  itemsPerGroup,
  levelsCount,
  courseId: forcedCourseId,
}: PlaceholderInput) {
  const seedStr = `${subject}|${title ?? ""}|${gradeBand}|${mode}|${itemsPerGroup}|${levelsCount ?? ""}`;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }

  const rng = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const normalized = subject.toLowerCase();
  const useOptions = mode === "options";

  const hasMul = /(multiplication|multiply|times|product)/i.test(normalized);
  const hasDiv = /(division|divide|quotient)/i.test(normalized);
  const hasAdd = /(addition|add|plus|sum)/i.test(normalized);
  const hasSub = /(subtraction|substract|substraction|minus)/i.test(normalized);

  let ops: Array<"add" | "sub" | "mul" | "div"> = [];
  if (hasMul) ops.push("mul");
  if (hasDiv) ops.push("div");
  if (hasAdd) ops.push("add");
  if (hasSub) ops.push("sub");
  if (ops.length === 0) {
    ops = /\bmath\b/i.test(normalized) ? ["add", "sub"] : ["add"];
  }
  ops = ops.slice(0, 3);

  const courseId =
    (forcedCourseId ??
      subject.replace(/[^a-z0-9-]/gi, "-").toLowerCase()) ||
    `course-${Date.now()}`;

  const makeItem = (op: "add" | "sub" | "mul" | "div", id: number, groupId: number) => {
    let a = 0;
    let b = 0;
    let answer = 0;
    let symbol = "?";

    switch (op) {
      case "add":
        a = 1 + Math.floor(rng() * 20);
        b = 1 + Math.floor(rng() * 20);
        answer = a + b;
        symbol = "+";
        break;
      case "sub":
        a = 5 + Math.floor(rng() * 20);
        b = Math.floor(rng() * Math.min(a, 10));
        answer = a - b;
        symbol = "−";
        break;
      case "mul":
        a = 2 + Math.floor(rng() * 8);
        b = 2 + Math.floor(rng() * 8);
        answer = a * b;
        symbol = "×";
        break;
      case "div": {
        const q = 2 + Math.floor(rng() * 8);
        b = 2 + Math.floor(rng() * 8);
        a = q * b;
        answer = q;
        symbol = "÷";
        break;
      }
    }

    const base: any = {
      id,
      text: `${a} ${symbol} ${b} = [blank]`,
      groupId,
      clusterId: `${op}-${a}-${b}`,
      variant: String((id % 3) + 1),
      mode,
    };

    if (useOptions) {
      const choices = new Set<number>();
      choices.add(answer);
      while (choices.size < 3) {
        const delta = (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 2));
        const candidate = Math.max(0, answer + delta);
        choices.add(candidate);
      }
      const options = Array.from(choices).map(String);
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      base.options = options;
      base.correctIndex = options.indexOf(String(answer));
    } else {
      base.answer = answer;
    }

    return base;
  };

  const groups = ops.map((op, index) => ({
    id: index,
    name:
      op === "mul" ? "Multiplication" :
      op === "div" ? "Division" :
      op === "add" ? "Addition" :
      "Subtraction",
  }));

  const items: any[] = [];
  let itemId = 0;
  ops.forEach((op, groupIndex) => {
    for (let i = 0; i < itemsPerGroup; i++) {
      items.push(makeItem(op, itemId++, groupIndex));
    }
  });

  const totalItems = items.length;
  const levelMatch = /(\d{1,2})\s*levels?/i.exec(subject);
  const derivedLevels = levelMatch ? parseInt(levelMatch[1], 10) : NaN;
  const candidateLevels = Number.isFinite(derivedLevels) ? derivedLevels : 3;
  const desiredLevels = Math.max(1, Math.min(6, levelsCount ?? candidateLevels));
  const span = Math.max(1, Math.floor(totalItems / desiredLevels));
  const levels = Array.from({ length: desiredLevels }).map((_, idx) => {
    const start = idx * span;
    const end = idx === desiredLevels - 1 ? totalItems - 1 : Math.min(totalItems - 1, (idx + 1) * span - 1);
    return { id: idx + 1, title: `Level ${idx + 1}`, start, end };
  });

  const studyTexts = ops.length
    ? ops.map((op, index) => {
        const titleFor = (name: string) =>
          name
            .split(/[_-]/)
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(" ");
        const base = titleFor(op);
        const bodyByOp: Record<typeof op, string> = {
          add: "[SECTION:Understanding Addition]\nAddition means putting numbers together to find the total.\n\n[SECTION:Strategies]\nUse number lines, counting on, or making tens.\n\n[IMAGE:number line showing +5 jumps]",
          sub: "[SECTION:Understanding Subtraction]\nSubtraction means taking away or finding the difference.\n\n[SECTION:Strategies]\nCount back or use addition to check.\n\n[IMAGE:number line backward jumps]",
          mul: "[SECTION:Equal Groups]\nMultiplication is repeated addition of equal groups.\n\n[SECTION:Arrays]\nArrange objects in rows and columns to see products.\n\n[IMAGE:array 3x4]",
          div: "[SECTION:Understanding Division]\nDivision splits a total into equal parts.\n\n[SECTION:Checking]\nCheck division with multiplication.\n\n[IMAGE:groups of equal size]",
        };
        return {
          id: `intro-${op}`,
          title: `What is ${titleFor(op)}?`,
          order: index + 1,
          content: bodyByOp[op],
        };
      })
    : [{
        id: "intro-topic",
        title: `${subject} Overview`,
        order: 1,
        content:
          `[SECTION:Introduction]\n${subject} basics and key facts.\n\n` +
          "[SECTION:Examples]\nSimple examples to illustrate the topic.\n\n" +
          "[IMAGE:topic related diagram]",
      }];

  return {
    id: courseId,
    title: title ?? `${subject} Course`,
    description: `Placeholder course for ${subject}`,
    subject,
    gradeBand,
    contentVersion: `placeholder-${new Date().toISOString()}`,
    groups,
    levels,
    studyTexts,
    items,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createJobHelpers(supabase: any) {
  async function updateJobProgress(
    jobId: string | null,
    stage: string,
    percent: number,
    message: string,
  ) {
    if (!jobId) return;
    try {
      await supabase
        .from("ai_course_jobs")
        .update({
          progress_stage: stage,
          progress_percent: percent,
          progress_message: message,
        })
        .eq("id", jobId);
    } catch (error) {
      console.warn("[generate-course] Failed to update job progress", error);
    }
  }

  async function saveJobSummary(jobId: string | null, summary: any) {
    if (!jobId || !summary) return;
    try {
      const path = `debug/jobs/${jobId}/summary.json`;
      const blob = new Blob([JSON.stringify(summary, null, 2)], {
        type: "application/json",
      });
      await supabase.storage
        .from("courses")
        .upload(path, blob, { upsert: true, contentType: "application/json" });
    } catch (error) {
      console.warn("[generate-course] Failed to store job summary", error);
    }
  }

  async function saveRepairArtifact(
    jobId: string | null,
    artifact: { original: any[]; repaired: any[]; failedIds: number[]; metrics?: unknown; reason: string }
  ) {
    if (!jobId) return;
    try {
      const ts = Date.now();
      const path = `debug/jobs/${jobId}/repair_${ts}.json`;
      const blob = new Blob([JSON.stringify({ ...artifact, jobId, timestamp: new Date().toISOString() }, null, 2)], {
        type: "application/json",
      });
      await supabase.storage.from("courses").upload(path, blob, { upsert: true, contentType: "application/json" });
    } catch (error) {
      console.warn("[generate-course] Failed to store repair artifact", error);
    }
  }

  async function saveValidationIssues(
    jobId: string | null,
    payload: { reason: string; codes: string; errorCount: number; issues: any[]; requestId: string; timestamp: string; courseId?: string }
  ) {
    if (!jobId || !payload) return;
    try {
      const path = `debug/jobs/${jobId}/validation_issues.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      await supabase.storage
        .from("courses")
        .upload(path, blob, { upsert: true, contentType: "application/json" });
    } catch (error) {
      console.warn("[generate-course] Failed to store validation issues", error);
    }
  }

  async function markJobDone(
    jobId: string | null,
    payload: { status: "done" | "needs_attention"; fallbackReason: string | null; summary?: any },
  ) {
    if (!jobId) return;
    const completedAt = new Date().toISOString();

    // Always update the minimal columns that MUST exist.
    // Extra progress fields are best-effort because some deployments may not have them yet.
    try {
      await supabase
        .from("ai_course_jobs")
        .update({
          status: payload.status,
          completed_at: completedAt,
        })
        .eq("id", jobId);
    } catch (error) {
      console.warn("[generate-course] Failed to set job status/completed_at", error);
    }

    // Best-effort progress decoration (may fail if columns don't exist).
    try {
      await supabase
        .from("ai_course_jobs")
        .update({
          progress_stage: "completed",
          progress_percent: 100,
          fallback_reason: payload.fallbackReason,
        })
        .eq("id", jobId);
    } catch (error) {
      console.warn("[generate-course] Failed to finalize job progress fields (non-fatal)", error);
    }
  }

  async function markJobFailed(jobId: string | null, message: string) {
    if (!jobId) return;
    const completedAt = new Date().toISOString();
    try {
      await supabase
        .from("ai_course_jobs")
        .update({
          status: "failed",
          completed_at: completedAt,
          error: message,
        })
        .eq("id", jobId);
    } catch (error) {
      console.warn("[generate-course] Failed to mark job as failed (status/error/completed_at)", error);
    }

    // Best-effort progress decoration (may fail if columns don't exist).
    try {
      await supabase
        .from("ai_course_jobs")
        .update({
          progress_stage: "failed",
          progress_percent: 100,
        })
        .eq("id", jobId);
    } catch (error) {
      console.warn("[generate-course] Failed to mark job progress fields as failed (non-fatal)", error);
    }
  }

  return {
    updateJobProgress,
    saveJobSummary,
    saveRepairArtifact,
    saveValidationIssues,
    markJobDone,
    markJobFailed,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPersistenceHelpers(supabase: any) {
  function isEnvelope(x: any): x is { content: any; format: string } {
    return !!x && typeof x === "object" && "content" in x && "format" in x;
  }

  function coerceItemId(id: unknown): number | null {
    if (typeof id === "number" && Number.isFinite(id)) return Math.floor(id);
    if (typeof id === "string" && id.trim()) {
      const n = Number(id);
      return Number.isFinite(n) ? Math.floor(n) : null;
    }
    return null;
  }

  function isStimulus(x: unknown): x is { type: string; url: string } {
    return (
      !!x &&
      typeof x === "object" &&
      typeof (x as any).type === "string" &&
      typeof (x as any).url === "string" &&
      String((x as any).url).trim().length > 0
    );
  }

  async function mergeExistingItemStimuli(coursePath: string, payload: any): Promise<any> {
    // Course JSON can be rewritten during long-running generation. Preserve already-attached stimuli (e.g. from media-runner)
    // so concurrent writes do not drop item media.
    let existingJson: any | null = null;
    try {
      const { data: existingFile, error: dlErr } = await supabase.storage.from("courses").download(coursePath);
      if (!dlErr && existingFile) {
        const existingText = await existingFile.text();
        existingJson = JSON.parse(existingText);
      }
    } catch {
      existingJson = null;
    }

    if (!existingJson) return payload;

    const existingContent = isEnvelope(existingJson) ? existingJson.content : existingJson;
    const existingItems: any[] = Array.isArray(existingContent?.items) ? existingContent.items : [];
    if (existingItems.length === 0) return payload;

    const stimulusById = new Map<number, any>();
    for (const it of existingItems) {
      const id = coerceItemId((it as any)?.id);
      if (id === null) continue;
      const stim = (it as any)?.stimulus;
      if (isStimulus(stim)) {
        // Keep the first observed stimulus for this id.
        if (!stimulusById.has(id)) stimulusById.set(id, stim);
      }
    }
    if (stimulusById.size === 0) return payload;

    const payloadIsEnv = isEnvelope(payload);
    const payloadContent = payloadIsEnv ? (payload as any).content : payload;
    const payloadItems: any[] = Array.isArray(payloadContent?.items) ? payloadContent.items : [];
    if (payloadItems.length === 0) return payload;

    let changed = false;
    const mergedItems = payloadItems.map((it: any) => {
      const id = coerceItemId(it?.id);
      if (id === null) return it;
      const stim = stimulusById.get(id);
      if (!stim) return it;

      const currentStim = (it as any)?.stimulus;
      if (currentStim == null) {
        changed = true;
        return { ...it, stimulus: stim };
      }
      return it;
    });

    if (!changed) return payload;
    return payloadIsEnv ? { ...payload, content: { ...payloadContent, items: mergedItems } } : { ...payloadContent, items: mergedItems };
  }

  async function uploadCourseJson(courseId: string, payload: any) {
    const coursePath = `${courseId}/course.json`;
    const mergedPayload = await mergeExistingItemStimuli(coursePath, payload);
    const blob = new Blob([JSON.stringify(mergedPayload, null, 2)], {
      type: "application/json",
    });
    const { error } = await supabase.storage
      .from("courses")
      .upload(coursePath, blob, {
        upsert: true,
        contentType: "application/json",
        cacheControl: "public, max-age=60",
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message ?? String(error)}`);
    }
  }

  async function persistCourse(
    course: any,
    _context: { jobId: string | null; deterministicPack: unknown },
  ) {
    await uploadCourseJson(course.id, course);
    // NO PLACEHOLDERS / NO SILENT BYPASSES:
    // If metadata upsert fails, the job must fail loudly so the real issue is visible and fixed (migrations, RLS, etc).
    await upsertCourseMetadata(supabase as any, course.id, course);
  }

  async function persistPlaceholder(
    course: any,
    _context: { jobId: string | null; reason: string },
  ) {
    await uploadCourseJson(course.id, course);
    await upsertCourseMetadata(supabase as any, course.id, course);
  }

  return {
    persistCourse,
    persistPlaceholder,
  };
}

Deno.serve(
  withCors(async (req) => {
    const requestId = crypto.randomUUID();
    const url = new URL(req.url);

    if (req.method !== "POST") {
      return Errors.methodNotAllowed(req.method, requestId, req);
    }

    let input: z.infer<typeof InputSchema>;
    try {
      const body = await req.json();
      const parsed = InputSchema.safeParse(body);
      if (!parsed.success) {
        const msg = parsed.error.errors
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        return jsonError("invalid_request", msg, 400, requestId, req);
      }
      input = parsed.data;
    } catch {
      return jsonError(
        "invalid_request",
        "Malformed JSON body",
        400,
        requestId,
        req,
      );
    }

    const jobId = url.searchParams.get("jobId") || null;
    const gradeBand = input.grade || input.gradeBand;
    const subject = normalizeSubjectForSafety(input.subject, gradeBand);
    const title = input.title || `${subject} Course`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jobHelpers = createJobHelpers(supabase);
    const persistence = createPersistenceHelpers(supabase);
    const expectedCourseId = jobId ? await fetchJobCourseId(supabase, jobId) : null;

    const notesFromInput = typeof input.notes === "string" ? input.notes.trim() : "";
    const notesFromJob = jobId && !notesFromInput ? await fetchJobNotes(supabase, jobId) : null;
    const notes = notesFromInput || notesFromJob || undefined;
    const derivedStudyTextsCount =
      typeof input.studyTextsCount === "number"
        ? input.studyTextsCount
        : notes
          ? parseStudyTextsCountFromNotes(notes) ?? undefined
          : undefined;
    const derivedGenerateStudyTextImages =
      typeof input.generateStudyTextImages === "boolean"
        ? input.generateStudyTextImages
        : notes
          ? wantsStudyTextImagesFromNotes(notes)
          : false;

    // Read protocol from input or job storage
    const protocolFromInput = input.protocol;
    const protocolFromJob = jobId ? await fetchJobProtocol(supabase, jobId) : null;
    const protocol = protocolFromInput || protocolFromJob || undefined;

    // Read optional studyText (distinct from notes) from input or job storage.
    const studyTextFromInput = typeof input.studyText === "string" ? input.studyText.trim() : "";
    const studyTextFromJob = jobId && !studyTextFromInput ? await fetchJobStudyText(supabase, jobId) : null;
    const studyText = studyTextFromInput || studyTextFromJob || undefined;

    // For EC Expert, we treat the provided studyText as the canonical reference material and keep a single study text section.
    const effectiveStudyTextsCount =
      protocol === "ec-expert" && typeof studyText === "string" && studyText.trim().length > 0
        ? 1
        : derivedStudyTextsCount;

    const runGeneration = createGenerationRunner({
      selectStrategy: (strategyInput) =>
        selectGenerationStrategy({ ...strategyInput, protocol }, {
          generateCourseDeterministic,
          buildSkeleton,
        }),
      fillSkeleton: (skeleton, ctx) => fillSkeleton(skeleton, ctx),
      validateCourse: validateCourse as any,
      buildPlaceholder: (placeholderInput) =>
        buildPlaceholderCourse({
          subject: placeholderInput.subject,
          title: placeholderInput.title,
          gradeBand: placeholderInput.gradeBand,
          mode: placeholderInput.mode,
          itemsPerGroup: placeholderInput.itemsPerGroup,
          levelsCount: placeholderInput.levelsCount,
          courseId: placeholderInput.courseId,
        }),
      persistCourse: (course, context) => persistence.persistCourse(course, context),
      persistPlaceholder: (course, context) => persistence.persistPlaceholder(course, context),
      enqueueStudyTextImages: async ({ course, input, jobId, requestId }) => {
        const courseId = typeof course?.id === "string" ? course.id : "";
        if (!courseId) return { imagesPending: 0, imagesNote: "No course id; cannot enqueue images" };

        const studyTexts = Array.isArray(course?.studyTexts) ? course.studyTexts : [];
        if (studyTexts.length === 0) {
          return { imagesPending: 0, imagesNote: "No study texts; nothing to image" };
        }

        const courseTitle = typeof course?.title === "string" && course.title.trim()
          ? course.title.trim()
          : (typeof input.title === "string" && input.title.trim() ? input.title.trim() : `${input.subject} Course`);

        const max = Math.min(studyTexts.length, 12);
        let queued = 0;
        let existing = 0;
        for (let i = 0; i < max; i++) {
          const st = studyTexts[i];
          const sectionId = typeof st?.id === "string" ? st.id : "";
          if (!sectionId) continue;

          const titleFor = typeof st?.title === "string" && st.title.trim()
            ? st.title.trim()
            : `Study Section ${i + 1}`;
          const markers = extractImageMarkers(String(st?.content || ""));
          const description = markers[0] || `${input.subject}: ${titleFor} diagram`;

          const prompt = buildStudyTextImagePrompt({
            subject: input.subject,
            gradeBand: input.gradeBand,
            courseTitle,
            studyTextTitle: titleFor,
            description,
          });

          const idempotencyKey = `studytext-image:${courseId}:${sectionId}`;
          const insert = {
            course_id: courseId,
            item_id: -1,
            media_type: "image",
            prompt,
            provider: "openai",
            status: "pending",
            idempotency_key: idempotencyKey,
            metadata: {
              provider_id: "openai-dalle3",
              targetRef: { type: "study_text", courseId, sectionId },
              markerIndex: markers.length ? 0 : null,
              placeholder: markers.length ? markers[0] : null,
              requestId,
              jobId,
            },
          };

          const { error } = await supabase.from("ai_media_jobs").insert(insert);
          if (error) {
            if ((error as any)?.code === "23505") {
              existing++;
              continue;
            }
            throw new Error(`Failed to enqueue study text image job (${sectionId}): ${error.message ?? String(error)}`);
          }
          queued++;
        }

        const total = queued + existing;
        const note = total
          ? `Study text images queued: ${queued}${existing ? ` (already queued: ${existing})` : ""}`
          : "No study text images queued";
        return { imagesPending: total, imagesNote: note };
      },
      updateJobProgress: jobHelpers.updateJobProgress,
      markJobDone: jobHelpers.markJobDone,
      saveJobSummary: jobHelpers.saveJobSummary,
      saveRepairArtifact: jobHelpers.saveRepairArtifact,
      saveValidationIssues: jobHelpers.saveValidationIssues,
      now: () => new Date(),
    });

    try {
      const outcome = await runGeneration({
        input: {
          ...input,
          subject,
          title,
          gradeBand,
          format: 'practice',
          grade: input.grade ?? null,
          notes,
          studyTextsCount: effectiveStudyTextsCount,
          generateStudyTextImages: derivedGenerateStudyTextImages,
          protocol,
          studyText,
        } as any,
        requestId,
        jobId,
        expectedCourseId,
      });
      return jsonOk(outcome.response, requestId, req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const logContext = jobId ? { requestId, jobId } : { requestId };
      logError("generate-course failed", error as Error, logContext);
      await jobHelpers.markJobFailed(jobId, message);

      // Lovable preview will blank-screen on 500s. Return 200 with structured failure instead.
      // This still "fails loud" because:
      // - the job is marked failed with the real message
      // - the response contains the real message + code
      const code =
        message.startsWith("invalid_request:") ? "invalid_request" :
        message.startsWith("validation_failed:") ? "validation_failed" :
        message.startsWith("llm_fill_failed:") ? "llm_fill_failed" :
        message.startsWith("deterministic_failed:") ? "deterministic_failed" :
        "generation_failed";

      const safeMessage = message.startsWith("invalid_request:")
        ? message.replace(/^invalid_request:\s*/i, "")
        : message;

      return jsonOk(
        {
          success: false,
          error: { code, message: safeMessage },
          jobId,
        },
        requestId,
        req,
      );
    }
  }),
);


