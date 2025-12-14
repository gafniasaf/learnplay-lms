import type { GenerationInput, GenerationSelection } from "../_shared/generation-strategy.ts";
import type { ValidationResult } from "../_shared/course-validator.ts";
import type { FillerContext } from "../_shared/filler.ts";
import type { BasicKnowledgePack } from "../_shared/gates.ts";
import { enforceCourseId } from "../_shared/course-identity.ts";
import { generateJson } from "../_shared/ai.ts";
import { buildRepairPrompt, SYSTEM_PROMPT } from "../_shared/prompts.ts";
import { extractJsonFromText, normalizeOptionsItem, normalizeNumericItem } from "../_shared/generation-utils.ts";

type DeterministicPackInfo = {
  packId?: string;
  packVersion?: number;
  seed?: number;
  errors: string[];
};

type FillSuccess = {
  ok: true;
  course: any;
};

type FillFailure = {
  ok: false;
  error: string;
};

type FillResult = FillSuccess | FillFailure;

export type GenerationSource = "deterministic" | "skeleton+llm" | "placeholder";

export interface GenerationRunnerDeps {
  selectStrategy: (input: GenerationInput) => Promise<GenerationSelection>;
  fillSkeleton: (skeleton: any, ctx: FillerContext) => Promise<FillResult>;
  validateCourse: (course: any, options?: { knowledgePack?: BasicKnowledgePack }) => ValidationResult;
  buildPlaceholder: (input: {
    subject: string;
    title: string | undefined;
    gradeBand: string;
    mode: "options" | "numeric";
    itemsPerGroup: number;
    levelsCount?: number;
    courseId?: string;
  }) => any;
  persistCourse: (course: any, context: { jobId: string | null; deterministicPack: DeterministicPackInfo | null }) => Promise<void>;
  persistPlaceholder: (course: any, context: { jobId: string | null; reason: string }) => Promise<void>;
  updateJobProgress: (jobId: string | null, stage: string, percent: number, message: string) => Promise<void>;
  markJobDone: (jobId: string | null, payload: { status: "done" | "needs_attention"; fallbackReason: string | null; summary?: any }) => Promise<void>;
  saveJobSummary: (jobId: string | null, summary: any) => Promise<void>;
  saveRepairArtifact?: (
    jobId: string | null,
    artifact: { original: any[]; repaired: any[]; failedIds: number[]; metrics?: unknown; reason: string }
  ) => Promise<void>;
  now: () => Date;
}

export interface GenerationRunnerArgs {
  input: GenerationInput & {
    title?: string;
    gradeBand: string;
  };
  requestId: string;
  jobId: string | null;
  expectedCourseId?: string | null;
}

export interface GenerationRunnerResult {
  response: {
    success: true;
    course: any;
    source: GenerationSource;
    imagesPending: number;
    imagesNote?: string;
    metadata: {
      subject: string;
      title: string | undefined;
      gradeBand: string;
      mode: "options" | "numeric";
      generatedAt: string;
      validationWarnings?: number;
      fallbackReason?: string;
    };
  };
  summary: any;
  deterministicPack: DeterministicPackInfo | null;
  source: GenerationSource;
}

function hasValidationErrors(result: ValidationResult): boolean {
  return result.issues.some((issue) => issue.severity === "error");
}

function summarizeValidationErrors(result: ValidationResult, max = 5): string {
  const errs = result.issues.filter((i) => i.severity === "error");
  const parts: string[] = [];
  for (const i of errs.slice(0, max)) {
    const loc = typeof i.itemId === "number" ? `item:${i.itemId}` : i.field ? `field:${i.field}` : null;
    parts.push([i.code, loc].filter(Boolean).join("@"));
  }
  const suffix = errs.length > max ? ` (+${errs.length - max} more)` : "";
  return parts.join(",") + suffix;
}

function tryDeterministicNormalizeCourse(course: any): { changed: boolean; failedIds: number[] } {
  const items: any[] = Array.isArray(course?.items) ? course.items : [];
  let changed = false;
  const failedIds: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== "object") continue;
    try {
      const before = JSON.stringify(it);
      if (it.mode === "numeric") {
        normalizeNumericItem(it);
      } else {
        normalizeOptionsItem(it);
      }
      const after = JSON.stringify(it);
      if (after !== before) changed = true;
    } catch {
      if (typeof it?.id === "number") failedIds.push(it.id);
    }
  }
  return { changed, failedIds };
}

