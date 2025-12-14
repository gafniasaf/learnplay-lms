import type { GenerationInput, GenerationSelection } from "../_shared/generation-strategy.ts";
import type { ValidationResult } from "../_shared/course-validator.ts";
import type { FillerContext } from "../_shared/filler.ts";
import type { BasicKnowledgePack } from "../_shared/gates.ts";
import { enforceCourseId } from "../_shared/course-identity.ts";

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

    const validationResult = deps.validateCourse(course, validationOptions);
    if (hasValidationErrors(validationResult)) {
      const errorCount = validationResult.issues.filter((issue) => issue.severity === "error").length;
      // NO PLACEHOLDERS POLICY: fail loud with summary of validation failures.
      throw new Error(`validation_failed: ${errorCount} errors (${validationResult.issues.length} issues)`);
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


