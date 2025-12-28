// Protocol type definitions and validation helpers
// These types define the interface between protocol implementations and the course generation pipeline

import type { SkeletonCourse } from "../skeleton.ts";
import type { FilledCourse, FillerContext } from "../filler.ts";

export interface ProtocolInput {
  studyText?: string;
  studyTextId?: string;
  audience: string; // e.g., "3-5", "Grades 4-8"
  subject: string;
  theme: string; // Course title/topic
  locale: string; // e.g., "nl-NL", "en-US"
  itemCount?: number;
  notes?: string;
}

export interface LearningObjective {
  id: string;
  description: string;
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
}

export interface GeneratedExercise {
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hints?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface ExerciseSet {
  objectiveId: string;
  exercises: GeneratedExercise[];
}

export interface ProtocolOutput {
  objectives: LearningObjective[];
  exerciseSets: ExerciseSet[];
}

export interface HintSet {
  nudge?: string;
  guide?: string;
  reveal?: string;
}

/** A minimal per-item fill payload (identity fields come from the skeleton). */
export interface GeneratedItemContent {
  text: string;
  mode: "options" | "numeric";
  options?: string[];
  correctIndex?: number;
  answer?: number;
  explain?: string;
  hints?: HintSet;
  learningObjectiveId?: string;
}

export interface ProtocolFillArgs {
  // The target skeleton to fill (identity fields MUST be preserved).
  skeleton: SkeletonCourse;
  // Telemetry context for debugging/artifacts.
  ctx: FillerContext;
  input: ProtocolInput;
  timeoutMs?: number;
}

export type ProtocolFillResult =
  | { ok: true; course: FilledCourse }
  | { ok: false; error: string };

export interface GenerationProtocol {
  id: string;
  name: string;
  requiresStudyText: boolean;
  supportsFormats: string[]; // e.g., ['practice', 'learnplay-v1']
  
  /**
   * Fill a provided skeleton with protocol-specific logic.
   * This keeps item identity fields (id/groupId/clusterId/variant/mode) stable.
   */
  fillCourse(args: ProtocolFillArgs): Promise<ProtocolFillResult>;
  validateInput?(input: ProtocolInput): { valid: boolean; errors: string[] };
}

export interface ProtocolDescriptor {
  id: string;
  name: string;
  description: string;
  requiresStudyText: boolean;
  supportsFormats: string[];
}

// Validation helpers

export function isValidObjective(obj: unknown): obj is LearningObjective {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.description === 'string' &&
    o.description.trim().length > 0 &&
    typeof o.bloomLevel === 'string' &&
    ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'].includes(o.bloomLevel)
  );
}

export function isValidObjectiveList(arr: unknown): arr is LearningObjective[] {
  if (!Array.isArray(arr)) return false;
  if (arr.length === 0) return false;
  return arr.every(isValidObjective);
}

export function isValidExercise(ex: unknown): ex is GeneratedExercise {
  if (!ex || typeof ex !== 'object') return false;
  const e = ex as Record<string, unknown>;
  return (
    typeof e.stem === 'string' &&
    e.stem.trim().length > 0 &&
    Array.isArray(e.options) &&
    e.options.length >= 3 &&
    e.options.length <= 4 &&
    e.options.every((opt: unknown) => typeof opt === 'string' && opt.trim().length > 0) &&
    typeof e.correctIndex === 'number' &&
    e.correctIndex >= 0 &&
    e.correctIndex < e.options.length &&
    typeof e.explanation === 'string' &&
    e.explanation.trim().length > 0 &&
    (e.difficulty === undefined || ['easy', 'medium', 'hard'].includes(e.difficulty as string))
  );
}

export function isValidExerciseSet(set: unknown): set is ExerciseSet {
  if (!set || typeof set !== 'object') return false;
  const s = set as Record<string, unknown>;
  return (
    typeof s.objectiveId === 'string' &&
    Array.isArray(s.exercises) &&
    s.exercises.length >= 3 &&
    s.exercises.length <= 5 &&
    s.exercises.every(isValidExercise)
  );
}

export function isValidProtocolOutput(output: unknown): output is ProtocolOutput {
  if (!output || typeof output !== 'object') return false;
  const o = output as Record<string, unknown>;
  
  if (!isValidObjectiveList(o.objectives)) return false;
  if (!Array.isArray(o.exerciseSets)) return false;
  if (o.exerciseSets.length === 0) return false;
  if (!o.exerciseSets.every(isValidExerciseSet)) return false;
  
  // Validate that each exerciseSet references a valid objectiveId
  const objectiveIds = new Set((o.objectives as LearningObjective[]).map(obj => obj.id));
  const setObjectiveIds = (o.exerciseSets as ExerciseSet[]).map(set => set.objectiveId);
  return setObjectiveIds.every(id => objectiveIds.has(id));
}

