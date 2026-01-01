/**
 * Lesson Kit Protocol Registry
 *
 * Registry for different lesson kit generation strategies based on content type.
 * Protocols define how to extract, transform, and validate lesson kits.
 */

import type { GroundTruth, LessonKitProtocol } from "./types.ts";
import { proceduralProtocol } from "./protocols/procedural.ts";
import { communicationProtocol } from "./protocols/communication.ts";
import { theoryProtocol } from "./protocols/theory.ts";

// ============================================================
// PROTOCOL REGISTRY
// ============================================================

export const lessonKitProtocols: Record<string, LessonKitProtocol> = {
  procedural: proceduralProtocol,
  communication: communicationProtocol,
  theory: theoryProtocol,
};

/**
 * Get a protocol by ID
 */
export function getProtocol(id: string): LessonKitProtocol {
  const protocol = lessonKitProtocols[id];
  if (!protocol) {
    throw new Error(`Unknown lesson kit protocol: ${id}`);
  }
  return protocol;
}

/**
 * Auto-select the best protocol based on ground truth content
 */
export function selectProtocol(groundTruth: GroundTruth): LessonKitProtocol {
  let best: { protocol: LessonKitProtocol; score: number } = {
    protocol: lessonKitProtocols.theory, // Default fallback (deterministic)
    score: 0,
  };

  for (const [_id, protocol] of Object.entries(lessonKitProtocols)) {
    const score = protocol.detectApplicability(groundTruth);
    if (score > best.score) {
      best = { protocol, score };
    }
  }

  return best.protocol;
}

/**
 * List all available protocols
 */
export function listProtocols(): Array<{ id: string; name: string; description: string }> {
  return Object.entries(lessonKitProtocols).map(([id, protocol]) => ({
    id,
    name: protocol.name,
    description: protocol.description,
  }));
}

// ============================================================
// CONTENT TYPE KEYWORDS (for detection)
// ============================================================

export const PROCEDURAL_KEYWORDS = [
  "stap",
  "procedure",
  "handeling",
  "verpleegtechnisch",
  "katheter",
  "inbrengen",
  "steriel",
  "wond",
  "injectie",
  "infuus",
  "meting",
  "controle",
];

export const COMMUNICATION_KEYWORDS = [
  "feedback",
  "gesprek",
  "communicatie",
  "correct",
  "niet correct",
  "ik-boodschap",
  "jij-boodschap",
  "luisteren",
  "motiveren",
  "slecht nieuws",
  "conflict",
];

export const THEORY_KEYWORDS = [
  "anatomie",
  "fysiologie",
  "pathologie",
  "aandoening",
  "ziekte",
  "symptomen",
  "oorzaak",
  "behandeling",
  "medicatie",
];

/**
 * Check if text contains keywords from a category
 */
export function countKeywordMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let count = 0;
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      count++;
    }
  }
  return count;
}



