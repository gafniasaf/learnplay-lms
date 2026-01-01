/**
 * Lesson Kit Types
 *
 * Ported from Teacherbuddy (material-mindmap-forge) and adapted for LearnPlay.
 *
 * This file defines the data structures for:
 * - Ground Truth (extracted from study text, zero LLM)
 * - Lesson Kit (final output for teachers)
 * - Validation results
 */

// ============================================================
// GROUND TRUTH (Pass 1 output - no LLM)
// ============================================================

export interface SourceSpan {
  startOffset: number;
  endOffset: number;
  sourceQuote: string; // Short excerpt for traceability
}

export interface KeyConcept {
  text: string;
  source: SourceSpan;
}

export interface ProcedureStep {
  stepNumber: number;
  instruction: string;
  source: SourceSpan;
}

export interface Warning {
  text: string;
  type: "tip" | "let_op" | "belangrijk" | "waarschuwing" | "aandachtspunt";
  source: SourceSpan;
}

export interface CorrectIncorrectPair {
  wrong: string;
  right: string;
  explanation?: string;
  source: SourceSpan;
}

export interface MediaAsset {
  type: "image" | "video" | "animation" | "iframe";
  url: string;
  caption?: string;
  source: SourceSpan;
}

export interface GroundTruth {
  moduleId: string;
  sourceHash: string;
  extractedAt: string;

  // Content elements
  title: string;
  keyConcepts: KeyConcept[];
  procedures: ProcedureStep[];
  warnings: Warning[];
  correctIncorrectPairs: CorrectIncorrectPair[];
  mediaAssets: MediaAsset[];

  // Raw text for LLM context
  plainText: string;

  // Metadata
  wordCount: number;
  hasStepByStep: boolean;
  hasPairs: boolean;
}

// ============================================================
// LESSON KIT (Final output)
// ============================================================

export interface TimeAllocation {
  start: number; // minutes
  kern: number;
  afsluiting: number;
}

export interface QuickStart {
  oneLiner: string;
  keyConcepts: string[];
  check: string;
  timeAllocation: TimeAllocation;
}

export type ScriptAction =
  | "OPEN"
  | "VRAAG"
  | "DEMO"
  | "OEFENING"
  | "CHECK"
  | "SAMENVATTING"
  | "KOPPELING"
  | "INTRODUCTIE";

export type LessonPhase = "start" | "kern" | "afsluiting";

export interface TeacherScriptItem {
  time: string; // "0:00" format
  phase: LessonPhase;
  action: ScriptAction;
  content: string;

  // Traceability
  sourceRef?: string; // e.g. "keyConcepts[0]" or "procedures[2]"
  isGrounded: boolean; // true = must have sourceRef, false = scaffolding allowed

  // Optional structured data
  expectedAnswers?: string[];
  ifNoAnswer?: string;
  slide?: number;
}

export interface DiscussionQuestion {
  question: string;
  background: string;
  expectedAnswers: string[];
  misconceptions: string[];
  followUp?: string;
  sourceRef?: string;
}

export interface RubricLevel {
  voldoende: string;
  goed: string;
  excellent: string;
}

export interface GroupWork {
  title: string;
  durationMinutes: number;
  groupSize: number;
  roles?: string[];
  materials: string[];
  steps: string[];
  rubric: Record<string, RubricLevel>;
}

export interface StudentHandout {
  title: string;
  exercises: Array<{
    type: "fill_in" | "order" | "good_or_bad" | "open";
    content: unknown;
  }>;
}

export interface SlideAsset {
  slide: number;
  title: string;
  bullets?: string[];
  imageUrl?: string;
  animationUrl?: string;
}

export interface LessonKit {
  version: "1.0";
  moduleId: string;
  protocolUsed: string;
  groundTruthHash: string;

  // Quality metrics
  groundingScore: number; // 0-1
  coverageScore: number; // 0-1

  // Content sections
  quickStart: QuickStart;
  teacherScript: TeacherScriptItem[];
  discussionQuestions: DiscussionQuestion[];
  groupWork: GroupWork;
  studentHandout: StudentHandout;
  slideAssets: SlideAsset[];

  // Metadata
  builtAt: string;
  needsReview: boolean;
  reviewReasons?: string[];
}

// ============================================================
// VALIDATION TYPES
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  groundingScore: number;
  coverageScore: number;
}

export interface BuildResult {
  success: boolean;
  kit?: LessonKit;
  error?: string;
  details?: unknown;
  logs: string[];
  needsReview?: boolean;
  groundingScore?: number;
}

// ============================================================
// PROTOCOL TYPES
// ============================================================

export interface ExtractionRules {
  keyConceptPatterns: RegExp[];
  procedurePatterns: RegExp[];
  warningPatterns: RegExp[];
  correctIncorrectPatterns: RegExp[];
}

export interface LessonKitProtocol {
  id: string;
  name: string;
  description: string;

  // Content type detection
  detectApplicability(groundTruth: GroundTruth): number; // 0-1 score

  // Extraction rules (Pass 1)
  extractionRules: ExtractionRules;

  // Transform prompt (Pass 2)
  buildTransformPrompt(groundTruth: GroundTruth): string;
  getSystemPrompt(): string;

  // Post-processing
  postProcess(rawKit: Partial<LessonKit>, groundTruth: GroundTruth): Partial<LessonKit>;

  // Validation (Pass 3)
  validate(kit: LessonKit, groundTruth: GroundTruth): ValidationResult;

  // Coverage requirements
  coverageRequirements: {
    minProcedureStepsUsed?: number;
    minWarningsUsed?: number;
    minPairsUsed?: number;
    minConceptsUsed?: number;
  };
}



