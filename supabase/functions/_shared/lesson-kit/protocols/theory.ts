/**
 * Theory Protocol
 *
 * For theoretical/knowledge content (anatomy, pathology, pharmacology).
 * Focuses on: Key concepts, diagrams, tables, Q&A.
 */

import type {
  GroundTruth,
  LessonKit,
  LessonKitProtocol,
  ValidationResult,
  ExtractionRules,
} from "../types.ts";
import { THEORY_KEYWORDS, countKeywordMatches } from "../protocol-registry.ts";

// ============================================================
// EXTRACTION RULES
// ============================================================

const extractionRules: ExtractionRules = {
  keyConceptPatterns: [
    /<h[23][^>]*>([^<]{5,100})<\/h[23]>/gi,
    /<strong>([^<]{10,80})<\/strong>/gi,
    /(?:^|\n)\*\*([^*]{10,80})\*\*/gm,
    // Definition patterns
    /([A-Z][a-z]+(?:\s+[a-z]+){0,3})\s*(?:is|zijn|betekent)[:\s]+([^<\n]{10,150})/gi,
  ],
  procedurePatterns: [
    // Theory can have sequences too (e.g., disease progression)
    /fase\s*(\d+)[:\s]+([^<\n]{10,200})/gi,
    /stadium\s*(\d+)[:\s]+([^<\n]{10,200})/gi,
  ],
  warningPatterns: [
    /(let op|belangrijk|cave)[:\s]+([^<\n]{10,200})/gi,
    /(contra-indicatie|bijwerking)[:\s]+([^<\n]{10,200})/gi,
  ],
  correctIncorrectPatterns: [],
};

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `Je bent een expert in het maken van lesplannen voor theoretische vakken in de zorg.

Je taak is om een TEACHER SCRIPT te maken op basis van de gegeven GROUND_TRUTH.

STRIKTE REGELS:
1. Gebruik ALLEEN content uit GROUND_TRUTH
2. Maak van kernbegrippen VRAAG-acties ("Wie weet wat X betekent?")
3. Gebruik media assets (afbeeldingen, diagrammen) als visuele ondersteuning
4. Voeg GEEN nieuwe definities of feiten toe

DIDACTISCH PATROON:
- Activeer voorkennis met een vraag
- Introduceer begrip met visueel materiaal
- Laat studenten het begrip in eigen woorden uitleggen
- Check begrip met een toepassing

OUTPUT FORMAT:
- teacherScript met items die time, phase, action, content, sourceRef bevatten
- Acties: OPEN, VRAAG, INTRODUCTIE, OEFENING, CHECK, SAMENVATTING
- Phases: start, kern, afsluiting`;

// ============================================================
// USER PROMPT BUILDER
// ============================================================

