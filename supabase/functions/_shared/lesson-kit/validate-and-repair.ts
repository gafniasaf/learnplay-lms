/**
 * Validate and Repair (Pass 3)
 *
 * Validates lesson kit against ground truth and repairs issues.
 * - Schema validation
 * - Protocol-specific validation
 * - Hallucination detection
 * - Grounding/coverage scoring
 */

import type {
  GroundTruth,
  LessonKit,
  ValidationResult,
  ValidationError,
} from "./types.ts";
import { getProtocol } from "./protocol-registry.ts";

// ============================================================
// QUALITY THRESHOLDS (can be overridden by callers)
// ============================================================

export interface QualityThresholds {
  minGroundingScore: number; // 0-1, default 0.8
  minCoverageScore: number; // 0-1, default 0.7
  maxHallucinationTerms: number; // default 0
  requireAllWarningsUsed: boolean;
  requireTimingValidation: boolean;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  minGroundingScore: 0.8,
  minCoverageScore: 0.7,
  maxHallucinationTerms: 0,
  requireAllWarningsUsed: true,
  requireTimingValidation: true,
};

// ============================================================
// SCHEMA VALIDATION
// ============================================================

/**
 * Validate that the kit has all required fields
 */
function validateSchema(kit: Partial<LessonKit>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required top-level fields
  if (!kit.moduleId) {
    errors.push({ field: "moduleId", message: "Missing moduleId", severity: "error" });
  }

  if (!kit.quickStart) {
    errors.push({ field: "quickStart", message: "Missing quickStart section", severity: "error" });
  } else {
    if (!kit.quickStart.oneLiner) {
      errors.push({ field: "quickStart.oneLiner", message: "Missing one-liner", severity: "error" });
    }
    if (!kit.quickStart.keyConcepts || kit.quickStart.keyConcepts.length < 2) {
      errors.push({ field: "quickStart.keyConcepts", message: "Need at least 2 key concepts", severity: "warning" });
    }
    if (!kit.quickStart.check) {
      errors.push({ field: "quickStart.check", message: "Missing check question", severity: "warning" });
    }
  }

  if (!kit.teacherScript || kit.teacherScript.length === 0) {
    errors.push({ field: "teacherScript", message: "Missing teacher script", severity: "error" });
  }

  // Validate teacher script items
  if (kit.teacherScript) {
    for (let i = 0; i < kit.teacherScript.length; i++) {
      const item = kit.teacherScript[i];
      if (item.time === undefined || item.time === null || item.time === "") {
        errors.push({ field: `teacherScript[${i}].time`, message: "Missing time", severity: "error" });
      }
      if (!item.phase) {
        errors.push({ field: `teacherScript[${i}].phase`, message: "Missing phase", severity: "error" });
      }
      if (!item.action) {
        errors.push({ field: `teacherScript[${i}].action`, message: "Missing action", severity: "error" });
      }
      if (!item.content) {
        errors.push({ field: `teacherScript[${i}].content`, message: "Missing content", severity: "warning" });
      }
      // Grounded items must have sourceRef
      if (item.isGrounded && !item.sourceRef) {
        errors.push({
          field: `teacherScript[${i}].sourceRef`,
          message: "Grounded item missing sourceRef",
          severity: "warning",
        });
      }
    }
  }

  return errors;
}

// ============================================================
// TIMING VALIDATION
// ============================================================

/**
 * Validate that timing adds up correctly
 */
function parseTimeMinutes(time: unknown): number | null {
  if (typeof time === "number" && Number.isFinite(time)) {
    return Math.max(0, Math.floor(time));
  }
  if (typeof time !== "string") return null;
  const s = time.trim();
  if (!s) return null;
  const [minsRaw] = s.split(":");
  const mins = Number(minsRaw);
  if (!Number.isFinite(mins)) return null;
  return Math.max(0, Math.floor(mins));
}