async function batchRepairItemsWithLLM(args: {
  items: any[];
  courseContext: { subject: string; grade: string; mode: "options" | "numeric" };
  reason: string;
  timeoutMs?: number;
}): Promise<{ repaired: any[]; failedIds: number[]; metrics?: unknown }> {
  const { items, courseContext, reason, timeoutMs = 110000 } = args;
  const prompt = buildRepairPrompt({ items, courseContext, reason });
  const res = await generateJson({
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 3500,
    temperature: 0.2,
    prefillJson: false,
    timeoutMs,
  });
  if (!res.ok) {
    return { repaired: [], failedIds: items.map((it) => it?.id).filter((x) => typeof x === "number"), metrics: res.metrics };
  }
  let parsed: any;
  try {
    parsed = extractJsonFromText(res.text);
  } catch {
    return { repaired: [], failedIds: items.map((it) => it?.id).filter((x) => typeof x === "number"), metrics: res.metrics };
  }
  if (!Array.isArray(parsed)) {
    return { repaired: [], failedIds: items.map((it) => it?.id).filter((x) => typeof x === "number"), metrics: res.metrics };
  }
  // Preserve identity fields strictly: id/groupId/clusterId/variant/mode from original
  const byId = new Map<number, any>();
  for (const it of items) {
    if (typeof it?.id === "number") byId.set(it.id, it);
  }
  const repaired: any[] = [];
  const failedIds: number[] = [];
  for (const cand of parsed) {
    const id = cand?.id;
    if (typeof id !== "number") continue;
    const orig = byId.get(id);
    if (!orig) continue;
    const merged = { ...orig, ...cand, id: orig.id, groupId: orig.groupId, clusterId: orig.clusterId, variant: orig.variant, mode: orig.mode };
    try {
      if (merged.mode === "numeric") normalizeNumericItem(merged);
      else normalizeOptionsItem(merged);
      repaired.push(merged);
    } catch {
      failedIds.push(id);
    }
  }
  // Any missing ids are failed
  for (const id of byId.keys()) {
    if (!repaired.some((r) => r.id === id)) failedIds.push(id);
  }
  return { repaired, failedIds: Array.from(new Set(failedIds)), metrics: res.metrics };
}

function toDeterministicInfo(selection: GenerationSelection | null): DeterministicPackInfo | null {
  if (!selection || selection.kind !== "deterministic") return null;
  return {
    packId: selection.pack.packId,
    packVersion: selection.pack.packVersion,
    seed: selection.pack.seed,
    errors: selection.pack.errors ?? [],
  };
}

