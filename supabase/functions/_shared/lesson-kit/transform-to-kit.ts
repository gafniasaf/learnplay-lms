/**
 * Transform to Kit (Pass 2)
 *
 * Uses a constrained LLM to transform ground truth into a lesson kit.
 * The model may ONLY use content from the ground truth.
 *
 * Ported from Teacherbuddy (material-mindmap-forge) but adapted for LearnPlay:
 * - Uses the shared provider abstraction in `supabase/functions/_shared/ai.ts`
 * - NO silent fallback kits on LLM failures (fail loud per IgniteZero policy)
 */

import type { GroundTruth, LessonKit, LessonKitProtocol } from "./types.ts";
import { getProtocol, selectProtocol } from "./protocol-registry.ts";
import { generateJson } from "../ai.ts";

interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

function tryParseJsonLoose(raw: string): unknown | null {
  const t0 = raw.trim();
  const stripFences = (s: string) =>
    s
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

  const base = stripFences(t0);
  const candidates: string[] = [];
  candidates.push(base);

  // If the model continued from a "{" prefix (Anthropic prefill), the response may be missing the opening brace.
  if (base && !base.startsWith("{") && base.includes("}")) {
    candidates.push(`{${base}`);
  }

  const firstBrace = base.indexOf("{");
  const lastBrace = base.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(base.slice(firstBrace, lastBrace + 1));
  }

  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c);
    } catch {
      // keep trying
    }
  }
  return null;
}

async function callLLM(systemPrompt: string, userPrompt: string, options: LLMCallOptions = {}): Promise<unknown> {
  const { temperature = 0.3, maxTokens = 4000, timeoutMs = 110000 } = options;

  const prompts = [
    userPrompt,
    `${userPrompt}\n\nSTRICT OUTPUT REQUIREMENT:\nReturn ONLY a single valid JSON object.\n- No markdown fences\n- No leading/trailing commentary\n- Double quotes only\n- No trailing commas`,
  ];

  let lastRaw = "";
  for (let attempt = 0; attempt < prompts.length; attempt++) {
    const res = await generateJson({
      system: systemPrompt,
      prompt: prompts[attempt],
      temperature: attempt === 0 ? temperature : 0,
      maxTokens,
      timeoutMs,
    });

    if (!res.ok) {
      if (res.error === "no_provider") {
        throw new Error("BLOCKED: No LLM provider configured. Set OPENAI_API_KEY (or ANTHROPIC_API_KEY / AZURE_OPENAI_API_KEY).");
      }
      throw new Error(`LLM call failed: ${res.error}`);
    }

    lastRaw = typeof res.text === "string" ? res.text : "";
    const parsed = tryParseJsonLoose(lastRaw);
    if (parsed !== null) return parsed;
  }

  const snippet = lastRaw.trim().slice(0, 500);
  throw new Error(`LLM returned invalid JSON (expected json_object). Snippet: ${snippet}`);
}

/**
 * Deterministic scaffold kit used ONLY when `skipLLM=true` is explicitly requested.
 * This is not used as a fallback for failures.
 */
function createSkipLLMKit(gt: GroundTruth, protocolId: string): Partial<LessonKit> {
  return {
    version: "1.0",
    moduleId: gt.moduleId,
    protocolUsed: protocolId,
    groundTruthHash: gt.sourceHash,

    quickStart: {
      oneLiner: `In deze les behandelen we ${gt.title}.`,
      keyConcepts: gt.keyConcepts.slice(0, 3).map((c) => c.text),
      check: "Vraag studenten om de kernpunten samen te vatten.",
      timeAllocation: { start: 10, kern: 25, afsluiting: 10 },
    },

    teacherScript: [
      {
        time: "0:00",
        phase: "start",
        action: "OPEN",
        content: `Welkom bij de les over ${gt.title}.`,
        isGrounded: false,
      },
      ...(gt.keyConcepts.slice(0, 2).map((c, i) => ({
        time: `${10 + i * 5}:00`,
        phase: "kern" as const,
        action: "INTRODUCTIE" as const,
        content: c.text,
        isGrounded: true,
        sourceRef: `keyConcepts[${i}]`,
      })) as any[]),
      {
        time: "35:00",
        phase: "afsluiting",
        action: "SAMENVATTING",
        content: "Samenvatting van de les.",
        isGrounded: false,
      },
    ],

    discussionQuestions: [],

    groupWork: {
      title: "Groepsopdracht",
      durationMinutes: 10,
      groupSize: 3,
      materials: [],
      steps: ["Bespreek de kernpunten", "Maak een samenvatting"],
      rubric: {},
    },

    studentHandout: {
      title: `${gt.title} - Werkblad`,
      exercises: [],
    },

    slideAssets: gt.mediaAssets.map((m, i) => ({
      slide: i + 1,
      title: m.caption || `Slide ${i + 1}`,
      imageUrl: m.type === "image" ? m.url : undefined,
      animationUrl: m.type === "animation" ? m.url : undefined,
    })),

    groundingScore: 0,
    coverageScore: 0,
    builtAt: new Date().toISOString(),
    needsReview: true,
    reviewReasons: ["skipLLM=true (deterministic scaffold kit)"],
  };
}

/**
 * Transform ground truth into a lesson kit using the LLM
 * This is Pass 2 of the pipeline
 */
export async function transformToKit(
  groundTruth: GroundTruth,
  protocolId?: string,
  options: { skipLLM?: boolean; logs?: string[] } = {},
): Promise<Partial<LessonKit>> {
  const logs = options.logs || [];

  // Select protocol
  const protocol: LessonKitProtocol = protocolId ? getProtocol(protocolId) : selectProtocol(groundTruth);

  logs.push(`Using protocol: ${protocol.id}`);

  // Explicit opt-in debug mode: return a deterministic scaffold kit
  if (options.skipLLM) {
    logs.push("skipLLM=true - returning deterministic scaffold kit (NOT a fallback)");
    return createSkipLLMKit(groundTruth, protocol.id);
  }

  // Build prompts from protocol
  const systemPrompt = protocol.getSystemPrompt();
  const userPrompt = protocol.buildTransformPrompt(groundTruth);

  logs.push("Calling LLM for transformation...");

  // Call LLM
  const rawResponse = await callLLM(systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 4000,
  });

  logs.push("LLM response received, post-processing...");

  // Post-process with protocol-specific logic
  const processedKit = protocol.postProcess(rawResponse as Partial<LessonKit>, groundTruth);

  // Add metadata
  return {
    ...processedKit,
    version: "1.0",
    moduleId: groundTruth.moduleId,
    protocolUsed: protocol.id,
    groundTruthHash: groundTruth.sourceHash,
    builtAt: new Date().toISOString(),
  };
}


