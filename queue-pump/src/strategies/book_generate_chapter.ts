/**
 * book_generate_chapter (Factory / ai_agent_jobs)
 *
 * Orchestrates section-by-section generation for a single chapter in a skeleton-first pipeline
 * (via book_generate_section subjobs), then chains the next chapter job.
 *
 * - Loads skeleton.json from Storage (to derive outline + section count)
 * - (Optional) Uses an LLM planner to decide where praktijk/verdieping boxes fit (outline-driven)
 * - Enqueues book_generate_section jobs sequentially and waits for completion
 * - Enqueues next chapter job until completion
 *
 * IMPORTANT:
 * - No silent fallbacks (fail loudly on missing required inputs/env)
 * - No image generation: only placeholder src keys + suggestedPrompt strings
 */
import type { JobContext, JobExecutor } from "./types.js";
import { createClient } from "@supabase/supabase-js";
import { emitAgentJobEvent } from "../job-events.js";
import { validateBookSkeleton, type BookSkeletonV1 } from "../bookSkeletonCore.js";
import { extractJsonFromText } from "../generation-utils.js";

type Provider = "openai" | "anthropic";
type ImagePromptLanguage = "en" | "book";

type AnthropicToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ChapterLayoutProfile = "auto" | "pass2" | "sparse";
type ChapterLayoutPlan = {
  praktijkSubparagraphTitles: string[];
  verdiepingSubparagraphTitles: string[];
  notes?: string | null;
};

type ChapterRecap = {
  objectives: Array<{ text: string; sectionId: string }>;
  glossary: Array<{ term: string; definition: string; sectionId: string }>;
  selfCheckQuestions: Array<{ question: string; sectionId: string }>;
};

type ChapterOutline = {
  chapterTitle?: string;
  sections: Array<{
    title: string;
    numberedSubparagraphTitles: string[];
  }>;
};

type ChapterOrchestratorYield = {
  yield: true;
  message: string;
  nextPayload: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

const TOOL_PLAN_CHAPTER_LAYOUT: AnthropicToolSpec = {
  name: "plan_chapter_layout",
  description:
    "Select where to place 'In de praktijk' and 'Verdieping' boxes for a Dutch MBO chapter, based on the outline titles. " +
    "Return only titles from the provided candidate list. Do not invent new titles.",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["praktijkSubparagraphTitles", "verdiepingSubparagraphTitles"],
    properties: {
      praktijkSubparagraphTitles: { type: "array", items: { type: "string" } },
      verdiepingSubparagraphTitles: { type: "array", items: { type: "string" } },
      notes: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  },
};

const TOOL_DRAFT_CHAPTER_RECAP: AnthropicToolSpec = {
  name: "draft_chapter_recap",
  description:
    "Draft high-quality learning objectives, a short glossary (with definitions), and self-check questions for a Dutch MBO chapter. " +
    "Use ONLY the provided chapter content summary and ONLY reference provided section IDs.",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["objectives", "glossary", "selfCheckQuestions"],
    properties: {
      objectives: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["text", "sectionId"],
          properties: {
            text: { type: "string" },
            sectionId: { type: "string" },
          },
        },
      },
      glossary: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["term", "definition", "sectionId"],
          properties: {
            term: { type: "string" },
            definition: { type: "string" },
            sectionId: { type: "string" },
          },
        },
      },
      selfCheckQuestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["question", "sectionId"],
          properties: {
            question: { type: "string" },
            sectionId: { type: "string" },
          },
        },
      },
    },
  },
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED`);
  }
  return v.trim();
}

function requireString(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${key} is REQUIRED`);
  }
  return v.trim();
}

function requireNumber(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`BLOCKED: ${key} is REQUIRED (number)`);
  }
  return v;
}

function optionalString(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], keyName: string): T {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || !allowed.includes(s as T)) {
    throw new Error(`BLOCKED: ${keyName} must be one of: ${allowed.join(", ")}`);
  }
  return s as T;
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  return allowed.includes(s as T) ? (s as T) : null;
}

function normalizeWs(s: string): string {
  // Remove invisible formatting characters that can leak from PDF/IDML sources
  // (e.g. WORD JOINER, zero-width spaces, soft hyphen) so outline/title matching is stable.
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberPrefix(title: string): string {
  return normalizeWs(title).replace(/^\d+(?:\.\d+)*\s+/, "").trim();
}

function normalizeLanguageLabel(code: string): string {
  const s = (code || "").trim().toLowerCase();
  if (!s) return "the book language";
  if (s === "nl" || s.startsWith("nl-")) return "Dutch";
  if (s === "en" || s.startsWith("en-")) return "English";
  if (s === "de" || s.startsWith("de-")) return "German";
  if (s === "fr" || s.startsWith("fr-")) return "French";
  if (s === "es" || s.startsWith("es-")) return "Spanish";
  return s;
}

function looksLikePlaceholderChapterTitle(title: string, chapterNumber: number): boolean {
  const t = normalizeWs(title).toLowerCase();
  return t === `hoofdstuk ${chapterNumber}` || t === `chapter ${chapterNumber}`;
}

function extractOutlineFromSkeletonChapter(chRaw: any, chapterNumber: number): ChapterOutline | null {
  if (!chRaw || typeof chRaw !== "object") return null;

  const chapterTitle = typeof chRaw.title === "string" ? normalizeWs(chRaw.title) : "";
  const lockChapterTitle = !!chapterTitle && !looksLikePlaceholderChapterTitle(chapterTitle, chapterNumber);

  const sectionsIn = Array.isArray(chRaw.sections) ? chRaw.sections : [];
  const sections = sectionsIn
    .filter((s: any) => s && typeof s === "object")
    .map((s: any) => {
      const title = typeof s.title === "string" ? normalizeWs(s.title) : "";
      const blocks = Array.isArray(s.blocks) ? s.blocks : [];
      const numberedSubparagraphTitles = blocks
        .filter((b: any) => b && typeof b === "object" && b.type === "subparagraph")
        .map((b: any) => (typeof b.title === "string" ? normalizeWs(b.title) : ""))
        .filter((t: string) => /^\d+(?:\.\d+){2,}\s+/.test(t));
      return { title, numberedSubparagraphTitles };
    })
    .filter((s: any) => !!s.title)
    .slice(0, 50);

  const hasSectionTitles = sections.length > 0;
  if (!lockChapterTitle && !hasSectionTitles) return null;

  return {
    ...(lockChapterTitle ? { chapterTitle } : {}),
    sections,
  };
}

function parseModelSpec(raw: string): { provider: Provider; model: string } {
  const s = raw.trim();
  const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) {
    throw new Error("BLOCKED: writeModel must be prefixed with provider (use 'openai:<model>' or 'anthropic:<model>')");
  }
  const provider = parts[0] as Provider;
  const model = parts.slice(1).join(":");
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error("BLOCKED: writeModel provider must be 'openai' or 'anthropic'");
  }
  if (!model) throw new Error("BLOCKED: writeModel model is missing");
  return { provider, model };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function llmGenerateJson(opts: {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  tool: AnthropicToolSpec;
}): Promise<any> {
  const { provider, model, system, prompt, maxTokens, tool } = opts;
  const timeoutMs = 220_000;

  if (provider === "openai") {
    const key = requireEnv("OPENAI_API_KEY");
    const resp = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: maxTokens,
        }),
      },
      timeoutMs,
    );
    const text = await resp.text();
    if (!resp.ok) throw new Error(`LLM(openai) failed: ${resp.status} ${text.slice(0, 400)}`);
    const data = JSON.parse(text);
    const out = data?.choices?.[0]?.message?.content;
    if (typeof out !== "string" || !out.trim()) throw new Error("LLM(openai) returned empty content");
    return extractJsonFromText(out);
  }

  const key = requireEnv("ANTHROPIC_API_KEY");
  const toolName = tool.name;
  const resp = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": key,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.3,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: toolName },
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    },
    timeoutMs,
  );
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(anthropic) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);

  const toolUse = (Array.isArray((data as any)?.content) ? (data as any).content : []).find(
    (b: any) => b?.type === "tool_use" && b?.name === toolName && b?.input && typeof b.input === "object",
  );
  if (toolUse?.input && typeof toolUse.input === "object") return toolUse.input;

  const out = (Array.isArray(data?.content) ? data.content : [])
    .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
    .map((b: any) => b.text)
    .join("\n");
  if (!out.trim()) throw new Error("LLM(anthropic) returned empty content");
  return extractJsonFromText(out);
}

