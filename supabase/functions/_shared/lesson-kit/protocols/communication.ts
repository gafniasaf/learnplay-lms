/**
 * Communication Protocol
 *
 * For communication/soft skills content (feedback, gesprekken, motiveren).
 * Focuses on: Correct/incorrect pairs, discussion questions, role-play.
 */

import type {
  GroundTruth,
  LessonKit,
  LessonKitProtocol,
  ValidationResult,
  ExtractionRules,
} from "../types.ts";
import { COMMUNICATION_KEYWORDS, countKeywordMatches } from "../protocol-registry.ts";

// ============================================================
// EXTRACTION RULES
// ============================================================

const extractionRules: ExtractionRules = {
  keyConceptPatterns: [
    /<h[23][^>]*>([^<]{5,100})<\/h[23]>/gi,
    /(?:^|\n)\*\*([^*]{10,80})\*\*/gm,
    /(?:^|\n)#{2,3}\s+([^\n]{5,80})/gm,
  ],
  procedurePatterns: [
    // Communication often has numbered steps too
    /(\d+)\.\s+([^<\n]{20,200})/gm,
    /stap\s*(\d+)[:\s]+([^<\n]{10,200})/gi,
  ],
  warningPatterns: [
    /(let op|belangrijk|tip)[:\s]+([^<\n]{10,200})/gi,
    /veelvoorkomende\s+(?:fout|misconceptie)[:\s]+([^<\n]{10,200})/gi,
  ],
  correctIncorrectPatterns: [
    // "Correct: '...' Niet correct: '...'"
    /(?:niet\s+)?correct[:\s]+['"]([^'"]{10,200})['"]/gi,
    // "Goed: ... Fout: ..."
    /(?:goed|juist)[:\s]+['"]?([^'"<\n]{10,150})['"]?/gi,
    /(?:fout|onjuist)[:\s]+['"]?([^'"<\n]{10,150})['"]?/gi,
    // Table format with Zeg dit (fout) | Goed antwoord
    /(?:fout|verkeerd)[^|]*\|\s*([^|]{10,200})\s*\|/gi,
  ],
};

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `Je bent een expert in het maken van lesplannen voor communicatieve vaardigheden in de zorg.

Je taak is om een TEACHER SCRIPT te maken op basis van de gegeven GROUND_TRUTH.

STRIKTE REGELS:
1. Gebruik ALLEEN content uit GROUND_TRUTH
2. Elk correct/incorrect paar wordt een VRAAG-actie in de kern
3. "Niet correct" voorbeelden worden "Wat is hier mis?" vragen
4. "Correct" voorbeelden worden verwachte antwoorden
5. Voeg GEEN nieuwe voorbeelden toe die niet in de ground truth staan

DISCUSSIE PATROON:
- Presenteer het "foute" voorbeeld
- Vraag: "Wat is hier mis mee?"
- Wacht op antwoorden
- Geef het "goede" voorbeeld als alternatief
- Leg uit waarom

OUTPUT FORMAT:
- teacherScript met items die time, phase, action, content, sourceRef bevatten
- Acties: OPEN, VRAAG, OEFENING, CHECK, SAMENVATTING
- Phases: start, kern, afsluiting`;

// ============================================================
// USER PROMPT BUILDER
// ============================================================

function buildTransformPrompt(gt: GroundTruth): string {
  return `Maak een teacher script voor deze communicatie module.

GROUND_TRUTH:
${JSON.stringify(
    {
      moduleId: gt.moduleId,
      title: gt.title,
      keyConcepts: gt.keyConcepts.map((c, i) => ({
        index: i,
        text: c.text,
        sourceQuote: c.source.sourceQuote,
      })),
      correctIncorrectPairs: gt.correctIncorrectPairs.map((p, i) => ({
        index: i,
        wrong: p.wrong,
        right: p.right,
        explanation: p.explanation,
      })),
      warnings: gt.warnings.map((w, i) => ({
        index: i,
        type: w.type,
        text: w.text,
      })),
      procedures:
        gt.procedures.length > 0
          ? gt.procedures.map((p, i) => ({
              index: i,
              step: p.stepNumber,
              instruction: p.instruction,
            }))
          : undefined,
    },
    null,
    2,
  )}

VEREISTEN:
1. Elk correct/incorrect paar wordt een discussie-moment in de kern
2. Gebruik het patroon: toon fout → vraag wat mis is → bespreek → toon goed alternatief
3. Include sourceRef voor elke grounded item (bijv. "correctIncorrectPairs[0]")
4. Groepswerk moet rollenspel bevatten met situaties uit de content
5. De CHECK moet studenten vragen om zelf feedback te geven

Geef output als JSON met deze structuur:
{
  "quickStart": {
    "oneLiner": "...",
    "keyConcepts": ["...", "...", "..."],
    "check": "...",
    "timeAllocation": { "start": 10, "kern": 25, "afsluiting": 10 }
  },
  "teacherScript": [
    { "time": "0:00", "phase": "start", "action": "OPEN", "content": "...", "isGrounded": false },
    { "time": "12:00", "phase": "kern", "action": "VRAAG", "content": "...", "sourceRef": "correctIncorrectPairs[0]", "isGrounded": true, "expectedAnswers": ["..."] }
  ],
  "discussionQuestions": [...],
  "groupWork": {...},
  "studentHandout": {...}
}`;
}