function validateTiming(kit: Partial<LessonKit>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!kit.quickStart?.timeAllocation || !kit.teacherScript) {
    return errors;
  }

  const { start, kern, afsluiting } = kit.quickStart.timeAllocation;
  const totalMinutes = start + kern + afsluiting;

  // Check that script items fit within time allocation
  const lastItem = kit.teacherScript[kit.teacherScript.length - 1];
  if (lastItem && lastItem.time !== undefined && lastItem.time !== null && lastItem.time !== "") {
    const mins = parseTimeMinutes(lastItem.time);
    if (mins === null) {
      errors.push({
        field: "teacherScript",
        message: `Invalid time value on last script item: ${String(lastItem.time)}`,
        severity: "warning",
      });
    } else if (mins > totalMinutes) {
      errors.push({
        field: "teacherScript",
        message: `Last script item at ${String(lastItem.time)} exceeds total time (${totalMinutes} min)`,
        severity: "warning",
      });
    }
  }

  // Check phase boundaries
  const phases: Record<string, number> = { start: 0, kern: 0, afsluiting: 0 };
  for (const item of kit.teacherScript) {
    if (item.phase && item.time !== undefined && item.time !== null && item.time !== "") {
      const mins = parseTimeMinutes(item.time);
      if (mins === null) {
        errors.push({
          field: "teacherScript",
          message: `Invalid time value in script item: ${String(item.time)}`,
          severity: "warning",
        });
        continue;
      }
      phases[item.phase] = Math.max(phases[item.phase], mins);
    }
  }

  if (phases.kern < start) {
    errors.push({
      field: "teacherScript",
      message: `Kern phase starts at ${phases.kern}, should be after start (${start} min)`,
      severity: "warning",
    });
  }

  return errors;
}

// ============================================================
// HALLUCINATION DETECTION
// ============================================================

/**
 * Detect terms in the kit that don't appear in ground truth
 */
export function detectHallucinations(kit: Partial<LessonKit>, gt: GroundTruth): string[] {
  const hallucinations: string[] = [];

  // Build a vocabulary from ground truth
  const gtVocab = new Set<string>();
  const gtText = [
    gt.plainText,
    ...gt.keyConcepts.map((c) => c.text),
    ...gt.procedures.map((p) => p.instruction),
    ...gt.warnings.map((w) => w.text),
    ...gt.correctIncorrectPairs.map((p) => `${p.wrong} ${p.right}`),
  ].join(" ").toLowerCase();

  // Extract significant words (4+ chars)
  for (const word of gtText.split(/\s+/)) {
    const clean = word.replace(/[^a-z]/g, "");
    if (clean.length >= 4) {
      gtVocab.add(clean);
    }
  }

  // Check grounded content in kit
  const kitText: string[] = [];

  if (kit.teacherScript) {
    for (const item of kit.teacherScript) {
      if (item.isGrounded && item.content) {
        kitText.push(item.content);
      }
    }
  }

  // Find terms in kit that aren't in ground truth
  const checkedTerms = new Set<string>();

  for (const text of kitText) {
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, "");
      if (clean.length >= 6 && !checkedTerms.has(clean)) {
        checkedTerms.add(clean);

        // Check if this is a technical/medical term not in GT
        const isTechnical = /^[a-z]+(?:atie|itis|ose|isme|logie|tomie|scopie)$/.test(clean);
        if (isTechnical && !gtVocab.has(clean)) {
          // Check for partial matches (allow prefixes)
          const hasPartialMatch = [...gtVocab].some((v) => v.includes(clean) || clean.includes(v));
          if (!hasPartialMatch) {
            hallucinations.push(clean);
          }
        }
      }
    }
  }

  return hallucinations;
}

// ============================================================
// GROUNDING / COVERAGE SCORES
// ============================================================

/**
 * Calculate how well grounded the kit is in the source material
 */
export function calculateGroundingScore(kit: Partial<LessonKit>, gt: GroundTruth): number {
  if (!kit.teacherScript || kit.teacherScript.length === 0) {
    return 0;
  }

  const groundedItems = kit.teacherScript.filter((s) => s.isGrounded);
  if (groundedItems.length === 0) {
    return 1; // No grounded items = nothing to check
  }

  const withValidSourceRef = groundedItems.filter((s) => {
    if (!s.sourceRef) return false;

    // Validate that sourceRef points to something that exists
    const match = s.sourceRef.match(/^(\w+)\[(\d+)\]$/);
    if (!match) return false;

    const [, collection, indexStr] = match;
    const index = parseInt(indexStr);

    switch (collection) {
      case "keyConcepts":
        return index < gt.keyConcepts.length;
      case "procedures":
        return index < gt.procedures.length;
      case "warnings":
        return index < gt.warnings.length;
      case "correctIncorrectPairs":
        return index < gt.correctIncorrectPairs.length;
      default:
        return false;
    }
  });

  return withValidSourceRef.length / groundedItems.length;
}