async function downloadJson(supabase: any, bucket: string, path: string): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || `Failed to download ${bucket}/${path}`);
  const text = await data.text();
  return text ? JSON.parse(text) : null;
}

async function callEdgeAsAgent(opts: { orgId: string; path: string; body: unknown }) {
  const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${opts.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": opts.orgId,
    },
    body: JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `Edge call failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

function stripHtmlToText(raw: unknown): string {
  const s = String(raw || "")
    .replace(/<\s*br\b[^>]*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return normalizeWs(s);
}

function buildChapterDigest(opts: { chapter: any; maxCharsTotal?: number; maxCharsPerSection?: number }): string {
  const maxCharsTotal =
    typeof opts.maxCharsTotal === "number" && Number.isFinite(opts.maxCharsTotal) ? Math.max(4000, Math.floor(opts.maxCharsTotal)) : 40_000;
  const maxCharsPerSection =
    typeof opts.maxCharsPerSection === "number" && Number.isFinite(opts.maxCharsPerSection)
      ? Math.max(400, Math.floor(opts.maxCharsPerSection))
      : 1800;

  const chapter = opts.chapter && typeof opts.chapter === "object" ? opts.chapter : null;
  const sections = Array.isArray(chapter?.sections) ? chapter.sections : [];
  let out = "";

  const walkBlocks = (blocksRaw: any[], push: (line: string) => void) => {
    const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const t = typeof b.type === "string" ? b.type : "";
      if (t === "subparagraph") {
        const title = typeof b.title === "string" ? normalizeWs(b.title) : "";
        if (title) push(`- ${title}`);
        walkBlocks(Array.isArray(b.blocks) ? b.blocks : [], push);
        continue;
      }
      if (t === "paragraph") {
        const basis = stripHtmlToText((b as any).basisHtml);
        const praktijk = stripHtmlToText((b as any).praktijkHtml);
        const verdieping = stripHtmlToText((b as any).verdiepingHtml);
        if (basis) push(basis);
        if (praktijk) push(`[Praktijk] ${praktijk}`);
        if (verdieping) push(`[Verdieping] ${verdieping}`);
        continue;
      }
      if (t === "list" || t === "steps") {
        const items = Array.isArray((b as any).items) ? (b as any).items : [];
        const lines = items.map((x: any) => stripHtmlToText(x)).filter((x: string) => !!x);
        if (lines.length) push(lines.map((x: string) => `• ${x}`).join(" "));
        continue;
      }
    }
  };

  for (const s of sections) {
    if (out.length >= maxCharsTotal) break;
    if (!s || typeof s !== "object") continue;
    const sid = typeof (s as any).id === "string" ? String((s as any).id).trim() : "";
    const st = typeof (s as any).title === "string" ? normalizeWs((s as any).title) : "";
    if (!sid && !st) continue;

    let buf = "";
    const push = (line: string) => {
      const t = normalizeWs(line);
      if (!t) return;
      if (buf.length >= maxCharsPerSection) return;
      buf += (buf ? " " : "") + t;
    };
    walkBlocks(Array.isArray((s as any).blocks) ? (s as any).blocks : [], push);
    if (buf.length > maxCharsPerSection) buf = buf.slice(0, maxCharsPerSection).trim();

    out += `\n[${sid}] ${st}\n`;
    if (buf) out += `${buf}\n`;
  }

  if (out.length > maxCharsTotal) out = out.slice(0, maxCharsTotal).trim();
  return out.trim();
}

type ChapterRecapBudgets = {
  objectivesMin: number;
  objectivesMax: number;
  glossaryMin: number;
  glossaryMax: number;
  questionsMin: number;
  questionsMax: number;
  objectivesUniqueMin: number;
  glossaryUniqueMin: number;
  questionsUniqueMin: number;
};

function pickChapterRecapBudgets(sectionCount: number): ChapterRecapBudgets {
  const n = Math.max(1, Math.floor(sectionCount));
  const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(v)));
  const clampUniqueMin = (desiredLo: number, value: number) => {
    const lo = n >= desiredLo ? desiredLo : 1;
    return Math.min(n, Math.max(lo, value));
  };

  const objectivesMin = clampInt(Math.ceil(n * 0.45), 4, 20);
  const objectivesMax = clampInt(Math.ceil(n * 0.65), Math.max(6, objectivesMin), 28);
  const glossaryMin = clampInt(Math.ceil(n * 0.9), 10, 40);
  const glossaryMax = clampInt(Math.ceil(n * 1.25), Math.max(14, glossaryMin), 60);
  const questionsMin = clampInt(Math.ceil(n * 0.35), 4, 18);
  const questionsMax = clampInt(Math.ceil(n * 0.5), Math.max(6, questionsMin), 26);

  // Encourage broad coverage: require many distinct sectionId references.
  const objectivesUniqueMin = clampUniqueMin(3, Math.min(objectivesMin, 12));
  const glossaryUniqueMin = clampUniqueMin(4, Math.min(glossaryMin, 16));
  const questionsUniqueMin = clampUniqueMin(3, Math.min(questionsMin, 10));

  return {
    objectivesMin,
    objectivesMax,
    glossaryMin,
    glossaryMax,
    questionsMin,
    questionsMax,
    objectivesUniqueMin,
    glossaryUniqueMin,
    questionsUniqueMin,
  };
}

function validateChapterRecap(raw: any, allowedSectionIds: Set<string>, budgets: ChapterRecapBudgets): ChapterRecap {
  if (!raw || typeof raw !== "object") throw new Error("BLOCKED: Chapter recap must be a JSON object");

  const objectivesRaw = (raw as any).objectives;
  const glossaryRaw = (raw as any).glossary;
  const questionsRaw = (raw as any).selfCheckQuestions;

  const normalizeArr = (v: any, key: string) => {
    if (!Array.isArray(v) || v.length === 0) throw new Error(`BLOCKED: recap.${key} must be a non-empty array`);
    return v;
  };

  const objectivesIn = normalizeArr(objectivesRaw, "objectives");
  const glossaryIn = normalizeArr(glossaryRaw, "glossary");
  const questionsIn = normalizeArr(questionsRaw, "selfCheckQuestions");

  const enforceCount = (key: string, n: number, lo: number, hi: number) => {
    if (n < lo || n > hi) {
      throw new Error(`BLOCKED: recap.${key} must contain ${lo}..${hi} items (got=${n})`);
    }
  };
  enforceCount("objectives", objectivesIn.length, budgets.objectivesMin, budgets.objectivesMax);
  enforceCount("glossary", glossaryIn.length, budgets.glossaryMin, budgets.glossaryMax);
  enforceCount("selfCheckQuestions", questionsIn.length, budgets.questionsMin, budgets.questionsMax);

  const enforceUnique = (key: string, values: string[]) => {
    const seen = new Set<string>();
    for (const v of values) {
      const k = String(v || "").toLowerCase();
      if (!k) continue;
      if (seen.has(k)) throw new Error(`BLOCKED: recap.${key} contains duplicate values (must be unique)`);
      seen.add(k);
    }
  };

  const enforceUniqueSectionIds = (key: string, ids: string[], minUnique: number) => {
    const uniq = new Set(ids.filter(Boolean));
    if (uniq.size < minUnique) {
      throw new Error(`BLOCKED: recap.${key} references too few distinct sectionId values (got=${uniq.size}, min=${minUnique}). Spread across the chapter.`);
    }
  };

  const objectives = objectivesIn.map((it: any, i: number) => {
    if (!it || typeof it !== "object") throw new Error(`BLOCKED: objectives[${i}] must be an object`);
    const text = typeof it.text === "string" ? normalizeWs(it.text) : "";
    const sectionId = typeof it.sectionId === "string" ? String(it.sectionId).trim() : "";
    if (!text) throw new Error(`BLOCKED: objectives[${i}].text is required`);
    if (text.length < 16) throw new Error(`BLOCKED: objectives[${i}].text is too short`);
    if (text.length > 220) throw new Error(`BLOCKED: objectives[${i}].text is too long`);
    if (!sectionId) throw new Error(`BLOCKED: objectives[${i}].sectionId is required`);
    if (!allowedSectionIds.has(sectionId)) {
      throw new Error(`BLOCKED: objectives[${i}].sectionId '${sectionId}' is not a valid sectionId in this chapter`);
    }
    return { text, sectionId };
  });
  enforceUnique("objectives.text", objectives.map((o) => o.text));
  enforceUniqueSectionIds("objectives", objectives.map((o) => o.sectionId), budgets.objectivesUniqueMin);

  const glossary = glossaryIn.map((it: any, i: number) => {
    if (!it || typeof it !== "object") throw new Error(`BLOCKED: glossary[${i}] must be an object`);
    const term = typeof it.term === "string" ? normalizeWs(it.term) : "";
    const definition = typeof it.definition === "string" ? normalizeWs(it.definition) : "";
    const sectionId = typeof it.sectionId === "string" ? String(it.sectionId).trim() : "";
    if (!term) throw new Error(`BLOCKED: glossary[${i}].term is required`);
    if (term.length > 60) throw new Error(`BLOCKED: glossary[${i}].term is too long`);
    if (!definition) throw new Error(`BLOCKED: glossary[${i}].definition is required`);
    if (definition.length < 20) throw new Error(`BLOCKED: glossary[${i}].definition is too short`);
    if (definition.length > 420) throw new Error(`BLOCKED: glossary[${i}].definition is too long`);
    if (!sectionId) throw new Error(`BLOCKED: glossary[${i}].sectionId is required`);
    if (!allowedSectionIds.has(sectionId)) {
      throw new Error(`BLOCKED: glossary[${i}].sectionId '${sectionId}' is not a valid sectionId in this chapter`);
    }
    return { term, definition, sectionId };
  });
  enforceUnique("glossary.term", glossary.map((g) => g.term));
  enforceUniqueSectionIds("glossary", glossary.map((g) => g.sectionId), budgets.glossaryUniqueMin);

  const selfCheckQuestions = questionsIn.map((it: any, i: number) => {
    if (!it || typeof it !== "object") throw new Error(`BLOCKED: selfCheckQuestions[${i}] must be an object`);
    const question = typeof it.question === "string" ? normalizeWs(it.question) : "";
    const sectionId = typeof it.sectionId === "string" ? String(it.sectionId).trim() : "";
    if (!question) throw new Error(`BLOCKED: selfCheckQuestions[${i}].question is required`);
    if (question.length < 12) throw new Error(`BLOCKED: selfCheckQuestions[${i}].question is too short`);
    if (question.length > 260) throw new Error(`BLOCKED: selfCheckQuestions[${i}].question is too long`);
    if (!sectionId) throw new Error(`BLOCKED: selfCheckQuestions[${i}].sectionId is required`);
    if (!allowedSectionIds.has(sectionId)) {
      throw new Error(`BLOCKED: selfCheckQuestions[${i}].sectionId '${sectionId}' is not a valid sectionId in this chapter`);
    }
    return { question, sectionId };
  });
  enforceUnique("selfCheckQuestions.question", selfCheckQuestions.map((q) => q.question));
  enforceUniqueSectionIds("selfCheckQuestions", selfCheckQuestions.map((q) => q.sectionId), budgets.questionsUniqueMin);

  return { objectives, glossary, selfCheckQuestions };
}

function isRecapComplete(raw: any, allowedSectionIds: Set<string>, budgets: ChapterRecapBudgets): boolean {
  try {
    validateChapterRecap(raw, allowedSectionIds, budgets);
    return true;
  } catch {
    return false;
  }
}

function buildChapterRecapSystem(opts: { language: string; level: "n3" | "n4" }) {
  const langLabel = normalizeLanguageLabel(opts.language);
  return (
    "You are an expert textbook author for Dutch MBO education.\n" +
    "You will write the chapter recap components as a human author would:\n" +
    "- Learning objectives ('In dit hoofdstuk leer je')\n" +
    "- A short glossary with concise definitions\n" +
    "- Self-check questions ('Controleer jezelf')\n" +
    "Return JSON only.\n" +
    `Book language: ${opts.language} (${langLabel})\n` +
    `Level: ${opts.level}\n\n` +
    "Hard rules:\n" +
    "- Use ONLY the provided chapter digest (do not invent topics that aren't present).\n" +
    "- Every item MUST reference a valid sectionId from the provided list.\n" +
    "- No markdown. No extra commentary.\n"
  );
}

function buildChapterRecapPrompt(opts: {
  bookTitle: string;
  topic: string;
  chapterNumber: number;
  chapterTitle: string;
  sectionRefs: Array<{ id: string; title: string }>;
  digest: string;
  budgets: ChapterRecapBudgets;
  userInstructions?: string | null;
}): string {
  const sectionList = opts.sectionRefs.map((s) => `- ${s.id}: ${s.title}`).join("\n");
  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  "objectives": [{ "text": string, "sectionId": string }],\n' +
    '  "glossary": [{ "term": string, "definition": string, "sectionId": string }],\n' +
    '  "selfCheckQuestions": [{ "question": string, "sectionId": string }]\n' +
    "}\n\n" +
    `Book title: ${opts.bookTitle}\n` +
    `Topic: ${opts.topic}\n` +
    `Chapter: ${opts.chapterNumber} — ${opts.chapterTitle}\n` +
    (opts.userInstructions ? `User instructions:\n${opts.userInstructions}\n\n` : "") +
    "Valid section IDs (choose sectionId ONLY from this list):\n" +
    sectionList +
    "\n\nRequirements:\n" +
    `- objectives: ${opts.budgets.objectivesMin}–${opts.budgets.objectivesMax} bullets, each starts with 'Je kunt ...' (Dutch), concrete and chapter-specific.\n` +
    `  - Spread across the chapter: use at least ${opts.budgets.objectivesUniqueMin} different sectionId values.\n` +
    `- glossary: ${opts.budgets.glossaryMin}–${opts.budgets.glossaryMax} items. Term is short; definition is 1–2 sentences, clear for MBO students.\n` +
    `  - Spread across the chapter: use at least ${opts.budgets.glossaryUniqueMin} different sectionId values.\n` +
    `- selfCheckQuestions: ${opts.budgets.questionsMin}–${opts.budgets.questionsMax} items. Mix definitions + application. Avoid nonsensical comparisons.\n` +
    `  - Spread across the chapter: use at least ${opts.budgets.questionsUniqueMin} different sectionId values.\n` +
    "- IMPORTANT: Do NOT only cover the first 1–2 sections. Cover the chapter broadly.\n" +
    "\nChapter digest (content summary):\n" +
    opts.digest +
    "\n"
  );
}

function buildRecapSectionIdSequence(opts: {
  sectionRefs: Array<{ id: string }>;
  itemCount: number;
  minUnique: number;
}): string[] {
  const itemCount = Math.max(0, Math.floor(opts.itemCount || 0));
  const ids = Array.isArray(opts.sectionRefs)
    ? opts.sectionRefs.map((s) => String(s.id || "").trim()).filter((x) => !!x)
    : [];
  if (!ids.length || itemCount <= 0) return [];
  const uniq = Array.from(new Set(ids));
  const uniqueTarget = Math.min(uniq.length, Math.max(1, Math.min(itemCount, Math.floor(opts.minUnique || 1))));
  const base = uniq.slice(0, uniqueTarget);
  const sequence: string[] = [];
  while (sequence.length < itemCount) {
    for (const id of base) {
      if (sequence.length >= itemCount) break;
      sequence.push(id);
    }
    if (sequence.length >= itemCount) break;
    for (const id of uniq) {
      if (sequence.length >= itemCount) break;
      sequence.push(id);
    }
  }
  return sequence.slice(0, itemCount);
}

function buildChapterRecapRepairPrompt(opts: {
  bookTitle: string;
  topic: string;
  chapterNumber: number;
  chapterTitle: string;
  digest: string;
  userInstructions?: string | null;
  objectiveIds: string[];
  glossaryIds: string[];
  questionIds: string[];
}): string {
  const list = (label: string, ids: string[]) =>
    `${label} (length=${ids.length}):\n` + ids.map((id, i) => `${i + 1}. ${id}`).join("\n");
  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  "objectives": [{ "text": string, "sectionId": string }],\n' +
    '  "glossary": [{ "term": string, "definition": string, "sectionId": string }],\n' +
    '  "selfCheckQuestions": [{ "question": string, "sectionId": string }]\n' +
    "}\n\n" +
    `Book title: ${opts.bookTitle}\n` +
    `Topic: ${opts.topic}\n` +
    `Chapter: ${opts.chapterNumber} — ${opts.chapterTitle}\n` +
    (opts.userInstructions ? `User instructions:\n${opts.userInstructions}\n\n` : "") +
    "Use these exact sectionId sequences (each item MUST use the matching sectionId in order):\n" +
    list("objectives.sectionId sequence", opts.objectiveIds) +
    "\n\n" +
    list("glossary.sectionId sequence", opts.glossaryIds) +
    "\n\n" +
    list("selfCheckQuestions.sectionId sequence", opts.questionIds) +
    "\n\n" +
    "Requirements:\n" +
    "- The number of items MUST match the sequence length for each array.\n" +
    "- Each item i MUST use sectionId = sequence[i].\n" +
    "- Use ONLY the chapter digest; do NOT invent new topics.\n" +
    "- No markdown. Return JSON only.\n" +
    "\nChapter digest (content summary):\n" +
    opts.digest +
    "\n"
  );
}

function pickLayoutBudgets(profile: ChapterLayoutProfile, candidateCount: number): {
  praktijkRange: [number, number];
  verdiepingRange: [number, number];
} {
  const n = Math.max(0, Math.floor(candidateCount));
  if (n === 0) return { praktijkRange: [0, 0], verdiepingRange: [0, 0] };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const range = (lo: number, hi: number) => [clamp(lo, 0, n), clamp(hi, 0, n)] as [number, number];

  if (profile === "pass2") {
    return {
      praktijkRange: range(Math.ceil(n * 0.35), Math.ceil(n * 0.6)),
      verdiepingRange: range(Math.max(2, Math.ceil(n * 0.1)), Math.min(8, Math.ceil(n * 0.2))),
    };
  }
  if (profile === "sparse") {
    return {
      praktijkRange: range(Math.min(2, Math.ceil(n * 0.1)), Math.ceil(n * 0.2)),
      verdiepingRange: range(Math.min(1, Math.ceil(n * 0.03)), Math.ceil(n * 0.08)),
    };
  }
  // auto
  return {
    praktijkRange: range(Math.max(2, Math.ceil(n * 0.2)), Math.ceil(n * 0.35)),
    verdiepingRange: range(Math.max(1, Math.ceil(n * 0.06)), Math.ceil(n * 0.12)),
  };
}

function buildLayoutPlannerSystem(opts: { language: string; level: "n3" | "n4" }) {
  const langLabel = normalizeLanguageLabel(opts.language);
  return (
    "You are planning the layout for a Dutch MBO textbook chapter BEFORE writing.\n" +
    "Your job is ONLY to decide where 'In de praktijk' and 'Verdieping' boxes belong, based on the outline titles.\n" +
    "Return JSON only.\n" +
    `Book language: ${opts.language} (${langLabel})\n` +
    `Level: ${opts.level}\n` +
    "\nRules:\n" +
    "- Praktijk boxes: choose titles where a realistic care/workplace scenario clearly fits.\n" +
    "- Verdieping boxes: choose titles that are relatively more complex (mechanisms, reasoning, nuance).\n" +
    "- Not every title needs a box. Avoid forced/generic placements.\n" +
    "- Spread selections across the chapter (avoid clustering everything into one section).\n" +
    "- NEVER invent new titles. Only select from the provided candidate list.\n"
  );
}

function buildLayoutPlannerPrompt(opts: {
  bookTitle: string;
  topic: string;
  outline: ChapterOutline;
  profile: ChapterLayoutProfile;
}): string {
  const candidates: Array<{ sectionTitle: string; subTitle: string }> = [];
  for (const s of opts.outline.sections) {
    const subs = Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles : [];
    for (const subTitle of subs) {
      if (typeof subTitle !== "string" || !subTitle.trim()) continue;
      candidates.push({ sectionTitle: s.title, subTitle: subTitle.trim() });
    }
  }

  const budgets = pickLayoutBudgets(opts.profile, candidates.length);
  const candidateText = candidates.length
    ? candidates.map((c, i) => `${i + 1}. [${c.sectionTitle}] ${c.subTitle}`).join("\n")
    : "(none)";

  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  "praktijkSubparagraphTitles": string[],\n' +
    '  "verdiepingSubparagraphTitles": string[],\n' +
    '  "notes"?: string\n' +
    "}\n\n" +
    `Book title: ${opts.bookTitle}\n` +
    `Topic: ${opts.topic}\n` +
    `Profile: ${opts.profile}\n` +
    `Targets (soft guidance):\n` +
    `- praktijk range: ${budgets.praktijkRange[0]}..${budgets.praktijkRange[1]}\n` +
    `- verdieping range: ${budgets.verdiepingRange[0]}..${budgets.verdiepingRange[1]}\n\n` +
    "Candidate numbered subparagraph titles (select from these ONLY):\n" +
    candidateText +
    "\n\nGuidance:\n" +
    "- Pick praktijk titles that naturally map to care/work situations.\n" +
    "- Pick verdieping titles that benefit from a deeper mechanism or nuance.\n" +
    "- If a box would be generic or forced, do NOT select that title.\n"
  );
}

function sanitizeLayoutPlan(raw: any, outline: ChapterOutline): ChapterLayoutPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const allowed = new Set<string>();
  for (const s of outline.sections) {
    for (const t of (Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles : [])) {
      if (typeof t === "string" && t.trim()) allowed.add(normalizeWs(t));
    }
  }
  const take = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      const t = typeof x === "string" ? normalizeWs(x) : "";
      if (!t) continue;
      if (!allowed.has(t)) continue;
      if (!out.includes(t)) out.push(t);
    }
    return out;
  };
  return {
    praktijkSubparagraphTitles: take((raw as any).praktijkSubparagraphTitles),
    verdiepingSubparagraphTitles: take((raw as any).verdiepingSubparagraphTitles),
    notes: typeof (raw as any).notes === "string" ? String((raw as any).notes).trim().slice(0, 500) : null,
  };
}

function ensureMinimumBoxSelections(opts: {
  outline: ChapterOutline;
  layoutPlan: ChapterLayoutPlan | null;
  profile: ChapterLayoutProfile;
}): ChapterLayoutPlan | null {
  const titles: string[] = [];
  for (const s of opts.outline.sections) {
    for (const t of (Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles : [])) {
      const tt = typeof t === "string" ? normalizeWs(t) : "";
      if (tt) titles.push(tt);
    }
  }
  if (!titles.length) return opts.layoutPlan;

  const uniq = (arr: string[]) => {
    const out: string[] = [];
    for (const t of arr) {
      const tt = normalizeWs(t);
      if (!tt) continue;
      if (!out.includes(tt)) out.push(tt);
    }
    return out;
  };

  const plan: ChapterLayoutPlan = opts.layoutPlan
    ? {
      praktijkSubparagraphTitles: uniq(opts.layoutPlan.praktijkSubparagraphTitles),
      verdiepingSubparagraphTitles: uniq(opts.layoutPlan.verdiepingSubparagraphTitles),
      notes: typeof opts.layoutPlan.notes === "string" ? opts.layoutPlan.notes : null,
    }
    : { praktijkSubparagraphTitles: [], verdiepingSubparagraphTitles: [], notes: null };

  // Avoid overlaps (prefer keeping praktijk)
  plan.verdiepingSubparagraphTitles = plan.verdiepingSubparagraphTitles.filter((t) => !plan.praktijkSubparagraphTitles.includes(t));

  const pick = (preferredIndex: number, avoid: Set<string>): string | null => {
    const n = titles.length;
    const start = Math.max(0, Math.min(n - 1, Math.floor(preferredIndex)));
    for (let delta = 0; delta < n; delta++) {
      for (const idx of [start + delta, start - delta]) {
        if (idx < 0 || idx >= n) continue;
        const t = titles[idx];
        if (!t) continue;
        if (avoid.has(t)) continue;
        return t;
      }
    }
    return null;
  };

  const used = new Set<string>([...plan.praktijkSubparagraphTitles, ...plan.verdiepingSubparagraphTitles]);

  // Hard requirement for this system: ensure at least one praktijk + one verdieping across the chapter.
  // (The section generator enforces presence when targets are provided.)
  if (plan.praktijkSubparagraphTitles.length === 0) {
    const t = pick(Math.floor(titles.length / 3), used);
    if (t) {
      plan.praktijkSubparagraphTitles.push(t);
      used.add(t);
    }
  }
  if (plan.verdiepingSubparagraphTitles.length === 0) {
    const t = pick(Math.floor((titles.length * 2) / 3), used);
    if (t) {
      plan.verdiepingSubparagraphTitles.push(t);
      used.add(t);
    }
  }

  return plan;
}

async function planChapterLayout(opts: {
  provider: Provider;
  model: string;
  bookTitle: string;
  topic: string;
  language: string;
  level: "n3" | "n4";
  outline: ChapterOutline;
  profile: ChapterLayoutProfile;
}): Promise<ChapterLayoutPlan | null> {
  const candidatesCount = opts.outline.sections.reduce(
    (sum, s) => sum + (Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles.length : 0),
    0,
  );
  if (candidatesCount <= 0) return null;
  const system = buildLayoutPlannerSystem({ language: opts.language, level: opts.level });
  const prompt = buildLayoutPlannerPrompt({
    bookTitle: opts.bookTitle,
    topic: opts.topic,
    outline: opts.outline,
    profile: opts.profile,
  });
  const raw = await llmGenerateJson({
    provider: opts.provider,
    model: opts.model,
    system,
    prompt,
    maxTokens: 1200,
    tool: TOOL_PLAN_CHAPTER_LAYOUT,
  });
  return sanitizeLayoutPlan(raw, opts.outline);
}

function pickTargetsForSection(opts: {
  outline: ChapterOutline | null;
  layoutPlan: ChapterLayoutPlan | null;
  sectionIndex: number;
}): { praktijkTargets: string[]; verdiepingTargets: string[] } {
  const section = opts.outline?.sections?.[opts.sectionIndex];
  const allowed = new Set<string>(
    Array.isArray(section?.numberedSubparagraphTitles)
      ? section.numberedSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean)
      : [],
  );
  // If the outline for this section is extremely large, do not enforce box placement targets.
  // Those targets become brittle and often cause validation failures for long lists (e.g. 19 titles).
  if (allowed.size > 10) {
    return { praktijkTargets: [], verdiepingTargets: [] };
  }
  const take = (arr: string[]): string[] => {
    const out: string[] = [];
    for (const t of arr) {
      const tt = normalizeWs(t);
      if (!tt) continue;
      if (!allowed.has(tt)) continue;
      if (!out.includes(tt)) out.push(tt);
    }
    return out;
  };
  return {
    praktijkTargets: opts.layoutPlan ? take(opts.layoutPlan.praktijkSubparagraphTitles) : [],
    verdiepingTargets: opts.layoutPlan ? take(opts.layoutPlan.verdiepingSubparagraphTitles) : [],
  };
}

export class BookGenerateChapter implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { payload, jobId } = context;
    const p = (payload || {}) as Record<string, unknown>;

    const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const organizationId = requireString(p, "organization_id");
    const bookId = requireString(p, "bookId");
    const bookVersionId = requireString(p, "bookVersionId");
    const chapterIndexRaw = requireNumber(p, "chapterIndex");
    const chapterCountRaw = requireNumber(p, "chapterCount");
    const chapterIndex = Math.floor(chapterIndexRaw);
    const chapterCount = Math.floor(chapterCountRaw);
    if (chapterIndexRaw !== chapterIndex || chapterCountRaw !== chapterCount) {
      throw new Error("BLOCKED: chapterIndex and chapterCount must be integers");
    }
    if (chapterCount < 1 || chapterCount > 50) {
      throw new Error("BLOCKED: chapterCount must be between 1 and 50");
    }
    if (chapterIndex < 0) throw new Error("BLOCKED: chapterIndex must be >= 0");
    if (chapterIndex >= chapterCount) throw new Error(`BLOCKED: chapterIndex out of range (${chapterIndex} >= ${chapterCount})`);

    const topic = requireString(p, "topic");
    const language = requireString(p, "language");
    const level = requireEnum(p.level, ["n3", "n4"] as const, "level");
    const userInstructions = optionalString(p, "userInstructions");

    const imagePromptLanguage: ImagePromptLanguage =
      optionalEnum(p.imagePromptLanguage, ["en", "book"] as const) ?? "en";
    const layoutProfile: ChapterLayoutProfile =
      optionalEnum((p as any).layoutProfile, ["auto", "pass2", "sparse"] as const) ?? "auto";
    const microheadingDensity =
      optionalEnum((p as any).microheadingDensity, ["low", "medium", "high"] as const);

    const writeModel = requireString(p, "writeModel");
    const writeModelSpec = parseModelSpec(writeModel);

    const recapModelRaw = optionalString(p, "recapModel");
    const recapModel = recapModelRaw ? recapModelRaw : writeModel;
    const recapModelSpec = parseModelSpec(recapModel);

    await emitAgentJobEvent(jobId, "generating", 5, `Orchestrating chapter ${chapterIndex + 1}/${chapterCount}`, {
      bookId,
      bookVersionId,
      chapterIndex,
      writeModel: `${writeModelSpec.provider}:${writeModelSpec.model}`,
      recapModel: `${recapModelSpec.provider}:${recapModelSpec.model}`,
      layoutProfile,
    }).catch(() => {});

    // Orchestrator state (persisted via yield/requeue in ai-job-runner)
    const nowIso = new Date().toISOString();
    const orchestratorStartedAt =
      typeof (p as any).orchestratorStartedAt === "string" && String((p as any).orchestratorStartedAt).trim()
        ? String((p as any).orchestratorStartedAt).trim()
        : nowIso;
    // Progress-based timeout (back-compat):
    // Previously we enforced a total chapter wall-time of 45 minutes, which is too aggressive when the
    // system is driving jobs via cron and section jobs can stall/retry. We now enforce:
    // - MAX_IDLE_MS: no "meaningful progress" for N minutes => fail loud
    // - MAX_WALL_MS: absolute cap for runaway loops (large, safety only)
    const orchestratorLastProgressAt =
      typeof (p as any).orchestratorLastProgressAt === "string" && String((p as any).orchestratorLastProgressAt).trim()
        ? String((p as any).orchestratorLastProgressAt).trim()
        : nowIso;
    const attemptsPrev =
      typeof (p as any).orchestratorAttempts === "number" && Number.isFinite((p as any).orchestratorAttempts)
        ? Math.max(0, Math.floor((p as any).orchestratorAttempts))
        : 0;
    const attempts = attemptsPrev + 1;
    // Track progress: if we haven't advanced nextSectionIndex in too many attempts, something is stuck.
    const lastAdvancedSectionIndex =
      typeof (p as any).lastAdvancedSectionIndex === "number" && Number.isFinite((p as any).lastAdvancedSectionIndex)
        ? Math.floor((p as any).lastAdvancedSectionIndex)
        : -1;
    const attemptsAtCurrentSection =
      typeof (p as any).attemptsAtCurrentSection === "number" && Number.isFinite((p as any).attemptsAtCurrentSection)
        ? Math.max(0, Math.floor((p as any).attemptsAtCurrentSection))
        : 0;
    
    // MAX_ATTEMPTS is a safety cap. In practice, we fail faster via MAX_ATTEMPTS_PER_SECTION.
    const MAX_ATTEMPTS = 600;
    const MAX_ATTEMPTS_PER_SECTION = 100; // If stuck on same section for 100 iterations, fail loudly
    
    if (attempts > MAX_ATTEMPTS) {
      throw new Error(`BLOCKED: Chapter orchestrator exceeded max attempts (${MAX_ATTEMPTS}). Human review required.`);
    }
    
    const startedAtMs = Date.parse(orchestratorStartedAt);
    if (Number.isFinite(startedAtMs)) {
      const elapsedMs = Date.now() - startedAtMs;
      const MAX_WALL_MS = 12 * 60 * 60 * 1000;
      if (elapsedMs > MAX_WALL_MS) {
        throw new Error("BLOCKED: Chapter orchestrator exceeded max wall time (12 hours). Human review required.");
      }
    }
    const lastProgressAtMs = Date.parse(orchestratorLastProgressAt);
    if (Number.isFinite(lastProgressAtMs)) {
      const idleMs = Date.now() - lastProgressAtMs;
      const MAX_IDLE_MS = 3 * 60 * 60 * 1000;
      if (idleMs > MAX_IDLE_MS) {
        throw new Error("BLOCKED: Chapter orchestrator exceeded max idle time (3 hours). Human review required.");
      }
    }

    const nextSectionIndexPrev =
      typeof (p as any).nextSectionIndex === "number" && Number.isFinite((p as any).nextSectionIndex)
        ? Math.max(0, Math.floor((p as any).nextSectionIndex))
        : 0;
    const pendingSectionJobId =
      typeof (p as any).pendingSectionJobId === "string" ? String((p as any).pendingSectionJobId).trim() : "";
    const pendingSectionIndex =
      typeof (p as any).pendingSectionIndex === "number" && Number.isFinite((p as any).pendingSectionIndex)
        ? Math.max(0, Math.floor((p as any).pendingSectionIndex))
        : null;

    // If we've been stuck at the same section for too many attempts, fail with a specific error.
    //
    // IMPORTANT: When a section job is already enqueued and we are waiting on it, the orchestrator can be
    // executed frequently (multiple workers, fast polling). Counting those as "stuck attempts" is brittle
    // and can fail a chapter while the section job is still legitimately retrying.
    //
    // Therefore: only enforce this cap when we're NOT currently waiting on a pending section job.
    const isWaitingOnSectionJob = !!pendingSectionJobId;
    if (!isWaitingOnSectionJob && attemptsAtCurrentSection >= MAX_ATTEMPTS_PER_SECTION) {
      const stuckSection = lastAdvancedSectionIndex + 1;
      throw new Error(
        `BLOCKED: Chapter orchestrator stuck at section ${stuckSection} for ${attemptsAtCurrentSection} attempts. ` +
          `Check section job status and reset via: npx tsx scripts/books/fix-stuck-pipeline.ts <bookVersionId>`,
      );
    }

    // 1) Load skeleton (for section count + outline)
    const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
    const skRaw = await downloadJson(adminSupabase, "books", skeletonPath);
    const v0 = validateBookSkeleton(skRaw);
    if (!v0.ok) throw new Error(`BLOCKED: Existing skeleton is invalid (${v0.issues.length} issue(s))`);
    const sk: BookSkeletonV1 = v0.skeleton;
    const chapters = Array.isArray((sk as any).chapters) ? (sk as any).chapters : [];
    const existingChapter = chapters[chapterIndex] as any;
    if (!existingChapter) throw new Error(`BLOCKED: Skeleton missing chapter at index ${chapterIndex}`);
    const sectionCount = Array.isArray(existingChapter?.sections) ? existingChapter.sections.length : 0;
    if (sectionCount <= 0) throw new Error("BLOCKED: Skeleton chapter has no sections; cannot run sectioned generation.");
    const outline = extractOutlineFromSkeletonChapter(existingChapter, chapterIndex + 1);

    // 2) Layout planning (once): stored in payload so we don't re-plan every tick.
    let layoutPlan: ChapterLayoutPlan | null = null;
    if (outline && Array.isArray(outline.sections) && outline.sections.length) {
      if ((p as any).layoutPlan && typeof (p as any).layoutPlan === "object") {
        layoutPlan = sanitizeLayoutPlan((p as any).layoutPlan, outline);
      }
      if (!layoutPlan) {
        await emitAgentJobEvent(jobId, "generating", 15, "Planning layout (praktijk/verdieping)", { layoutProfile }).catch(() => {});
        const { data: bookRow, error: bookErr } = await adminSupabase.from("books").select("title").eq("id", bookId).single();
        if (bookErr || !bookRow) throw new Error(bookErr?.message || "Book not found");
        const bookTitle = String((bookRow as any).title || "").trim();
        try {
          layoutPlan = await planChapterLayout({
            provider: writeModelSpec.provider,
            model: writeModelSpec.model,
            bookTitle,
            topic,
            language,
            level,
            outline,
            profile: layoutProfile,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await emitAgentJobEvent(jobId, "generating", 18, "Layout plan failed (continuing without plan)", {
            layoutProfile,
            error: msg.slice(0, 600),
          }).catch(() => {});
          layoutPlan = null;
        }
      }
    }

    if (outline && Array.isArray(outline.sections) && outline.sections.length) {
      const before = layoutPlan;
      layoutPlan = ensureMinimumBoxSelections({ outline, layoutPlan, profile: layoutProfile });
      const addedPraktijk = (before?.praktijkSubparagraphTitles?.length || 0) === 0 && (layoutPlan?.praktijkSubparagraphTitles?.length || 0) > 0;
      const addedVerd = (before?.verdiepingSubparagraphTitles?.length || 0) === 0 && (layoutPlan?.verdiepingSubparagraphTitles?.length || 0) > 0;
      if (addedPraktijk || addedVerd) {
        await emitAgentJobEvent(jobId, "generating", 19, "Layout plan augmented to ensure praktijk/verdieping coverage", {
          addedPraktijk,
          addedVerdieping: addedVerd,
        }).catch(() => {});
      }
    }

    // Progress tracking: check if we've advanced from the last tracked section.
    // When we are waiting on an existing pending section job, do NOT increment attemptsAtCurrentSection
    // (it can cause false "stuck" failures while the section job is still running/retrying).
    const currentSectionTarget = nextSectionIndexPrev;
    const hasAdvanced = currentSectionTarget > lastAdvancedSectionIndex;
    const isWaitingOnSectionJobForProgress = !!pendingSectionJobId;
    const nextAttemptsAtCurrentSection = isWaitingOnSectionJobForProgress ? attemptsAtCurrentSection : hasAdvanced ? 1 : attemptsAtCurrentSection + 1;
    const nextLastAdvancedSectionIndex = hasAdvanced ? currentSectionTarget : lastAdvancedSectionIndex;
    
    const baseNextPayload: Record<string, unknown> = {
      bookId,
      bookVersionId,
      chapterIndex,
      chapterCount,
      topic,
      level,
      language,
      userInstructions,
      imagePromptLanguage,
      layoutProfile,
      ...(microheadingDensity ? { microheadingDensity } : {}),
      writeModel,
      recapModel,
      orchestratorStartedAt,
      orchestratorLastProgressAt,
      orchestratorAttempts: attempts,
      nextSectionIndex: nextSectionIndexPrev,
      // Progress tracking to detect stuck sections
      lastAdvancedSectionIndex: nextLastAdvancedSectionIndex,
      attemptsAtCurrentSection: nextAttemptsAtCurrentSection,
      ...(layoutPlan ? { layoutPlan } : {}),
      ...(typeof p.sectionMaxTokens === "number" && Number.isFinite(p.sectionMaxTokens) ? { sectionMaxTokens: Math.floor(p.sectionMaxTokens) } : {}),
    };

    // 3) Waiting on a section job?
    if (pendingSectionJobId) {
      const { data: secJob, error: secErr } = await adminSupabase
        .from("ai_agent_jobs")
        .select("id,status,error,retry_count,max_retries")
        .eq("id", pendingSectionJobId)
        .maybeSingle();
      if (secErr) throw new Error(`BLOCKED: Failed to load pending section job: ${secErr.message}`);
      if (!secJob?.id) throw new Error("BLOCKED: Pending section job not found");
      const st = String((secJob as any).status || "");
      if (st === "failed") {
        const errMsg = typeof (secJob as any).error === "string" ? String((secJob as any).error) : "Unknown error";
        const retryCountRaw = (secJob as any).retry_count;
        const maxRetriesRaw = (secJob as any).max_retries;
        const retryCount = typeof retryCountRaw === "number" && Number.isFinite(retryCountRaw) ? Math.max(0, Math.floor(retryCountRaw)) : 0;
        const maxRetries = typeof maxRetriesRaw === "number" && Number.isFinite(maxRetriesRaw) ? Math.max(0, Math.floor(maxRetriesRaw)) : 3;
        // IMPORTANT: ai_agent_jobs has built-in retry semantics (get_next_pending_agent_job retries failed jobs
        // while retry_count < max_retries). If a section job failed but is still retriable, we should wait
        // instead of failing the whole chapter orchestrator.
        if (retryCount < maxRetries) {
          return {
            yield: true,
            message: `Waiting for section job ${pendingSectionJobId} (status=failed, retrying)`,
            nextPayload: {
              ...baseNextPayload,
              pendingSectionJobId,
              ...(typeof pendingSectionIndex === "number" ? { pendingSectionIndex } : {}),
            },
            meta: { pendingSectionJobId, status: "failed", retryCount, maxRetries, error: errMsg.slice(0, 300) },
          } satisfies ChapterOrchestratorYield;
        }
        throw new Error(`BLOCKED: Section job failed (${pendingSectionJobId}): ${errMsg}`);
      }
      if (st !== "done") {
        return {
          yield: true,
          message: `Waiting for section job ${pendingSectionJobId} (status=${st})`,
          nextPayload: {
            ...baseNextPayload,
            pendingSectionJobId,
            ...(typeof pendingSectionIndex === "number" ? { pendingSectionIndex } : {}),
          },
          meta: { pendingSectionJobId, status: st },
        } satisfies ChapterOrchestratorYield;
      }

      const nextSectionIndex =
        typeof pendingSectionIndex === "number" ? pendingSectionIndex + 1 : nextSectionIndexPrev + 1;
      return {
        yield: true,
        message: `Section ${nextSectionIndexPrev + 1}/${sectionCount} complete; advancing`,
        nextPayload: {
          ...baseNextPayload,
          orchestratorLastProgressAt: nowIso,
          nextSectionIndex,
          pendingSectionJobId: null,
          pendingSectionIndex: null,
        },
        meta: { nextSectionIndex, sectionCount },
      } satisfies ChapterOrchestratorYield;
    }

    // 4) All sections done -> chain next chapter / finish
    if (nextSectionIndexPrev >= sectionCount) {
      // 4a) Chapter recap: LLM-authored learning objectives + glossary + self-check questions.
      // Persist into skeleton chapter.recap so rendering uses authored content (no heuristic fallback).
      const sectionsIn = Array.isArray(existingChapter?.sections) ? existingChapter.sections : [];
      const allowedSectionIds = new Set<string>(
        sectionsIn
          .map((s: any) => (typeof s?.id === "string" ? String(s.id).trim() : ""))
          .filter((x: string) => !!x),
      );

      if (!allowedSectionIds.size) {
        throw new Error("BLOCKED: Chapter has no section ids; cannot generate recap");
      }

      const recapBudgets = pickChapterRecapBudgets(allowedSectionIds.size);

      if (!isRecapComplete((existingChapter as any)?.recap, allowedSectionIds, recapBudgets)) {
        await emitAgentJobEvent(jobId, "generating", 70, "Generating chapter recap (objectives / glossary / self-check)", {
          bookId,
          bookVersionId,
          chapterIndex,
          recapModel: `${recapModelSpec.provider}:${recapModelSpec.model}`,
        }).catch(() => {});

        const { data: bookRow, error: bookErr } = await adminSupabase.from("books").select("title").eq("id", bookId).single();
        if (bookErr || !bookRow) throw new Error(bookErr?.message || "Book not found");
        const bookTitle = String((bookRow as any).title || "").trim();

        const chapterTitle = typeof (existingChapter as any).title === "string" ? normalizeWs((existingChapter as any).title) : "";
        const sectionRefs = sectionsIn
          .map((s: any) => ({
            id: typeof s?.id === "string" ? String(s.id).trim() : "",
            title: typeof s?.title === "string" ? normalizeWs(s.title) : "",
          }))
          .filter((s: any) => !!s.id);

        const digest = buildChapterDigest({ chapter: existingChapter, maxCharsTotal: 40_000, maxCharsPerSection: 1800 });
        if (!digest) throw new Error("BLOCKED: Chapter digest is empty; cannot generate recap");

        const system = buildChapterRecapSystem({ language, level });
        let lastErr = "";
        let recap: ChapterRecap | null = null;
        const MAX_ATTEMPTS_RECAP = 3;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS_RECAP; attempt++) {
          const prompt =
            buildChapterRecapPrompt({
              bookTitle,
              topic,
              chapterNumber: chapterIndex + 1,
              chapterTitle: chapterTitle || `Hoofdstuk ${chapterIndex + 1}`,
              sectionRefs,
              digest,
              budgets: recapBudgets,
              userInstructions,
            }) +
            (lastErr
              ? `\n\nVALIDATION ERROR (attempt ${attempt - 1}/${MAX_ATTEMPTS_RECAP}):\n${lastErr}\nFix the JSON and try again.\n`
              : "");
          try {
            const raw = await llmGenerateJson({
              provider: recapModelSpec.provider,
              model: recapModelSpec.model,
              system,
              prompt,
              maxTokens: 3200,
              tool: TOOL_DRAFT_CHAPTER_RECAP,
            });
            recap = validateChapterRecap(raw, allowedSectionIds, recapBudgets);
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            lastErr = msg.slice(0, 1600);
            recap = null;
          }
        }
        if (!recap) {
          await emitAgentJobEvent(jobId, "generating", 72, "Recap validation failed; attempting targeted repair", {
            chapterIndex,
            recapModel: `${recapModelSpec.provider}:${recapModelSpec.model}`,
            lastErr: lastErr.slice(0, 300),
          }).catch(() => {});

          const objectiveIds = buildRecapSectionIdSequence({
            sectionRefs,
            itemCount: recapBudgets.objectivesMin,
            minUnique: recapBudgets.objectivesUniqueMin,
          });
          const glossaryIds = buildRecapSectionIdSequence({
            sectionRefs,
            itemCount: recapBudgets.glossaryMin,
            minUnique: recapBudgets.glossaryUniqueMin,
          });
          const questionIds = buildRecapSectionIdSequence({
            sectionRefs,
            itemCount: recapBudgets.questionsMin,
            minUnique: recapBudgets.questionsUniqueMin,
          });

          if (objectiveIds.length && glossaryIds.length && questionIds.length) {
            const repairPrompt = buildChapterRecapRepairPrompt({
              bookTitle,
              topic,
              chapterNumber: chapterIndex + 1,
              chapterTitle: chapterTitle || `Hoofdstuk ${chapterIndex + 1}`,
              digest,
              userInstructions,
              objectiveIds,
              glossaryIds,
              questionIds,
            });
            try {
              const raw = await llmGenerateJson({
                provider: recapModelSpec.provider,
                model: recapModelSpec.model,
                system,
                prompt: repairPrompt,
                maxTokens: 3200,
                tool: TOOL_DRAFT_CHAPTER_RECAP,
              });
              recap = validateChapterRecap(raw, allowedSectionIds, recapBudgets);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              lastErr = msg.slice(0, 1600);
              recap = null;
            }
          }
        }
        if (!recap) {
          throw new Error(`BLOCKED: Chapter recap generation failed after ${MAX_ATTEMPTS_RECAP} attempts: ${lastErr || "unknown error"}`);
        }

        // Persist recap to skeleton and compile canonical via book-version-save-skeleton.
        (existingChapter as any).recap = recap;
        (sk as any).chapters[chapterIndex] = existingChapter;
        const v1 = validateBookSkeleton(sk);
        if (!v1.ok) throw new Error(`BLOCKED: Updated skeleton validation failed (${v1.issues.length} issue(s))`);

        await emitAgentJobEvent(jobId, "storage_write", 78, "Saving chapter recap to skeleton", {
          bookId,
          bookVersionId,
          chapterIndex,
        }).catch(() => {});

        const saveRes = await callEdgeAsAgent({
          orgId: organizationId,
          path: "book-version-save-skeleton",
          body: {
            bookId,
            bookVersionId,
            skeleton: v1.skeleton,
            note: `BookGen Pro recap: ch${chapterIndex + 1}`,
            compileCanonical: true,
          },
        });
        if (saveRes?.ok !== true) throw new Error("Failed to save chapter recap");
      }

      if (chapterIndex < chapterCount - 1) {
        // BookGen control plane: allow operators to pause/cancel chaining between chapters.
        const { data: control, error: ctrlErr } = await adminSupabase
          .from("bookgen_controls")
          .select("paused,cancelled,note,updated_at")
          .eq("book_id", bookId)
          .eq("book_version_id", bookVersionId)
          .maybeSingle();

        if (ctrlErr) {
          throw new Error(
            `BLOCKED: Failed to read bookgen_controls (${ctrlErr.message}). Apply migration 20260105130000_bookgen_controls.sql.`,
          );
        }

        if ((control as any)?.cancelled === true) {
          await emitAgentJobEvent(jobId, "done", 100, "Book generation cancelled (next chapter not queued)", {
            bookId,
            bookVersionId,
            chapterIndex,
            control: {
              cancelled: true,
              paused: (control as any)?.paused === true,
              note: (control as any)?.note ?? null,
              updated_at: (control as any)?.updated_at ?? null,
            },
          }).catch(() => {});
          return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, cancelled: true };
        }

        if ((control as any)?.paused === true) {
          await emitAgentJobEvent(jobId, "done", 100, "Book generation paused (next chapter not queued)", {
            bookId,
            bookVersionId,
            chapterIndex,
            control: {
              paused: true,
              note: (control as any)?.note ?? null,
              updated_at: (control as any)?.updated_at ?? null,
            },
          }).catch(() => {});
          return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, paused: true };
        }

        const nextIndex = chapterIndex + 1;
        await emitAgentJobEvent(jobId, "generating", 75, "Enqueuing next chapter job", { nextIndex }).catch(() => {});
        const { data: queued, error: enqueueErr } = await adminSupabase
          .from("ai_agent_jobs")
          .insert({
            organization_id: organizationId,
            job_type: "book_generate_chapter",
            status: "queued",
            // BookGen needs more retries than the default because section jobs can be marked stalled
            // by the reconciler due to upstream/provider hiccups.
            max_retries: 10,
            payload: {
              bookId,
              bookVersionId,
              chapterIndex: nextIndex,
              chapterCount,
              topic,
              level,
              language,
              userInstructions,
              imagePromptLanguage,
              layoutProfile,
              ...(microheadingDensity ? { microheadingDensity } : {}),
              writeModel,
              recapModel,
              ...(typeof p.sectionMaxTokens === "number" && Number.isFinite(p.sectionMaxTokens) ? { sectionMaxTokens: Math.floor(p.sectionMaxTokens) } : {}),
            },
          })
          .select("id")
          .single();
        if (enqueueErr || !queued?.id) throw new Error(enqueueErr?.message || "Failed to enqueue next chapter job");
        await emitAgentJobEvent(jobId, "done", 100, "Chapter complete (next queued)", {
          bookId,
          bookVersionId,
          chapterIndex,
          nextChapterJobId: queued.id,
        }).catch(() => {});
        return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, nextChapterJobId: queued.id };
      }

      await emitAgentJobEvent(jobId, "done", 100, "Book generation complete (all chapters generated)", {
        bookId,
        bookVersionId,
        chapterCount,
      }).catch(() => {});
      return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, done: true };
    }

    // 5) Enqueue next section job and yield
    const sectionIndexToRun = nextSectionIndexPrev;
    const targets = pickTargetsForSection({ outline, layoutPlan, sectionIndex: sectionIndexToRun });
    const sectionPayload: Record<string, unknown> = {
      bookId,
      bookVersionId,
      chapterIndex,
      sectionIndex: sectionIndexToRun,
      topic,
      level,
      language,
      userInstructions,
      imagePromptLanguage,
      layoutProfile,
      ...(microheadingDensity ? { microheadingDensity } : {}),
      writeModel,
      // Ensure each chapter has at least one image placeholder in the skeleton.
      // We only hard-require it for the first section to avoid over-producing images.
      requireImageSuggestion: sectionIndexToRun === 0,
      ...(typeof p.sectionMaxTokens === "number" && Number.isFinite(p.sectionMaxTokens) ? { sectionMaxTokens: Math.floor(p.sectionMaxTokens) } : {}),
      ...(targets.praktijkTargets.length ? { praktijkTargets: targets.praktijkTargets } : {}),
      ...(targets.verdiepingTargets.length ? { verdiepingTargets: targets.verdiepingTargets } : {}),
    };
    const { data: queuedSection, error: enqueueSectionErr } = await adminSupabase
      .from("ai_agent_jobs")
      .insert({
        organization_id: organizationId,
        job_type: "book_generate_section",
        status: "queued",
        max_retries: 10,
        payload: sectionPayload,
      })
      .select("id")
      .single();
    if (enqueueSectionErr || !queuedSection?.id) throw new Error(enqueueSectionErr?.message || "Failed to enqueue section job");

    await emitAgentJobEvent(jobId, "generating", 40, "Section job queued", {
      sectionIndex: sectionIndexToRun,
      sectionJobId: queuedSection.id,
    }).catch(() => {});

    return {
      yield: true,
      message: `Enqueued section job ${queuedSection.id} (section ${sectionIndexToRun + 1}/${sectionCount})`,
      nextPayload: {
        ...baseNextPayload,
        orchestratorLastProgressAt: nowIso,
        pendingSectionJobId: queuedSection.id,
        pendingSectionIndex: sectionIndexToRun,
      },
      meta: { pendingSectionJobId: queuedSection.id, pendingSectionIndex: sectionIndexToRun },
    } satisfies ChapterOrchestratorYield;
  }
}
