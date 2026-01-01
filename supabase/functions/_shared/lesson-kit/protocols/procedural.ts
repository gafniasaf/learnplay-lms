/**
 * Procedural Protocol
 *
 * For step-by-step skills content (nursing, technical procedures).
 * Focuses on: DEMO actions, procedure steps, warnings, checklists.
 */

import type {
  GroundTruth,
  LessonKit,
  LessonKitProtocol,
  ValidationResult,
  ExtractionRules,
} from "../types.ts";
import { PROCEDURAL_KEYWORDS, countKeywordMatches } from "../protocol-registry.ts";

// ============================================================
// EXTRACTION RULES
// ============================================================

const extractionRules: ExtractionRules = {
  keyConceptPatterns: [
    /<h[23][^>]*>([^<]{5,100})<\/h[23]>/gi,
    /<strong>([^<]{10,80})<\/strong>/gi,
    /(?:^|\n)\*\*([^*]{10,80})\*\*/gm,
  ],
  procedurePatterns: [
    /stap\s*(\d+)[:\s]+([^<\n]{10,200})/gi,
    /(\d+)\.\s+([^<\n]{20,200})/gm,
    /<li>([^<]{20,200})<\/li>/gi,
  ],
  warningPatterns: [
    /(let op|belangrijk|tip|aandachtspunt|waarschuwing)[:\s]+([^<\n]{10,200})/gi,
    /(?:^|\n)>\s*\*\*(LET OP|BELANGRIJK|TIP)[:\s]*\*\*:?\s*([^\n]{10,200})/gmi,
  ],
  correctIncorrectPatterns: [], // Not primary for procedural
};

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `Je bent een expert in het maken van lesplannen voor verpleegtechnische vaardigheden.

Je taak is om een TEACHER SCRIPT te maken op basis van de gegeven GROUND_TRUTH.

STRIKTE REGELS:
1. Gebruik ALLEEN content uit GROUND_TRUTH
2. Elke DEMO-actie moet een sourceRef bevatten die verwijst naar de originele procedure stap
3. ALLE waarschuwingen uit de ground truth moeten als "LET OP" in het script verschijnen
4. De volgorde van procedure stappen moet EXACT overeenkomen met de bron
5. Voeg GEEN nieuwe informatie toe die niet in de ground truth staat

OUTPUT FORMAT:
- teacherScript: array met items die time, phase, action, content, sourceRef bevatten
- Acties zijn: OPEN, VRAAG, DEMO, OEFENING, CHECK, SAMENVATTING
- Phases zijn: start, kern, afsluiting

Tijdsverdeling:
- START (10 min): Opening, activeren voorkennis
- KERN (25 min): Demo's van alle stappen, oefening
- AFSLUITING (10 min): Complicaties, check, afronding`;

// ============================================================
// USER PROMPT BUILDER
// ============================================================

function buildTransformPrompt(gt: GroundTruth): string {
  return `Maak een teacher script voor deze verpleegtechnische module.

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
      procedures: gt.procedures.map((p, i) => ({
        index: i,
        step: p.stepNumber,
        instruction: p.instruction,
        sourceQuote: p.source.sourceQuote,
      })),
      warnings: gt.warnings.map((w, i) => ({
        index: i,
        type: w.type,
        text: w.text,
      })),
      mediaAssets: gt.mediaAssets.map((m) => ({
        type: m.type,
        url: m.url,
        caption: m.caption,
      })),
    },
    null,
    2,
  )}

VEREISTEN:
1. Elk procedure stap wordt een DEMO in de kern fase
2. Elke warning wordt een "LET OP" callout
3. Include sourceRef voor elke grounded item (bijv. "procedures[0]", "warnings[1]")
4. Zorg voor een CHECK vraag die test of studenten de kernstappen begrijpen
5. Groepswerk moet peer-assessment met checklijst bevatten

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
    { "time": "10:00", "phase": "kern", "action": "DEMO", "content": "...", "sourceRef": "procedures[0]", "isGrounded": true }
  ],
  "discussionQuestions": [...],
  "groupWork": {...},
  "studentHandout": {...},
  "slideAssets": [...]
}`;
}

// ============================================================
// VALIDATION
// ============================================================

