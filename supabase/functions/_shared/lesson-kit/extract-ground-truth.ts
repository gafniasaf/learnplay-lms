/**
 * Ground Truth Extractor (Pass 1)
 *
 * Extracts structured ground truth from study text HTML.
 * This pass uses ZERO LLM - pure regex parsing.
 *
 * The extracted ground truth becomes the "source of truth" for the lesson kit.
 * All content in the final kit must be traceable back to this ground truth.
 */

import type {
  GroundTruth,
  KeyConcept,
  ProcedureStep,
  Warning,
  CorrectIncorrectPair,
  MediaAsset,
  SourceSpan,
  ExtractionRules,
} from "./types.ts";
import { lessonKitProtocols } from "./protocol-registry.ts";

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Create a hash of the content for change detection
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Strip HTML tags and normalize whitespace
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Create a source span for traceability
 */
function createSourceSpan(content: string, matchText: string, matchIndex: number): SourceSpan {
  const startOffset = matchIndex;
  const endOffset = matchIndex + matchText.length;

  // Create a short quote for display (max 100 chars)
  const quote = matchText.length > 100 ? matchText.slice(0, 97) + "..." : matchText;

  return {
    startOffset,
    endOffset,
    sourceQuote: quote,
  };
}

/**
 * Extract all matches for a pattern
 */
function extractAllMatches(content: string, pattern: RegExp): Array<{ match: RegExpMatchArray; index: number }> {
  const results: Array<{ match: RegExpMatchArray; index: number }> = [];
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
  );

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    results.push({ match, index: match.index });
  }

  return results;
}

// ============================================================
// EXTRACTION FUNCTIONS
// ============================================================

/**
 * Extract key concepts from content
 */
function extractKeyConcepts(content: string, rules: ExtractionRules): KeyConcept[] {
  const concepts: KeyConcept[] = [];
  const seen = new Set<string>();

  for (const pattern of rules.keyConceptPatterns) {
    for (const { match, index } of extractAllMatches(content, pattern)) {
      const text = stripHtml(match[1] || match[0]).trim();

      // Skip if too short, too long, or already seen
      if (text.length < 5 || text.length > 100) continue;
      if (seen.has(text.toLowerCase())) continue;

      seen.add(text.toLowerCase());
      concepts.push({
        text,
        source: createSourceSpan(content, match[0], index),
      });
    }
  }

  return concepts;
}

/**
 * Extract procedure steps from content
 */
function extractProcedures(content: string, rules: ExtractionRules): ProcedureStep[] {
  const procedures: ProcedureStep[] = [];
  const seen = new Set<string>();

  for (const pattern of rules.procedurePatterns) {
    for (const { match, index } of extractAllMatches(content, pattern)) {
      // Try to extract step number and instruction
      let stepNumber = 0;
      let instruction = "";

      if (match[1] && match[2]) {
        // Pattern with explicit step number
        stepNumber = parseInt(match[1]) || procedures.length + 1;
        instruction = stripHtml(match[2]).trim();
      } else if (match[1]) {
        // Single capture group (like <li>)
        stepNumber = procedures.length + 1;
        instruction = stripHtml(match[1]).trim();
      } else {
        continue;
      }

      // Skip if too short or already seen
      if (instruction.length < 10) continue;
      if (seen.has(instruction.toLowerCase())) continue;

      seen.add(instruction.toLowerCase());
      procedures.push({
        stepNumber,
        instruction,
        source: createSourceSpan(content, match[0], index),
      });
    }
  }

  // Sort by step number
  procedures.sort((a, b) => a.stepNumber - b.stepNumber);

  return procedures;
}

/**
 * Extract warnings from content
 */
function extractWarnings(content: string, rules: ExtractionRules): Warning[] {
  const warnings: Warning[] = [];
  const seen = new Set<string>();

  for (const pattern of rules.warningPatterns) {
    for (const { match, index } of extractAllMatches(content, pattern)) {
      const typeWord = (match[1] || "").toLowerCase();
      const text = stripHtml(match[2] || match[1] || match[0]).trim();

      // Skip if too short or already seen
      if (text.length < 10) continue;
      if (seen.has(text.toLowerCase())) continue;

      // Determine warning type
      let type: Warning["type"] = "belangrijk";
      if (typeWord.includes("let op")) type = "let_op";
      else if (typeWord.includes("tip")) type = "tip";
      else if (typeWord.includes("waarschuwing")) type = "waarschuwing";
      else if (typeWord.includes("aandacht")) type = "aandachtspunt";

      seen.add(text.toLowerCase());
      warnings.push({
        text,
        type,
        source: createSourceSpan(content, match[0], index),
      });
    }
  }

  return warnings;
}

/**
 * Extract correct/incorrect pairs from content
 */