/**
 * Calculate coverage score (how much of ground truth is used)
 */
export function calculateCoverageScore(kit: Partial<LessonKit>, gt: GroundTruth): number {
  const usedRefs = new Set<string>();

  if (kit.teacherScript) {
    for (const item of kit.teacherScript) {
      if (item.sourceRef) {
        usedRefs.add(item.sourceRef);
      }
    }
  }

  // Calculate what should be covered based on content type
  const totalItems =
    gt.keyConcepts.length +
    gt.procedures.length +
    gt.warnings.length +
    gt.correctIncorrectPairs.length;

  if (totalItems === 0) return 1;

  // Count used items
  let usedCount = 0;
  for (let i = 0; i < gt.keyConcepts.length; i++) {
    if (usedRefs.has(`keyConcepts[${i}]`)) usedCount++;
  }
  for (let i = 0; i < gt.procedures.length; i++) {
    if (usedRefs.has(`procedures[${i}]`)) usedCount++;
  }
  for (let i = 0; i < gt.warnings.length; i++) {
    if (usedRefs.has(`warnings[${i}]`)) usedCount++;
  }
  for (let i = 0; i < gt.correctIncorrectPairs.length; i++) {
    if (usedRefs.has(`correctIncorrectPairs[${i}]`)) usedCount++;
  }

  return Math.min(1, usedCount / totalItems);
}

// ============================================================
// REPAIR
// ============================================================

/**
 * Attempt to repair a kit that failed validation
 */
export async function repairKit(
  kit: Partial<LessonKit>,
  gt: GroundTruth,
  errors: ValidationError[],
): Promise<Partial<LessonKit>> {
  const repaired = { ...kit };

  for (const error of errors) {
    // Only repair fixable issues
    if (error.severity !== "error") continue;

    if (error.field === "quickStart" && !repaired.quickStart) {
      repaired.quickStart = {
        oneLiner: `In deze les behandelen we ${gt.title}.`,
        keyConcepts: gt.keyConcepts.slice(0, 3).map((c) => c.text),
        check: "Vat de kernpunten samen.",
        timeAllocation: { start: 10, kern: 25, afsluiting: 10 },
      };
    }

    if (error.field === "teacherScript" && (!repaired.teacherScript || repaired.teacherScript.length === 0)) {
      repaired.teacherScript = [
        {
          time: "0:00",
          phase: "start",
          action: "OPEN",
          content: `Vandaag behandelen we ${gt.title}.`,
          isGrounded: false,
        },
        {
          time: "10:00",
          phase: "kern",
          action: "INTRODUCTIE",
          content: gt.keyConcepts[0]?.text || "Kerninhoud",
          isGrounded: true,
          sourceRef: "keyConcepts[0]",
        },
        {
          time: "35:00",
          phase: "afsluiting",
          action: "SAMENVATTING",
          content: "Samenvatting van de les.",
          isGrounded: false,
        },
      ];
    }

    // Add missing sourceRefs by finding nearest match
    if (error.field.includes("sourceRef")) {
      const match = error.field.match(/teacherScript\[(\d+)\]/);
      if (match && repaired.teacherScript) {
        const index = parseInt(match[1]);
        const item = repaired.teacherScript[index];
        if (item && item.isGrounded && !item.sourceRef) {
          // Try to find a matching concept
          const itemContent = item.content.toLowerCase();
          for (let i = 0; i < gt.keyConcepts.length; i++) {
            const concept = gt.keyConcepts[i].text.toLowerCase();
            if (itemContent.includes(concept) || concept.includes(itemContent.slice(0, 20))) {
              item.sourceRef = `keyConcepts[${i}]`;
              break;
            }
          }
        }
      }
    }
  }

  return repaired;
}

// ============================================================
// MAIN VALIDATION FUNCTION
// ============================================================

