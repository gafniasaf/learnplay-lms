/**
 * Lesson Kit Pipeline (3-pass)
 *
 * Ported from Teacherbuddy (material-mindmap-forge) and adapted for LearnPlay.
 *
 * Pass 1: Extract Ground Truth (no LLM)
 * Pass 2: Transform to Kit (constrained LLM)
 * Pass 3: Validate and Repair (no silent fallbacks)
 */

// Re-export types
export type {
  GroundTruth,
  LessonKit,
  BuildResult,
  ValidationResult,
  LessonKitProtocol,
  QualityThresholds,
} from "./types.ts";

// Re-export functions
export { extractGroundTruth, validateGroundTruth } from "./extract-ground-truth.ts";
export { transformToKit } from "./transform-to-kit.ts";
export {
  validateAndRepair,
  detectHallucinations,
  calculateGroundingScore,
  calculateCoverageScore,
  DEFAULT_THRESHOLDS,
} from "./validate-and-repair.ts";
export { getProtocol, selectProtocol, listProtocols, lessonKitProtocols } from "./protocol-registry.ts";

import type { BuildResult, LessonKit, GroundTruth } from "./types.ts";
import { extractGroundTruth, validateGroundTruth } from "./extract-ground-truth.ts";
import { transformToKit } from "./transform-to-kit.ts";
import { validateAndRepair, DEFAULT_THRESHOLDS } from "./validate-and-repair.ts";
import { getProtocol, selectProtocol } from "./protocol-registry.ts";

export interface BuildLessonKitOptions {
  protocolId?: string; // Force specific protocol (auto-detected if not set)
  skipLLM?: boolean; // Skip LLM transform (explicit)
  autoRepair?: boolean; // Auto-repair validation errors
  thresholds?: Partial<typeof DEFAULT_THRESHOLDS>;
}

/**
 * Build a lesson kit from study text HTML
 */
export async function buildLessonKit(
  moduleId: string,
  htmlContent: string,
  options: BuildLessonKitOptions = {},
): Promise<BuildResult> {
  const logs: string[] = [];
  const startTime = Date.now();

  try {
    // ============================================================
    // PASS 1: EXTRACT GROUND TRUTH (Zero LLM)
    // ============================================================
    logs.push("=== PASS 1: Extract Ground Truth ===");

    const groundTruth = extractGroundTruth(moduleId, htmlContent, options.protocolId);

    logs.push(`Module: ${groundTruth.title}`);
    logs.push(`Word count: ${groundTruth.wordCount}`);
    logs.push(`Key concepts: ${groundTruth.keyConcepts.length}`);
    logs.push(`Procedures: ${groundTruth.procedures.length}`);
    logs.push(`Warnings: ${groundTruth.warnings.length}`);
    logs.push(`Correct/Incorrect pairs: ${groundTruth.correctIncorrectPairs.length}`);
    logs.push(`Media assets: ${groundTruth.mediaAssets.length}`);

    // Validate ground truth
    const gtValidation = validateGroundTruth(groundTruth);
    if (!gtValidation.valid) {
      logs.push(`Ground truth validation failed: ${gtValidation.reason}`);
      return {
        success: false,
        error: `Insufficient content: ${gtValidation.reason}`,
        logs,
        needsReview: true,
      };
    }

    logs.push(`Suggested protocol: ${gtValidation.suggestedProtocol}`);

    // Select protocol (respect forced protocolId)
    const protocolId = options.protocolId || gtValidation.suggestedProtocol;
    const protocol = protocolId ? getProtocol(protocolId) : selectProtocol(groundTruth);
    logs.push(`Selected protocol: ${protocol.id} (${protocol.name})`);

    // ============================================================
    // PASS 2: TRANSFORM TO KIT (Constrained LLM)
    // ============================================================
    logs.push("");
    logs.push("=== PASS 2: Transform to Kit ===");

    const rawKit = await transformToKit(groundTruth, protocol.id, {
      skipLLM: options.skipLLM,
      logs,
    });

    logs.push(`Teacher script items: ${(rawKit as any).teacherScript?.length || 0}`);
    logs.push(`Discussion questions: ${(rawKit as any).discussionQuestions?.length || 0}`);

    // ============================================================
    // PASS 3: VALIDATE AND REPAIR
    // ============================================================
    logs.push("");
    logs.push("=== PASS 3: Validate and Repair ===");

    const { kit, validation, repaired } = await validateAndRepair(rawKit, groundTruth, {
      thresholds: options.thresholds,
      autoRepair: options.autoRepair ?? true,
      logs,
    });

    if (repaired) {
      logs.push("Kit was repaired during validation");
    }

    // ============================================================
    // RESULT
    // ============================================================
    const elapsed = Date.now() - startTime;
    logs.push("");
    logs.push(`=== Complete (${elapsed}ms) ===`);
    logs.push(`Valid: ${validation.valid}`);
    logs.push(`Grounding: ${(validation.groundingScore * 100).toFixed(1)}%`);
    logs.push(`Coverage: ${(validation.coverageScore * 100).toFixed(1)}%`);
    logs.push(`Needs review: ${(kit as any).needsReview}`);

    return {
      success: true,
      kit: kit as LessonKit,
      logs,
      needsReview: (kit as any).needsReview,
      groundingScore: validation.groundingScore,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push(`Pipeline error: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      details: error,
      logs,
    };
  }
}

/**
 * Check if a module already has a valid lesson kit (cache/skip logic)
 */
export function shouldRebuildKit(existingKit: LessonKit | null, currentSourceHash: string): boolean {
  if (!existingKit) return true;

  // Rebuild if source has changed
  if (existingKit.groundTruthHash !== currentSourceHash) {
    return true;
  }

  // Rebuild if kit needs review (low quality)
  if (existingKit.needsReview) {
    return true;
  }

  // Rebuild if grounding score is too low
  if (existingKit.groundingScore < DEFAULT_THRESHOLDS.minGroundingScore) {
    return true;
  }

  return false;
}