export function createGenerationRunner(deps: GenerationRunnerDeps) {
  return async function runGeneration(args: GenerationRunnerArgs): Promise<GenerationRunnerResult> {
    const { input, requestId, jobId } = args;
    const expectedCourseId = args.expectedCourseId ?? null;

    await deps.updateJobProgress(jobId, "planning", 10, "Selecting generation strategy...");

    const selection = await deps.selectStrategy({
      subject: input.subject,
      grade: input.grade ?? null,
      itemsPerGroup: input.itemsPerGroup,
      levelsCount: input.levelsCount,
      mode: input.mode,
      format: (input as GenerationInput & { format?: string }).format ?? "practice",
    });

    let course: any;
    let source: GenerationSource = "skeleton+llm";
    let validationOptions: { knowledgePack?: BasicKnowledgePack } | undefined;
    let deterministicPackInfo: DeterministicPackInfo | null = null;
    let deterministicErrors: string[] | undefined;

    if (selection.kind === "deterministic") {
      deterministicPackInfo = toDeterministicInfo(selection);
      validationOptions = { knowledgePack: selection.pack.definition };
      source = "deterministic";
      await deps.updateJobProgress(jobId, "deterministic", 30, "Compiling deterministic course...");
      course = selection.course;
    } else {
      deterministicErrors = selection.deterministicErrors;
      await deps.updateJobProgress(jobId, "building_skeleton", 20, "Building course skeleton...");
      await deps.updateJobProgress(jobId, "filling_content", 40, "Filling course content with AI...");
      let fillResult = await deps.fillSkeleton(selection.skeleton, {
        requestId,
        functionName: "generate-course",
      });
      if (!fillResult.ok && /json_parse_failed|missing_studyTexts/i.test(fillResult.error)) {
        // Light retry once
        await deps.updateJobProgress(jobId, "filling_content", 45, "Retrying content fill...");
        fillResult = await deps.fillSkeleton(selection.skeleton, {
          requestId,
          functionName: "generate-course",
          retry: true,
        } as any);
      }
      if (!fillResult.ok) {
        // NO PLACEHOLDERS POLICY: fail loud so callers can see the real error and retry.
        throw new Error(`llm_fill_failed: ${fillResult.error}`);
      }
      course = fillResult.course;
    }

    const canonicalCourseId = expectedCourseId ?? course?.id;
    if (!canonicalCourseId) {
      throw new Error("Unable to determine canonical course id for generated course");
    }

    let courseIdWasOverridden = false;
    let courseIdOriginal: string | null = null;

    if (!course?.id) {
      courseIdWasOverridden = true;
      courseIdOriginal = null;
      console.warn("[generate-course] Generated course missing id; applying canonical id", {
        requestId,
        jobId,
        canonicalCourseId,
      });
      course.id = canonicalCourseId;
    } else if (course.id !== canonicalCourseId) {
      courseIdWasOverridden = true;
      courseIdOriginal = course.id;
      console.warn("[generate-course] Generated course id mismatch; overriding with canonical id", {
        requestId,
        jobId,
        canonicalCourseId,
        originalId: courseIdOriginal,
      });
      course.id = canonicalCourseId;
    }

    if (courseIdWasOverridden) {
      if (deterministicPackInfo) {
        deterministicPackInfo.errors = [
          ...(deterministicPackInfo.errors ?? []),
          "course_id_overridden",
        ];
      } else if (deterministicErrors) {
        deterministicErrors = [...deterministicErrors, "course_id_overridden"];
      } else {
        deterministicErrors = ["course_id_overridden"];
      }
    }

    enforceCourseId(course, canonicalCourseId);

    await deps.updateJobProgress(jobId, "validating", 70, "Validating course...");

    let validationResult = deps.validateCourse(course, validationOptions);
    if (hasValidationErrors(validationResult)) {
      // Dawn-style stability: attempt bounded repairs (NO placeholders).
      await deps.updateJobProgress(jobId, "repairing", 75, "Repairing validation issues...");

      // Pass 1: deterministic normalization (cheap + reliable)
      const norm = tryDeterministicNormalizeCourse(course);
      if (norm.changed) {
        validationResult = deps.validateCourse(course, validationOptions);
      }

      // Pass 2: LLM batched repair of a small set of failing items (if still failing)
      if (hasValidationErrors(validationResult)) {
        const badIds = Array.from(
          new Set(
            validationResult.issues
              .filter((i) => i.severity === "error" && typeof i.itemId === "number")
              .map((i) => i.itemId as number)
          )
        ).slice(0, 5);

        const items = Array.isArray(course?.items) ? course.items : [];
        const originals = items.filter((it: any) => typeof it?.id === "number" && badIds.includes(it.id));
        if (originals.length > 0) {
          const repairRes = await batchRepairItemsWithLLM({
            items: originals,
            courseContext: { subject: input.subject, grade: input.gradeBand, mode: input.mode },
            reason: "validation_failed",
          });

          // Apply repaired items back into course
          const byId = new Map<number, any>();
          for (const it of repairRes.repaired) byId.set(it.id, it);
          for (let i = 0; i < items.length; i++) {
            const id = items[i]?.id;
            if (typeof id === "number" && byId.has(id)) {
              items[i] = byId.get(id);
            }
          }
          course.items = items;

          try {
            await deps.saveRepairArtifact?.(jobId, {
              original: originals,
              repaired: repairRes.repaired,
              failedIds: repairRes.failedIds,
              metrics: repairRes.metrics,
              reason: "validation_failed",
            });
          } catch {
            // best-effort
          }

          validationResult = deps.validateCourse(course, validationOptions);
        }
      }

      if (hasValidationErrors(validationResult)) {
        const errorCount = validationResult.issues.filter((issue) => issue.severity === "error").length;
        throw new Error(
          `validation_failed: ${errorCount} errors (${validationResult.issues.length} issues) | ` +
            `codes=${summarizeValidationErrors(validationResult)}`
        );
      }
    }

    await deps.updateJobProgress(jobId, "persisting", 85, "Saving course to storage...");
    await deps.persistCourse(course, {
      jobId,
      deterministicPack: deterministicPackInfo,
    });

    const nowIso = deps.now().toISOString();
    const summary = {
      requestId,
      subject: input.subject,
      grade: input.grade ?? input.gradeBand,
      mode: input.mode,
      provider: source,
      itemsPerGroup: input.itemsPerGroup,
      levelsCount: input.levelsCount ?? null,
      imagesPending: 0,
      validationIssues: validationResult.issues.length,
      deterministicPack: deterministicPackInfo,
      deterministicErrors,
      completedAt: nowIso,
      courseId: course.id,
      courseIdOriginal,
      courseIdWasOverridden,
    };

    await deps.saveJobSummary(jobId, summary);
    await deps.markJobDone(jobId, { status: "done", fallbackReason: null, summary });

    return {
      source,
      deterministicPack: deterministicPackInfo,
      summary,
      response: {
        success: true,
        course,
        source,
        imagesPending: 0,
        imagesNote: "Images can be generated via enqueue-course-media",
        metadata: {
          subject: input.subject,
          title: input.title,
          gradeBand: input.gradeBand,
          mode: input.mode,
          generatedAt: nowIso,
          validationWarnings: validationResult.issues.filter((i) => i.severity === "warning").length,
        },
      },
    };
  };
}