/**
 * Validate and optionally repair a lesson kit
 * This is Pass 3 of the pipeline
 */
export async function validateAndRepair(
  kit: Partial<LessonKit>,
  gt: GroundTruth,
  options: {
    thresholds?: Partial<QualityThresholds>;
    autoRepair?: boolean;
    logs?: string[];
  } = {},
): Promise<{ kit: Partial<LessonKit>; validation: ValidationResult; repaired: boolean }> {
  const logs = options.logs || [];
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };

  logs.push("Pass 3: Validating lesson kit...");

  // Schema validation
  const schemaErrors = validateSchema(kit);
  logs.push(`  Schema errors: ${schemaErrors.length}`);

  // Timing validation
  let timingErrors: ValidationError[] = [];
  if (thresholds.requireTimingValidation) {
    timingErrors = validateTiming(kit);
    logs.push(`  Timing errors: ${timingErrors.length}`);
  }

  // Protocol-specific validation
  let protocolErrors: ValidationError[] = [];
  if (kit.protocolUsed) {
    try {
      const protocol = getProtocol(kit.protocolUsed);
      const protocolResult = protocol.validate(kit as LessonKit, gt);
      protocolErrors = protocolResult.errors;
      logs.push(`  Protocol (${kit.protocolUsed}) errors: ${protocolErrors.length}`);
    } catch {
      logs.push(`  Could not load protocol ${kit.protocolUsed}`);
    }
  }

  // Hallucination detection
  const hallucinations = detectHallucinations(kit, gt);
  if (hallucinations.length > thresholds.maxHallucinationTerms) {
    logs.push(`  Hallucinations detected: ${hallucinations.join(", ")}`);
  }

  // Calculate scores
  const groundingScore = calculateGroundingScore(kit, gt);
  const coverageScore = calculateCoverageScore(kit, gt);
  logs.push(`  Grounding score: ${(groundingScore * 100).toFixed(1)}%`);
  logs.push(`  Coverage score: ${(coverageScore * 100).toFixed(1)}%`);

  // Combine all errors
  const allErrors = [...schemaErrors, ...timingErrors, ...protocolErrors];

  // Add threshold violations
  if (groundingScore < thresholds.minGroundingScore) {
    allErrors.push({
      field: "groundingScore",
      message:
        `Grounding score ${(groundingScore * 100).toFixed(0)}% below threshold ` +
        `${(thresholds.minGroundingScore * 100).toFixed(0)}%`,
      severity: "warning",
    });
  }

  if (coverageScore < thresholds.minCoverageScore) {
    allErrors.push({
      field: "coverageScore",
      message:
        `Coverage score ${(coverageScore * 100).toFixed(0)}% below threshold ` +
        `${(thresholds.minCoverageScore * 100).toFixed(0)}%`,
      severity: "warning",
    });
  }

  if (hallucinations.length > thresholds.maxHallucinationTerms) {
    allErrors.push({
      field: "hallucinations",
      message: `Detected ${hallucinations.length} potentially hallucinated terms`,
      severity: "warning",
    });
  }

  const validation: ValidationResult = {
    valid: allErrors.filter((e) => e.severity === "error").length === 0,
    errors: allErrors,
    groundingScore,
    coverageScore,
  };

  // Auto-repair if requested and there are fixable errors
  let repaired = false;
  let finalKit = kit;

  if (options.autoRepair && allErrors.some((e) => e.severity === "error")) {
    logs.push("  Attempting auto-repair...");
    finalKit = await repairKit(kit, gt, allErrors);

    // Re-validate after repair
    const repairedSchemaErrors = validateSchema(finalKit);
    repaired = repairedSchemaErrors.length < schemaErrors.length;
    logs.push(`  Repair ${repaired ? "successful" : "incomplete"}`);
  }

  // Add scores to kit
  finalKit.groundingScore = groundingScore;
  finalKit.coverageScore = coverageScore;
  finalKit.needsReview = !validation.valid || groundingScore < thresholds.minGroundingScore;

  if (finalKit.needsReview) {
    finalKit.reviewReasons = allErrors
      .filter((e) => e.severity === "error" || e.severity === "warning")
      .map((e) => e.message);
  }

  return { kit: finalKit, validation, repaired };
}