// ============================================================
// VALIDATION
// ============================================================

function validate(kit: LessonKit, gt: GroundTruth): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  // Check that correct/incorrect pairs are used
  const vraagItems = kit.teacherScript.filter((s) => s.action === "VRAAG" || s.action === "OEFENING");
  const pairRefs = new Set(
    vraagItems
      .filter((s) => s.sourceRef?.startsWith("correctIncorrectPairs["))
      .map((s) => s.sourceRef),
  );

  const pairsUsed = pairRefs.size;
  const totalPairs = gt.correctIncorrectPairs.length;

  if (pairsUsed < totalPairs && totalPairs > 0) {
    // It's OK to not use all pairs, but flag if less than half
    if (pairsUsed < totalPairs / 2) {
      errors.push({
        field: "correctIncorrectPairs",
        message: `Slechts ${pairsUsed}/${totalPairs} correct/incorrect paren gebruikt`,
        severity: "warning",
      });
    }
  }

  // Check for role-play in group work
  if (kit.groupWork) {
    const hasRolePlay =
      kit.groupWork.title.toLowerCase().includes("rollenspel") ||
      kit.groupWork.roles?.some((r) => r.toLowerCase().includes("gever") || r.toLowerCase().includes("ontvanger"));

    if (!hasRolePlay) {
      errors.push({
        field: "groupWork",
        message: "Communicatie module zou rollenspel moeten bevatten",
        severity: "warning",
      });
    }
  }

  // Calculate grounding score
  const groundedItems = kit.teacherScript.filter((s) => s.isGrounded);
  const withSourceRef = groundedItems.filter((s) => s.sourceRef);
  const groundingScore = groundedItems.length > 0 ? withSourceRef.length / groundedItems.length : 1;

  // Calculate coverage score
  const conceptsUsed = new Set(
    kit.teacherScript
      .filter((s) => s.sourceRef?.startsWith("keyConcepts["))
      .map((s) => s.sourceRef),
  ).size;

  const totalRequired = gt.correctIncorrectPairs.length + gt.keyConcepts.length;
  const covered = pairsUsed + conceptsUsed;
  const coverageScore = totalRequired > 0 ? Math.min(1, covered / totalRequired) : 1;

  return {
    valid: errors.filter((e) => e.severity === "error").length === 0,
    errors,
    groundingScore,
    coverageScore,
  };
}

// ============================================================
// POST-PROCESSING
// ============================================================

function postProcess(rawKit: Partial<LessonKit>, gt: GroundTruth): Partial<LessonKit> {
  // Ensure group work has role-play structure if not present
  if (!rawKit.groupWork?.roles || rawKit.groupWork.roles.length === 0) {
    if (rawKit.groupWork) {
      rawKit.groupWork.roles = ["feedbackgever", "ontvanger", "observator"];
      rawKit.groupWork.groupSize = 3;
    }
  }

  // Add discussion questions from pairs if not enough
  if (!rawKit.discussionQuestions || rawKit.discussionQuestions.length < 2) {
    rawKit.discussionQuestions = gt.correctIncorrectPairs.slice(0, 3).map((pair, i) => ({
      question: `Waarom is "${pair.wrong}" geen goede formulering?`,
      background: "Test of studenten het verschil begrijpen",
      expectedAnswers: pair.explanation ? [pair.explanation] : ["Het gaat over de persoon, niet over gedrag"],
      misconceptions: [],
      sourceRef: `correctIncorrectPairs[${i}]`,
    }));
  }

  return rawKit;
}

// ============================================================
// PROTOCOL EXPORT
// ============================================================

export const communicationProtocol: LessonKitProtocol = {
  id: "communication",
  name: "Communication Skills (Communicatie)",
  description: "Voor gesprekstechnieken zoals feedback geven, slecht nieuws gesprek, motiveren",

  detectApplicability(gt: GroundTruth): number {
    // High score if we found correct/incorrect pairs
    const hasPairs = gt.correctIncorrectPairs.length >= 2;
    const keywordScore =
      countKeywordMatches(gt.plainText, COMMUNICATION_KEYWORDS) / COMMUNICATION_KEYWORDS.length;

    if (hasPairs) return 0.95;
    if (gt.hasPairs) return 0.8;
    return keywordScore * 0.6;
  },

  extractionRules,

  buildTransformPrompt,
  getSystemPrompt: () => SYSTEM_PROMPT,

  postProcess,
  validate,

  coverageRequirements: {
    minPairsUsed: 2,
    minConceptsUsed: 2,
  },
};



