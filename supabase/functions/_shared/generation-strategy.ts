import type { DeterministicParams, DeterministicResult, KnowledgePack } from "./deterministic.ts";
import type { SkeletonParams, SkeletonCourse } from "./skeleton.ts";

export interface GenerationInput {
  format: string;
  subject: string;
  grade: string | null;
  itemsPerGroup: number;
  levelsCount?: number;
  mode: "options" | "numeric";
  notes?: string;
  studyTextsCount?: number;
  generateStudyTextImages?: boolean;
}

export interface GenerationDependencies {
  generateCourseDeterministic: (params: DeterministicParams) => Promise<DeterministicResult>;
  buildSkeleton: (params: SkeletonParams) => SkeletonCourse;
}

export type GenerationSelection =
  | {
      kind: "deterministic";
      course: any;
      pack: {
        definition: KnowledgePack;
        packId?: string;
        packVersion?: number;
        seed?: number;
        errors: string[];
      };
    }
  | {
      kind: "skeleton";
      skeleton: SkeletonCourse;
      deterministicErrors?: string[];
    };

export async function selectGenerationStrategy(
  input: GenerationInput,
  deps: GenerationDependencies,
): Promise<GenerationSelection> {
  // If the user provided special requests, prefer the LLM pipeline so it can honor them.
  // Deterministic packs are curated but not parameterized by free-form notes.
  const hasNotes = typeof input.notes === "string" && input.notes.trim().length > 0;
  const deterministicResult: DeterministicResult = hasNotes
    ? { success: false, errors: ["skipped_due_to_notes"] }
    : await deps.generateCourseDeterministic({
      format: input.format,
      subject: input.subject,
      grade: input.grade,
      itemsPerGroup: input.itemsPerGroup,
      levelsCount: input.levelsCount,
      mode: input.mode,
    });

  if (deterministicResult.success && deterministicResult.course && deterministicResult.knowledgePack) {
    return {
      kind: "deterministic",
      course: deterministicResult.course,
      pack: {
        definition: deterministicResult.knowledgePack,
        packId: deterministicResult.packId,
        packVersion: deterministicResult.packVersion,
        seed: deterministicResult.seed,
        errors: deterministicResult.errors ?? [],
      },
    };
  }

  const skeleton = deps.buildSkeleton({
    format: input.format,
    subject: input.subject,
    grade: input.grade,
    itemsPerGroup: input.itemsPerGroup,
    levelsCount: input.levelsCount,
    mode: input.mode,
    studyTextsCount: input.studyTextsCount,
    notes: input.notes,
  });

  return {
    kind: "skeleton",
    skeleton,
    deterministicErrors: deterministicResult.errors,
  };
}