function extractCorrectIncorrectPairs(content: string, _rules: ExtractionRules): CorrectIncorrectPair[] {
  const pairs: CorrectIncorrectPair[] = [];

  // Look for patterns like: Correct: '...' / Niet correct: '...'
  const combinedPattern =
    /(?:niet\s+correct|fout|verkeerd)[:\s]+['"]?([^'"<\n]{10,200})['"]?[\s\S]{0,100}(?:correct|goed|juist)[:\s]+['"]?([^'"<\n]{10,200})['"]?/gi;

  for (const { match, index } of extractAllMatches(content, combinedPattern)) {
    const wrong = stripHtml(match[1]).trim();
    const right = stripHtml(match[2]).trim();

    if (wrong.length >= 10 && right.length >= 10) {
      pairs.push({
        wrong,
        right,
        source: createSourceSpan(content, match[0], index),
      });
    }
  }

  // Also try reverse order: Correct: '...' / Niet correct: '...'
  const reversePattern =
    /(?:correct|goed|juist)[:\s]+['"]?([^'"<\n]{10,200})['"]?[\s\S]{0,100}(?:niet\s+correct|fout|verkeerd)[:\s]+['"]?([^'"<\n]{10,200})['"]?/gi;

  for (const { match, index } of extractAllMatches(content, reversePattern)) {
    const right = stripHtml(match[1]).trim();
    const wrong = stripHtml(match[2]).trim();

    // Avoid duplicates
    const isDupe = pairs.some((p) =>
      p.wrong.toLowerCase() === wrong.toLowerCase() ||
      p.right.toLowerCase() === right.toLowerCase()
    );

    if (!isDupe && wrong.length >= 10 && right.length >= 10) {
      pairs.push({
        wrong,
        right,
        source: createSourceSpan(content, match[0], index),
      });
    }
  }

  return pairs;
}

/**
 * Extract media assets from content
 */
function extractMediaAssets(content: string): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const seen = new Set<string>();

  // Images: <img src="...">
  const imgPattern = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  for (const { match, index } of extractAllMatches(content, imgPattern)) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);

    assets.push({
      type: "image",
      url,
      caption: match[2] || undefined,
      source: createSourceSpan(content, match[0], index),
    });
  }

  // Videos: [$video("...")]
  const videoPattern = /\[\$video\(["']([^"']+)["'][^\]]*\)\]/gi;
  for (const { match, index } of extractAllMatches(content, videoPattern)) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);

    assets.push({
      type: "video",
      url,
      source: createSourceSpan(content, match[0], index),
    });
  }

  // Animations: /media/animations/*.html
  const animPattern = /\/media\/animations\/[^\s"'<>]+\.html[^\s"'<>]*/gi;
  for (const { match, index } of extractAllMatches(content, animPattern)) {
    const url = match[0];
    if (seen.has(url)) continue;
    seen.add(url);

    assets.push({
      type: "animation",
      url,
      source: createSourceSpan(content, match[0], index),
    });
  }

  // Iframes
  const iframePattern = /<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  for (const { match, index } of extractAllMatches(content, iframePattern)) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);

    assets.push({
      type: "iframe",
      url,
      source: createSourceSpan(content, match[0], index),
    });
  }

  return assets;
}

/**
 * Extract title from content
 */
function extractTitle(content: string): string {
  // Try H1
  const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return stripHtml(h1Match[1]);

  // Try first H2
  const h2Match = content.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (h2Match) return stripHtml(h2Match[1]);

  // Try title tag
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return stripHtml(titleMatch[1]);

  return "Untitled Module";
}

// ============================================================
// MAIN EXTRACTION FUNCTION
// ============================================================

/**
 * Extract ground truth from study text HTML
 * This is Pass 1 of the pipeline - no LLM involved
 */
export function extractGroundTruth(moduleId: string, htmlContent: string, protocolId?: string): GroundTruth {
  // Get extraction rules (combine all protocols if not specified)
  let rules: ExtractionRules;

  if (protocolId && lessonKitProtocols[protocolId]) {
    rules = lessonKitProtocols[protocolId].extractionRules;
  } else {
    // Combine rules from all protocols
    rules = {
      keyConceptPatterns: Object.values(lessonKitProtocols).flatMap((p) => p.extractionRules.keyConceptPatterns),
      procedurePatterns: Object.values(lessonKitProtocols).flatMap((p) => p.extractionRules.procedurePatterns),
      warningPatterns: Object.values(lessonKitProtocols).flatMap((p) => p.extractionRules.warningPatterns),
      correctIncorrectPatterns: Object.values(lessonKitProtocols).flatMap((p) => p.extractionRules.correctIncorrectPatterns),
    };
  }

  // Extract all components
  const keyConcepts = extractKeyConcepts(htmlContent, rules);
  const procedures = extractProcedures(htmlContent, rules);
  const warnings = extractWarnings(htmlContent, rules);
  const correctIncorrectPairs = extractCorrectIncorrectPairs(htmlContent, rules);
  const mediaAssets = extractMediaAssets(htmlContent);

  // Get plain text for keyword matching
  const plainText = stripHtml(htmlContent);

  return {
    moduleId,
    sourceHash: hashContent(htmlContent),
    extractedAt: new Date().toISOString(),

    title: extractTitle(htmlContent),
    keyConcepts,
    procedures,
    warnings,
    correctIncorrectPairs,
    mediaAssets,

    plainText,
    wordCount: plainText.split(/\s+/).length,
    hasStepByStep: procedures.length >= 3,
    hasPairs: correctIncorrectPairs.length >= 2,
  };
}

/**
 * Validate that ground truth has enough content to generate a kit
 */
export function validateGroundTruth(
  gt: GroundTruth,
): { valid: boolean; reason?: string; suggestedProtocol?: string } {
  // Must have at least some content
  if (gt.wordCount < 100) {
    return { valid: false, reason: "Content too short (< 100 words)" };
  }

  // Must have at least 2 key concepts
  if (gt.keyConcepts.length < 2) {
    return { valid: false, reason: "Too few key concepts extracted (< 2)" };
  }

  // Suggest protocol based on content
  let suggestedProtocol = "theory";
  if (gt.hasStepByStep) suggestedProtocol = "procedural";
  else if (gt.hasPairs) suggestedProtocol = "communication";

  return { valid: true, suggestedProtocol };
}