interface PlaceholderArgs {
  reason: string;
  provider: GenerationSource;
  source: GenerationSource;
  deps: GenerationRunnerDeps;
  input: GenerationRunnerArgs["input"];
  jobId: string | null;
  requestId: string;
  deterministicErrors?: string[];
  validationIssues?: number;
  validationErrorCount?: number;
  expectedCourseId?: string | null;
}

async function handlePlaceholder(args: PlaceholderArgs): Promise<GenerationRunnerResult> {
  const { reason, deps, input, jobId, deterministicErrors } = args;

  const placeholder = deps.buildPlaceholder({
    subject: input.subject,
    title: input.title,
    gradeBand: input.gradeBand,
    mode: input.mode,
    itemsPerGroup: input.itemsPerGroup,
    levelsCount: input.levelsCount,
    courseId: args.expectedCourseId ?? undefined,
  });

  const canonicalCourseId = args.expectedCourseId ?? placeholder?.id;
  if (!canonicalCourseId) {
    throw new Error("Unable to determine canonical course id for placeholder course");
  }
  enforceCourseId(placeholder, canonicalCourseId);

  await deps.persistPlaceholder(placeholder, { jobId, reason });

  const nowIso = deps.now().toISOString();
  const imagesNote = formatPlaceholderNote(reason, args.validationErrorCount);
  const validationIssues = args.validationIssues ?? 0;
  const summary = {
    requestId: args.requestId,
    subject: input.subject,
    grade: input.grade ?? input.gradeBand,
    mode: input.mode,
    provider: "placeholder" as GenerationSource,
    itemsPerGroup: input.itemsPerGroup,
    levelsCount: input.levelsCount ?? null,
    imagesPending: 0,
    validationIssues,
    deterministicPack: null,
    deterministicErrors,
    fallbackReason: reason,
    completedAt: nowIso,
  };

  await deps.saveJobSummary(jobId, summary);
  const jobStatus = reason === "validation_failed" ? "needs_attention" : "done";
  await deps.markJobDone(jobId, { status: jobStatus, fallbackReason: reason, summary });

  return {
    source: "placeholder",
    deterministicPack: null,
    summary,
    response: {
      success: true,
      course: placeholder,
      source: "placeholder",
      imagesPending: 0,
      imagesNote,
      metadata: {
        subject: input.subject,
        title: input.title,
        gradeBand: input.gradeBand,
        mode: input.mode,
        generatedAt: nowIso,
        fallbackReason: reason,
      },
    },
  };
}

function formatPlaceholderNote(reason: string, validationErrorCount?: number): string {
  if (reason.startsWith("validation_failed")) {
    const safeCount = Number.isFinite(validationErrorCount) ? Number(validationErrorCount) : 0;
    return `Course validation failed: ${safeCount} errors`;
  }

  if (reason.startsWith("llm")) {
    return `LLM filler failed: ${reason}`;
  }

  return `Course generated via placeholder: ${reason}`;
}