function validate(kit: LessonKit, gt: GroundTruth): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  // Check that all procedure steps appear in script
  const demoSteps = kit.teacherScript.filter((s) => s.action === "DEMO");
  const procedureRefs = new Set(
    demoSteps
      .filter((s) => s.sourceRef?.startsWith("procedures["))
      .map((s) => s.sourceRef),
  );

  for (let i = 0; i < gt.procedures.length; i++) {
    if (!procedureRefs.has(`procedures[${i}]`)) {
      errors.push({
        field: `procedures[${i}]`,
        message: `Procedure stap ${i + 1} ontbreekt in teacher script`,
        severity: "error",
      });
    }
  }

  // Check that all warnings appear
  const scriptText = kit.teacherScript.map((s) => s.content.toLowerCase()).join(" ");
  let warningsUsed = 0;
  for (const warning of gt.warnings) {
    // Check if key words from warning appear in script
    const warningWords = warning.text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const matchCount = warningWords.filter((w) => scriptText.includes(w)).length;
    if (matchCount >= Math.min(2, warningWords.length)) {
      warningsUsed++;
    }
  }

  if (warningsUsed < gt.warnings.length && gt.warnings.length > 0) {
    errors.push({
      field: "warnings",
      message: `Slechts ${warningsUsed}/${gt.warnings.length} waarschuwingen gebruikt`,
      severity: "warning",
    });
  }

  // Calculate grounding score
  const groundedItems = kit.teacherScript.filter((s) => s.isGrounded);
  const withSourceRef = groundedItems.filter((s) => s.sourceRef);
  const groundingScore = groundedItems.length > 0 ? withSourceRef.length / groundedItems.length : 1;

  // Calculate coverage score
  const totalRequired = gt.procedures.length + gt.warnings.length;
  const covered = procedureRefs.size + warningsUsed;
  const coverageScore = totalRequired > 0 ? covered / totalRequired : 1;

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
  // Ensure procedures are in correct order
  if (rawKit.teacherScript) {
    const demos = rawKit.teacherScript
      .filter((s) => s.action === "DEMO" && s.sourceRef?.startsWith("procedures["))
      .sort((a, b) => {
        const aIdx = parseInt(a.sourceRef?.match(/\d+/)?.[0] || "0");
        const bIdx = parseInt(b.sourceRef?.match(/\d+/)?.[0] || "0");
        return aIdx - bIdx;
      });

    // Recalculate times for demos
    let currentTime = 10; // Start of kern
    for (const demo of demos) {
      demo.time = `${currentTime}:00`;
      currentTime += 5; // 5 min per demo step
    }
  }

  // Add media assets to slide assets if not present
  if (!rawKit.slideAssets || rawKit.slideAssets.length === 0) {
    rawKit.slideAssets = gt.mediaAssets
      .filter((m) => m.type === "animation" || m.type === "image")
      .map((m, i) => ({
        slide: i + 2, // Slide 1 is intro
        title: m.caption || `Media ${i + 1}`,
        animationUrl: m.type === "animation" ? m.url : undefined,
        imageUrl: m.type === "image" ? m.url : undefined,
      }));
  }

  return rawKit;
}

// ============================================================
// PROTOCOL EXPORT
// ============================================================

export const proceduralProtocol: LessonKitProtocol = {
  id: "procedural",
  name: "Procedural Skills (Verpleegtechnisch)",
  description: "Voor stap-voor-stap vaardigheden zoals katheterisatie, injecties, wondverzorging",

  detectApplicability(gt: GroundTruth): number {
    // High score if we found step-by-step procedures
    const hasSteps = gt.procedures.length >= 3;
    const hasWarnings = gt.warnings.length >= 1;
    const keywordScore =
      countKeywordMatches(gt.plainText, PROCEDURAL_KEYWORDS) / PROCEDURAL_KEYWORDS.length;

    if (hasSteps && hasWarnings) return 0.9 + (keywordScore * 0.1);
    if (hasSteps) return 0.7 + (keywordScore * 0.2);
    if (gt.hasStepByStep) return 0.6;
    return keywordScore * 0.5;
  },

  extractionRules,

  buildTransformPrompt,
  getSystemPrompt: () => SYSTEM_PROMPT,

  postProcess,
  validate,

  coverageRequirements: {
    minProcedureStepsUsed: 0.9,
    minWarningsUsed: 1,
  },
};



