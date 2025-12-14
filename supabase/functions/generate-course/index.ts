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
});

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

  async function markJobDone(
    jobId: string | null,
    payload: { status: "done" | "needs_attention"; fallbackReason: string | null; summary?: any },
  ) {
    if (!jobId) return;
    const updates: Record<string, unknown> = {
      status: payload.status,
      progress_stage: "completed",
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      fallback_reason: payload.fallbackReason,
    };
    if (payload.summary) {
      updates.summary = payload.summary;
    }
    try {
      await supabase.from("ai_course_jobs").update(updates).eq("id", jobId);
    } catch (error) {
      console.warn("[generate-course] Failed to finalize job", error);
    }
  }

  async function markJobFailed(jobId: string | null, message: string) {
    if (!jobId) return;
    try {
      await supabase
        .from("ai_course_jobs")
        .update({
          status: "failed",
          progress_stage: "failed",
          progress_percent: 100,
          completed_at: new Date().toISOString(),
          error: message,
        })
        .eq("id", jobId);
    } catch (error) {
      console.warn("[generate-course] Failed to mark job as failed", error);
    }
  }

  return {
    updateJobProgress,
    saveJobSummary,
    markJobDone,
    markJobFailed,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPersistenceHelpers(supabase: any) {
  async function uploadCourseJson(courseId: string, payload: any) {
    const coursePath = `${courseId}/course.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
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

  function isCourseMetadataSchemaMismatch(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    // Typical Postgres message when course_metadata.id is INTEGER but we pass a string id like "skeleton-...".
    return msg.includes("course_metadata") && msg.includes("invalid input syntax for type integer");
  }

  async function persistCourse(
    course: any,
    _context: { jobId: string | null; deterministicPack: unknown },
  ) {
    await uploadCourseJson(course.id, course);
    try {
      await upsertCourseMetadata(supabase as any, course.id, course);
    } catch (err) {
      // IMPORTANT: Don't fail the whole generation if the relational metadata layer is misconfigured.
      // The canonical artifact is the JSON stored at courses/{courseId}/course.json.
      // This makes Lovable/dev usable immediately; the proper fix is the DB migration.
      if (isCourseMetadataSchemaMismatch(err)) {
        console.warn("[generate-course] Skipping course_metadata upsert due to schema mismatch. Course JSON was saved.", {
          courseId: course.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      throw err;
    }
  }

  async function persistPlaceholder(
    course: any,
    _context: { jobId: string | null; reason: string },
  ) {
    await uploadCourseJson(course.id, course);
    try {
      await upsertCourseMetadata(supabase as any, course.id, course);
    } catch (err) {
      if (isCourseMetadataSchemaMismatch(err)) {
        console.warn("[generate-course] Skipping course_metadata upsert for placeholder due to schema mismatch. Course JSON was saved.", {
          courseId: course.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      throw err;
    }
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
    const title = input.title || `${input.subject} Course`;
    const gradeBand = input.grade || input.gradeBand;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jobHelpers = createJobHelpers(supabase);
    const persistence = createPersistenceHelpers(supabase);
    const expectedCourseId = jobId ? await fetchJobCourseId(supabase, jobId) : null;

    const runGeneration = createGenerationRunner({
      selectStrategy: (strategyInput) =>
        selectGenerationStrategy(strategyInput, {
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
      updateJobProgress: jobHelpers.updateJobProgress,
      markJobDone: jobHelpers.markJobDone,
      saveJobSummary: jobHelpers.saveJobSummary,
      now: () => new Date(),
    });

    try {
      const outcome = await runGeneration({
        input: {
          ...input,
          title,
          gradeBand,
          format: 'practice',
          grade: input.grade ?? null,
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
      return jsonError(
        "internal_error",
        "Course generation failed. Please retry.",
        500,
        requestId,
        req,
      );
    }
  }),
);