function buildTransformPrompt(gt: GroundTruth): string {
  return `Maak een teacher script voor deze theoretische module.

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
      procedures:
        gt.procedures.length > 0
          ? gt.procedures.map((p, i) => ({
              index: i,
              step: p.stepNumber,
              instruction: p.instruction,
            }))
          : undefined,
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
      wordCount: gt.wordCount,
    },
    null,
    2,
  )}

VEREISTEN:
1. Elk kernbegrip wordt geïntroduceerd met een vraag of uitleg
2. Media assets worden gebruikt als visuele ondersteuning
3. Include sourceRef voor elke grounded item
4. Groepswerk: studenten maken samen een schema of samenvatting
5. De CHECK test of studenten begrippen kunnen toepassen

Geef output als JSON met deze structuur:
{
  "quickStart": {
    "oneLiner": "...",
    "keyConcepts": ["...", "...", "..."],
    "check": "...",
    "timeAllocation": { "start": 10, "kern": 25, "afsluiting": 10 }
  },
  "teacherScript": [...],
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

  // Check that key concepts are covered
  const conceptRefs = new Set(
    kit.teacherScript
      .filter((s) => s.sourceRef?.startsWith("keyConcepts["))
      .map((s) => s.sourceRef),
  );

  const conceptsUsed = conceptRefs.size;
  const totalConcepts = gt.keyConcepts.length;

  if (conceptsUsed < Math.min(3, totalConcepts) && totalConcepts > 0) {
    errors.push({
      field: "keyConcepts",
      message: `Slechts ${conceptsUsed}/${totalConcepts} kernbegrippen behandeld`,
      severity: "warning",
    });
  }

  // Check that media is referenced
  if (gt.mediaAssets.length > 0 && (!kit.slideAssets || kit.slideAssets.length === 0)) {
    errors.push({
      field: "slideAssets",
      message: "Media assets beschikbaar maar niet gebruikt in slides",
      severity: "warning",
    });
  }

  // Calculate grounding score
  const groundedItems = kit.teacherScript.filter((s) => s.isGrounded);
  const withSourceRef = groundedItems.filter((s) => s.sourceRef);
  const groundingScore = groundedItems.length > 0 ? withSourceRef.length / groundedItems.length : 1;

  // Calculate coverage score (concepts + media)
  const mediaUsed = kit.slideAssets?.filter((s) => s.imageUrl || s.animationUrl).length || 0;
  const totalRequired = gt.keyConcepts.length + gt.mediaAssets.length;
  const covered = conceptsUsed + mediaUsed;
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
  // Ensure slide assets include all media
  if (!rawKit.slideAssets || rawKit.slideAssets.length === 0) {
    rawKit.slideAssets = [
      {
        slide: 1,
        title: gt.title,
        bullets: gt.keyConcepts.slice(0, 4).map((c) => c.text),
      },
      ...gt.mediaAssets.map((m, i) => ({
        slide: i + 2,
        title: m.caption || `Afbeelding ${i + 1}`,
        imageUrl: m.type === "image" ? m.url : undefined,
        animationUrl: m.type === "animation" ? m.url : undefined,
      })),
    ];
  }

  // Add group work if not present
  if (!rawKit.groupWork) {
    rawKit.groupWork = {
      title: "Begrippen Schema",
      durationMinutes: 10,
      groupSize: 3,
      materials: ["Flip-over papier", "Stiften"],
      steps: [
        "Verdeel de kernbegrippen over de groepsleden",
        "Elk groepslid legt hun begrip uit aan de anderen",
        "Maak samen een schema dat de verbanden toont",
        "Presenteer kort aan de klas",
      ],
      rubric: {
        begrip: {
          voldoende: "Kan begrip noemen",
          goed: "Kan begrip uitleggen",
          excellent: "Kan begrip toepassen in casus",
        },
        samenwerking: {
          voldoende: "Werkt mee",
          goed: "Draagt actief bij",
          excellent: "Helpt anderen begrijpen",
        },
      },
    };
  }

  return rawKit;
}

// ============================================================
// PROTOCOL EXPORT
// ============================================================

export const theoryProtocol: LessonKitProtocol = {
  id: "theory",
  name: "Theory/Knowledge (Theorie)",
  description: "Voor theoretische content zoals anatomie, fysiologie, pathologie",

  detectApplicability(gt: GroundTruth): number {
    // This is the fallback protocol - score based on keywords and concepts
    const hasManyConcepts = gt.keyConcepts.length >= 3;
    const hasMedia = gt.mediaAssets.length >= 1;
    const keywordScore = countKeywordMatches(gt.plainText, THEORY_KEYWORDS) / THEORY_KEYWORDS.length;

    // If neither procedural nor communication patterns found, this is likely theory
    const noProcedures = gt.procedures.length < 2;
    const noPairs = gt.correctIncorrectPairs.length < 2;

    if (noProcedures && noPairs && hasManyConcepts) {
      return 0.7 + (keywordScore * 0.2);
    }

    return 0.3 + (keywordScore * 0.3) + (hasMedia ? 0.1 : 0);
  },

  extractionRules,

  buildTransformPrompt,
  getSystemPrompt: () => SYSTEM_PROMPT,

  postProcess,
  validate,

  coverageRequirements: {
    minConceptsUsed: 2,
  },
};



