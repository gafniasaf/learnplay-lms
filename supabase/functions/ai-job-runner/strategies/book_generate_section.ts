/**
 * book_generate_section (Factory / ai_agent_jobs)
 *
 * Generates content for a single SECTION within a chapter in a skeleton-first pipeline.
 *
 * - Loads skeleton.json from Storage
 * - Uses an LLM to draft section blocks (subparagraphs + paragraphs/lists/steps)
 * - Writes updates back to skeleton (authoring source of truth)
 * - Compiles deterministic canonical and uploads canonical.json (root path) for render worker stability
 *
 * IMPORTANT:
 * - No silent fallbacks (fail loudly on missing required inputs/env)
 * - No image generation: only placeholder src keys + suggestedPrompt strings
 */
import type { JobContext, JobExecutor } from "./types.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { compileSkeletonToCanonical, validateBookSkeleton, type BookSkeletonV1, type SkeletonImage } from "../../_shared/bookSkeletonCore.ts";
import { extractJsonFromText } from "../../_shared/generation-utils.ts";

type Provider = "openai" | "anthropic";
type ImagePromptLanguage = "en" | "book";
type ChapterLayoutProfile = "auto" | "pass2" | "sparse";
type MicroheadingDensity = "low" | "medium" | "high";

type DraftBlock =
  | {
      type: "paragraph";
      basisHtml: string;
      praktijkHtml?: string | null;
      verdiepingHtml?: string | null;
      images?: Array<{
        alt?: string | null;
        caption?: string | null;
        layoutHint?: string | null;
        suggestedPrompt?: string | null;
      }> | null;
    }
  | {
      type: "subparagraph";
      title: string;
      blocks: DraftBlock[];
    }
  | {
      type: "list";
      ordered?: boolean | null;
      items: string[];
      images?: Array<{
        alt?: string | null;
        caption?: string | null;
        layoutHint?: string | null;
        suggestedPrompt?: string | null;
      }> | null;
    }
  | {
      type: "steps";
      items: string[];
      images?: Array<{
        alt?: string | null;
        caption?: string | null;
        layoutHint?: string | null;
        suggestedPrompt?: string | null;
      }> | null;
    };

type DraftSection = {
  title: string;
  blocks: DraftBlock[];
};

type AnthropicToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const TOOL_DRAFT_BOOK_SECTION: AnthropicToolSpec = {
  name: "draft_book_section",
  description:
    "Return ONLY the section draft JSON object: { title, blocks }. " +
    "All HTML must be inline and stored in string fields (basisHtml/praktijkHtml/verdiepingHtml).",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["title", "blocks"],
    properties: {
      title: { type: "string" },
      blocks: { type: "array", items: { type: "object", additionalProperties: true } },
    },
  },
};

function buildDraftBookSectionToolSpec(requiredSubparagraphTitles: string[]): AnthropicToolSpec {
  const requiredCount = Array.isArray(requiredSubparagraphTitles) ? requiredSubparagraphTitles.length : 0;
  if (!requiredCount) return TOOL_DRAFT_BOOK_SECTION;

  const allowedTitles = Array.isArray(requiredSubparagraphTitles)
    ? requiredSubparagraphTitles.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()).slice(0, 40)
    : [];

  // For locked outlines, prevent the model from returning `blocks: []` (which repeatedly fails validation).
  // We keep the schema permissive for nested block shapes (additionalProperties=true), but enforce:
  // - top-level blocks exist
  // - count matches the locked outline count
  // - each top-level block is a subparagraph with a title + nested blocks
  return {
    name: TOOL_DRAFT_BOOK_SECTION.name,
    description:
      TOOL_DRAFT_BOOK_SECTION.description +
      ` Locked outline: blocks MUST contain exactly ${requiredCount} top-level subparagraph blocks.`,
    input_schema: {
      type: "object",
      additionalProperties: true,
      required: ["title", "blocks"],
      properties: {
        title: { type: "string" },
        blocks: {
          type: "array",
          minItems: requiredCount,
          maxItems: requiredCount,
          items: {
            type: "object",
            additionalProperties: true,
            required: ["type", "title", "blocks"],
            properties: {
              type: { type: "string", enum: ["subparagraph"] },
              // Prevent empty titles; constrain to the known locked-outline titles to avoid got=0 from blank/whitespace.
              title: allowedTitles.length ? { type: "string", enum: allowedTitles } : { type: "string", minLength: 1 },
              blocks: { type: "array", minItems: 1, items: { type: "object", additionalProperties: true } },
            },
          },
        },
      },
    },
  };
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
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

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], keyName: string): T {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || !allowed.includes(s as T)) {
    throw new Error(`BLOCKED: ${keyName} must be one of: ${allowed.join(", ")}`);
  }
  return s as T;
}

function optionalString(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  return allowed.includes(s as T) ? (s as T) : null;
}

function parseSparseUnderTitle(reason: string): string | null {
  const msg = String(reason || "");
  const m = msg.match(/Draft too sparse under '([^']+)'/);
  if (!m) return null;
  const t = normalizeWs(m[1] || "");
  return t ? t : null;
}

function parseMissingBoxTarget(
  reason: string,
): { kind: "praktijkHtml" | "verdiepingHtml"; title: string } | null {
  const msg = String(reason || "");
  const m = msg.match(/Missing (praktijkHtml|verdiepingHtml) for target numbered subparagraph '([^']+)'/);
  if (!m) return null;
  const kindRaw = String(m[1] || "").trim();
  const kind = kindRaw === "praktijkHtml" || kindRaw === "verdiepingHtml" ? (kindRaw as any) : null;
  if (!kind) return null;
  const title = normalizeWs(m[2] || "");
  if (!title) return null;
  return { kind, title };
}

function normalizeWs(s: string): string {
  // Remove invisible formatting characters that can leak from PDF/IDML sources
  // (e.g. WORD JOINER, zero-width spaces, soft hyphen) so outline matching is stable.
  return String(s || "")
    // Normalize to a compatibility form so comparisons are stable across sources.
    // This helps with things like ligatures/fullwidth chars that can appear in extracted text.
    .normalize("NFKC")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    // Normalize common typographic punctuation (PDF/IDML often uses curly quotes/dashes).
    .replace(/[\u2018\u2019\u201B\u02BC\uFF07]/g, "'") // ‘ ’ ‛ ʼ ＇ -> '
    .replace(/[\u201C\u201D\u2033\uFF02]/g, '"') // “ ” ″ ＂ -> "
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-") // hyphen variants -> -
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberPrefix(title: string): string {
  return normalizeWs(title).replace(/^\d+(?:\.\d+)*\s+/, "").trim();
}

function normalizeInlineHtml(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s;
}

function extractStrongTerms(raw: unknown): string[] {
  const s0 = typeof raw === "string" ? raw : "";
  if (!s0) return [];
  const out: string[] = [];
  const re = /<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s0))) {
    const innerRaw = String(m[2] || "");
    const inner = normalizeWs(innerRaw.replace(/<[^>]+>/g, " "));
    if (!inner) continue;
    const t = inner.replace(/^[\s,.;:!?()\[\]«»"']+/, "").replace(/[\s,.;:!?()\[\]«»"']+$/, "").trim();
    if (!t) continue;
    out.push(t);
  }
  return out;
}

function safeItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => !!x)
    .slice(0, 50);
}

function ensureBoxLeadSpan(raw: unknown, opts: { maxWords: number }): string | null {
  const s0 = typeof raw === "string" ? raw.trim() : "";
  if (!s0) return null;

  // Remove common placeholder token if a model copied examples literally.
  let s = s0.replace(/^(?:LEAD|Lead)\s+/u, "");
  const placeholderSpan = s.match(
    /^<\s*span\b[^>]*class\s*=\s*["'][^"']*box-lead[^"']*["'][^>]*>\s*(?:LEAD|Lead)\s*<\s*\/\s*span\s*>\s*(.*)$/i,
  );
  if (placeholderSpan) s = String(placeholderSpan[1] || "").trim();

  // Already has a lead span up front
  if (/^<\s*span\b[^>]*class\s*=\s*\"[^\"]*box-lead[^\"]*\"/i.test(s)) return s;
  if (/^<\s*span\b[^>]*class\s*=\s*'[^']*box-lead[^']*'/i.test(s)) return s;

  // Legacy: <strong>Lead:</strong> Rest...
  const mStrong = s.match(/^<\s*strong\s*>\s*([^<]{1,120}?)\s*:?\s*<\s*\/\s*strong\s*>\s*(.*)$/i);
  if (mStrong) {
    const lead = String(mStrong[1] || "").trim();
    const rest = String(mStrong[2] || "").trim();
    if (!lead) return s;
    return `<span class="box-lead">${lead}</span>${rest ? ` ${rest}` : ""}`;
  }

  // If the string starts with a tag we don't understand, avoid corrupting HTML.
  if (s.startsWith("<")) return s;

  const words = s.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const n = Math.max(1, Math.min(Math.floor(opts.maxWords || 2), words.length));
  const lead = words.slice(0, n).join(" ");
  const rest = words.slice(n).join(" ");
  return `<span class="box-lead">${lead}</span>${rest ? ` ${rest}` : ""}`;
}

function normalizeLanguageLabel(language: string): string {
  const s = language.trim().toLowerCase();
  if (s === "nl" || s.startsWith("nl-")) return "Dutch";
  if (s === "en" || s.startsWith("en-")) return "English";
  return language;
}

function parseModelSpec(raw: unknown): { provider: Provider; model: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) throw new Error("BLOCKED: writeModel is REQUIRED");
  const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) throw new Error("BLOCKED: writeModel must be prefixed with provider (use 'openai:<model>' or 'anthropic:<model>')");
  const provider = parts[0] as Provider;
  const model = parts.slice(1).join(":");
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error("BLOCKED: writeModel provider must be 'openai' or 'anthropic'");
  }
  if (!model) throw new Error("BLOCKED: writeModel model is missing");
  return { provider, model };
}

async function llmGenerateJson(opts: {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  tool?: AnthropicToolSpec;
}): Promise<any> {
  const { provider, model, system, prompt, maxTokens, tool } = opts;
  // IMPORTANT: Keep this comfortably below the Supabase Edge runtime limit so we can
  // abort/requeue instead of getting killed mid-request (which leaves jobs "processing"
  // until the reconciler marks them stalled).
  const timeoutMs = 120_000;

  if (provider === "openai") {
    const key = requireEnv("OPENAI_API_KEY");
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`LLM(openai) failed: ${resp.status} ${text.slice(0, 400)}`);
    const data = JSON.parse(text);
    const out = data?.choices?.[0]?.message?.content;
    if (typeof out !== "string" || !out.trim()) throw new Error("LLM(openai) returned empty content");
    return extractJsonFromText(out);
  }

  // anthropic
  const key = requireEnv("ANTHROPIC_API_KEY");
  const toolSpec = tool ? tool : TOOL_DRAFT_BOOK_SECTION;
  const toolName = toolSpec.name;
  const tools = [toolSpec];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      system,
      tools,
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(anthropic) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);

  const toolUse = (Array.isArray((data as any)?.content) ? (data as any).content : []).find(
    (b: any) => b?.type === "tool_use" && b?.name === toolName && b?.input && typeof b.input === "object",
  );
  if (toolUse?.input && typeof toolUse.input === "object") {
    return toolUse.input;
  }

  const out = (Array.isArray(data?.content) ? data.content : [])
    .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
    .map((b: any) => b.text)
    .join("\n");
  if (!out.trim()) throw new Error("LLM(anthropic) returned empty content");
  return extractJsonFromText(out);
}

function isAbortTimeout(err: unknown): boolean {
  const name =
    err && typeof err === "object" && "name" in err && typeof (err as any).name === "string"
      ? String((err as any).name)
      : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const s = `${name} ${msg}`.toLowerCase();
  return s.includes("abort") || s.includes("timeout") || s.includes("timed out");
}

async function downloadJson(supabase: any, bucket: string, path: string): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || `Failed to download ${bucket}/${path}`);
  const text = await data.text();
  return text ? JSON.parse(text) : null;
}

async function uploadJson(supabase: any, bucket: string, path: string, value: unknown, upsert: boolean) {
  const text = JSON.stringify(value, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert, contentType: "application/json" });
  if (error) throw new Error(error.message);
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

function renumberChapterImages(chapter: any, chapterNumber: number) {
  let counter = 0;
  const walkBlocks = (blocksRaw: any[]) => {
    const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "subparagraph") {
        walkBlocks(Array.isArray(b.blocks) ? b.blocks : []);
        continue;
      }
      const imgs = Array.isArray(b.images) ? b.images : [];
      for (const img of imgs) {
        if (!img || typeof img !== "object") continue;
        counter += 1;
        img.figureNumber = `${chapterNumber}.${counter}`;
      }
    }
  };
  const sections = Array.isArray(chapter?.sections) ? chapter.sections : [];
  for (const s of sections) {
    walkBlocks(Array.isArray(s?.blocks) ? s.blocks : []);
  }
}

function convertDraftBlocksToSkeletonSection(opts: {
  bookId: string;
  chapterIndex: number;
  sectionIndex: number;
  sectionId: string;
  sectionTitle: string;
  blocksIn: DraftBlock[];
}): any {
  const { bookId, chapterIndex, sectionIndex, sectionId, sectionTitle, blocksIn } = opts;
  const chNum = chapterIndex + 1;
  const sectionNumber = normalizeWs(sectionId);
  if (!sectionNumber) throw new Error("BLOCKED: sectionId is required");

  const numberedSectionTitle = normalizeWs(sectionTitle) || sectionNumber;
  const cleanSectionTitle = sectionTitle.replace(/^\d+(?:\.\d+)*\s+/, "").trim();

  const toImages = (imgsRaw: any[], blockKey: string): SkeletonImage[] | null => {
    if (!imgsRaw.length) return null;
    const safeKey = String(blockKey || "").replace(/[^a-z0-9_]+/gi, "_");
    return imgsRaw.slice(0, 6).map((img: any, ii: number) => {
      const src = `figures/${bookId}/ch${chNum}/img_${safeKey}_${ii + 1}.png`;
      return {
        src,
        alt: typeof img?.alt === "string" ? img.alt : null,
        caption: typeof img?.caption === "string" ? img.caption : null,
        // figureNumber is set later by renumberChapterImages()
        layoutHint: typeof img?.layoutHint === "string" ? img.layoutHint : null,
        suggestedPrompt: typeof img?.suggestedPrompt === "string" ? img.suggestedPrompt : null,
      };
    });
  };

  const convertBlock = (b: any, keyParts: number[]): any => {
    const t = typeof b?.type === "string" ? b.type : "";
    const key = keyParts.join("_");
    const blockId = `ch-${chNum}-b-${key}`;

    if (t === "subparagraph") {
      const title = typeof b?.title === "string" ? b.title.trim() : "";
      const mNum = title.match(/^(\d+(?:\.\d+){2,})\s+/);
      const numberedId = mNum ? String(mNum[1] || "").trim() : "";
      const innerIn = Array.isArray(b?.blocks) ? b.blocks : [];
      const innerBlocks = innerIn.slice(0, 20).map((ib: any, ii: number) => convertBlock(ib, keyParts.concat([ii + 1])));
      return {
        type: "subparagraph",
        ...(numberedId ? { id: numberedId } : {}),
        title,
        blocks: innerBlocks,
      };
    }

    if (t === "paragraph") {
      const imgsRaw = Array.isArray(b.images) ? b.images : [];
      const images = toImages(imgsRaw, key);
      const praktijkHtml = typeof b.praktijkHtml === "string" ? ensureBoxLeadSpan(normalizeInlineHtml(b.praktijkHtml), { maxWords: 3 }) : null;
      const verdiepingHtml = typeof b.verdiepingHtml === "string" ? ensureBoxLeadSpan(normalizeInlineHtml(b.verdiepingHtml), { maxWords: 5 }) : null;
      return {
        type: "paragraph",
        id: blockId,
        basisHtml: normalizeInlineHtml(b.basisHtml),
        ...(praktijkHtml ? { praktijkHtml } : {}),
        ...(verdiepingHtml ? { verdiepingHtml } : {}),
        ...(images ? { images } : {}),
      };
    }

    if (t === "list") {
      const imgsRaw = Array.isArray(b.images) ? b.images : [];
      const images = toImages(imgsRaw, key);
      return {
        type: "list",
        id: blockId,
        ordered: b.ordered === true,
        items: safeItems(b.items),
        ...(images ? { images } : {}),
      };
    }

    if (t === "steps") {
      const imgsRaw = Array.isArray(b.images) ? b.images : [];
      const images = toImages(imgsRaw, key);
      return {
        type: "steps",
        id: blockId,
        items: safeItems(b.items),
        ...(images ? { images } : {}),
      };
    }

    return { type: "paragraph", id: blockId, basisHtml: normalizeInlineHtml((b as any)?.basisHtml ?? "") };
  };

  const blocksRaw = (Array.isArray(blocksIn) ? blocksIn : []).slice(0, 40).map((b: any, bi: number) => convertBlock(b, [sectionIndex + 1, bi + 1]));

  const hasNumberedSubparagraph = blocksRaw.some((b: any) => {
    if (!b || typeof b !== "object") return false;
    if (b.type !== "subparagraph") return false;
    const t = typeof b.title === "string" ? b.title.trim() : "";
    return /^\d+(?:\.\d+){2,}\s+/.test(t);
  });

  let blocks: any[] = blocksRaw;
  if (!hasNumberedSubparagraph && blocksRaw.length) {
    const subNum = `${sectionNumber}.1`;
    const subTitle = `${subNum} ${cleanSectionTitle || "Inleiding"}`;
    blocks = [{
      type: "subparagraph",
      id: subNum,
      title: subTitle,
      blocks: blocksRaw,
    }];
  }

  return { id: sectionNumber, title: numberedSectionTitle, blocks };
}

function buildSystem(opts: {
  language: string;
  level: "n3" | "n4";
  imagePromptLanguage: ImagePromptLanguage;
  layoutProfile: ChapterLayoutProfile;
  microheadingDensity: MicroheadingDensity;
}) {
  const { language, level, imagePromptLanguage, layoutProfile, microheadingDensity } = opts;
  const langLabel = normalizeLanguageLabel(language);
  const imageLangLabel = imagePromptLanguage === "book" ? langLabel : "English";

  const depthGuidance =
    level === "n3"
      ? (
        "Depth policy (MBO N3): keep it practical and accessible.\n" +
        "- Avoid heavy theory-dumps.\n" +
        "- Do NOT introduce advanced equations/constants unless the topic truly requires it.\n"
      )
      : (
        "Depth policy (MBO N4): you may go slightly deeper, but stay teachable.\n" +
        "- You may include at most ONE simple formula OR named law if it helps learning.\n"
      );

  return (
    "You are BookGen Pro.\n" +
    "You write educational book sections as inline HTML strings (no <p> tags).\n" +
    "Allowed inline tags: <strong>, <em>, <b>, <i>, <sup>, <sub>, <span>, <br/>.\n" +
    "Output MUST be valid JSON ONLY (no markdown).\n" +
    "Write for MBO students: clear, concrete, and example-driven.\n" +
    "Use short sentences. Define terms the first time you use them.\n" +
    "Terminology emphasis (REQUIRED): wrap key terms (concepts, body parts, processes) in <strong> on first mention.\n" +
    `Layout profile: ${layoutProfile}\n` +
    `Microheading density: ${microheadingDensity}\n` +
    "- Do NOT include the labels 'In de praktijk:' or 'Verdieping:' in the text; the renderer adds them.\n" +
    "- For praktijk/verdieping: start with a short lead phrase wrapped as <span class=\"box-lead\">...</span>.\n" +
    depthGuidance +
    `Book language: ${language} (${langLabel})\n` +
    `Image suggestedPrompt language: ${imageLangLabel}\n`
  );
}

function buildPrompt(opts: {
  topic: string;
  bookTitle: string;
  chapterNumber: number;
  sectionNumber: string;
  sectionTitle: string;
  requiredSubparagraphTitles: string[];
  userInstructions?: string | null;
  language: string;
  imagePromptLanguage: ImagePromptLanguage;
  layoutProfile: ChapterLayoutProfile;
  microheadingDensity: MicroheadingDensity;
  requireImageSuggestion: boolean;
  praktijkTargets?: string[] | null;
  verdiepingTargets?: string[] | null;
}) {
  const langLabel = normalizeLanguageLabel(opts.language);
  const imageLangLabel = opts.imagePromptLanguage === "book" ? langLabel : "English";
  const required = opts.requiredSubparagraphTitles.map((t) => t.trim()).filter(Boolean);
  const isWideOutline = required.length >= 8;

  const targetsText =
    (opts.praktijkTargets && opts.praktijkTargets.length) || (opts.verdiepingTargets && opts.verdiepingTargets.length)
      ? (
        "\nLAYOUT PLAN (MUST FOLLOW):\n" +
        `- Praktijk targets (MUST include exactly one praktijkHtml paragraph inside EACH of these numbered subparagraph titles): ${
          opts.praktijkTargets && opts.praktijkTargets.length ? opts.praktijkTargets.join(" | ") : "(none)"
        }\n` +
        `- Verdieping targets (MUST include exactly one verdiepingHtml paragraph inside EACH of these numbered subparagraph titles): ${
          opts.verdiepingTargets && opts.verdiepingTargets.length ? opts.verdiepingTargets.join(" | ") : "(none)"
        }\n` +
        "Rules:\n" +
        "- Do NOT add praktijkHtml/verdiepingHtml outside the targets.\n" +
        "- Keep each box concrete and specific (no generic filler).\n\n"
      )
      : "";

  const requiredText = required.length ? required.join(" | ") : "(none)";
  const microRule =
    isWideOutline
      ? (opts.microheadingDensity === "high" ? "1-2" : "0-1")
      : (
        opts.layoutProfile === "pass2"
          ? (
            opts.microheadingDensity === "low"
              ? "1-2"
              : opts.microheadingDensity === "high"
                ? "3-4"
                : "2-3"
          )
          : opts.layoutProfile === "sparse"
            ? (
              opts.microheadingDensity === "high"
                ? "1-2"
                : "0-1"
            )
            : (
              opts.microheadingDensity === "low"
                ? "0-1"
                : opts.microheadingDensity === "high"
                  ? "2-3"
                  : "1-2"
            )
      );
  const paragraphRule =
    isWideOutline
      ? (opts.layoutProfile === "pass2" ? "2-3" : opts.layoutProfile === "sparse" ? "1-2" : "1-2")
      : (
        opts.layoutProfile === "pass2"
          ? "3-5"
          : opts.layoutProfile === "sparse"
            ? "1-2"
            : "2-4"
      );

  const imageRule = opts.requireImageSuggestion ? "1-2 (REQUIRED)" : "0-2";

  const outlineTemplate = (() => {
    if (!required.length) return "";

    // Give the LLM a concrete JSON template for locked outlines. This dramatically improves
    // compliance with required numbered subparagraphs and prevents "blocks: []" outputs.
    const q = (s: string) => JSON.stringify(String(s || ""));
    const lines = required
      .map((t, idx) => {
        const comma = idx < required.length - 1 ? "," : "";
        return (
          `  {\n` +
          `    "type": "subparagraph",\n` +
          `    "title": ${q(t)},\n` +
          `    "blocks": [\n` +
          `      {\n` +
          `        "type": "subparagraph",\n` +
          `        "title": "Voorbeeld microheading",\n` +
          `        "blocks": [\n` +
          `          { "type": "paragraph", "basisHtml": "..." },\n` +
          `          { "type": "paragraph", "basisHtml": "..." }\n` +
          `        ]\n` +
          `      }\n` +
          `    ]\n` +
          `  }${comma}`
        );
      })
      .join("\n");

    const note = isWideOutline
      ? (
        `\nWIDE OUTLINE NOTE:\n` +
        `- This section has ${required.length} required numbered subparagraphs. Keep each one concise.\n` +
        `- The validator requires at least 2 basis paragraphs per numbered subparagraph.\n`
      )
      : (
        `\nLOCKED OUTLINE NOTE:\n` +
        `- You MUST include every numbered subparagraph title exactly as listed (including the number) and in the same order.\n` +
        `- You MUST NOT return an empty "blocks" array.\n`
      );

    return (
      note +
      `\nSTRUCTURE TEMPLATE (copy the structure; replace every "..." with real text):\n` +
      `{\n` +
      `  "title": ${q(opts.sectionTitle)},\n` +
      `  "blocks": [\n` +
      lines +
      `\n  ]\n` +
      `}\n`
    );
  })();

  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  \"title\": string,\n' +
    '  \"blocks\": [ /* DraftBlock[] */ ]\n' +
    "}\n\n" +
    `Book title: ${opts.bookTitle}\n` +
    `Topic: ${opts.topic}\n` +
    `Chapter number: ${opts.chapterNumber}\n` +
    `Section: ${opts.sectionNumber} ${opts.sectionTitle}\n` +
    `Book language: ${opts.language} (${langLabel})\n` +
    `Image suggestedPrompt language: ${imageLangLabel}\n` +
    (opts.userInstructions ? `User instructions: ${opts.userInstructions}\n` : "") +
    "\nOUTLINE (MUST FOLLOW):\n" +
    `- Section title (DO NOT change): ${opts.sectionTitle}\n` +
    `- Required numbered subparagraph titles (MUST include exactly): ${requiredText}\n` +
    targetsText +
    "\nConstraints:\n" +
    "- title MUST match the section title (ignore topic if it conflicts).\n" +
    (required.length
      ? (
        "- blocks MUST contain ONLY top-level subparagraph blocks.\n" +
        "- blocks MUST contain EXACTLY one subparagraph for EACH required numbered subparagraph title.\n" +
        "- The order of blocks MUST match the order of the required numbered subparagraph titles.\n" +
        "- Each top-level subparagraph.title MUST match the required title EXACTLY (including the number).\n"
      )
      : "- Include 3-7 subparagraph blocks.\n") +
    "- basisHtml MUST be NON-EMPTY. Never use empty strings.\n" +
    `- Inside each numbered subparagraph, add ${microRule} nested subparagraph microheadings (1-6 words).\n` +
    "- Microheading titles MUST NOT contain punctuation characters: : ; ? ! (NO 'X: Y' headings). Use spaces instead.\n" +
    "- IMPORTANT: microheadings are ONE level only.\n" +
    "- Each microheading subparagraph MUST contain only paragraph/list/steps blocks (NO nested subparagraph blocks).\n" +
    `- Inside each numbered subparagraph, include ${paragraphRule} paragraph blocks (basisHtml).\n` +
    "- praktijkHtml (if present): 2-4 short sentences, workplace scenario.\n" +
    "- verdiepingHtml (if present): short deepening; explain jargon.\n" +
    `- Include ${imageRule} image suggestions in this section via images[].suggestedPrompt.\n` +
    "- Place images on paragraph/list/steps blocks as: images: [{ suggestedPrompt: string, alt?: string, caption?: string, layoutHint?: string }]\n" +
    `- suggestedPrompt MUST be written in ${imageLangLabel}.\n` +
    outlineTemplate +
    "\nWRITING STYLE (CRITICAL - Dutch MBO textbook style):\n" +
    "- Write in conversational, student-friendly Dutch. Address the reader as 'je' frequently.\n" +
    "- Use simple, flowing sentences. Avoid overly technical or academic language.\n" +
    "- Explain concepts with relatable examples: 'Hierbij kun je bijvoorbeeld denken aan...'\n" +
    "- Use inline explanations: 'Dat wil zeggen dat...', 'Dit betekent dat...'\n" +
    "- Connect sentences smoothly: 'Op dezelfde manier...', 'Hierdoor...', 'Doordat...'\n" +
    "- Use metaphors and analogies to clarify complex concepts (e.g. 'fabriekjes in de cel').\n" +
    "- Active voice, present tense. Avoid passive constructions where possible.\n" +
    "- Keep paragraphs digestible - explain one idea at a time before moving on.\n" +
    "- NO heavy formulas or abbreviations upfront. Define terms naturally in context.\n" +
    "- The tone should feel like a friendly teacher explaining to a student, not a textbook lecturing.\n"
  );
}

const NUMBERED_SUBPARA_TITLE_RE = /^\d+(?:\.\d+){2,}\s+/;

function collectRequiredNumberedSubparagraphTitles(sectionRaw: any): string[] {
  const blocks = Array.isArray(sectionRaw?.blocks) ? sectionRaw.blocks : [];
  return blocks
    .filter((b: any) => b && typeof b === "object" && b.type === "subparagraph")
    .map((b: any) => (typeof b.title === "string" ? normalizeWs(b.title) : ""))
    .filter((t: string) => NUMBERED_SUBPARA_TITLE_RE.test(t));
}

function countBasisParagraphs(blocksRaw: any[]): number {
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];
  let n = 0;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "paragraph") {
      const html = typeof (b as any).basisHtml === "string" ? String((b as any).basisHtml).trim() : "";
      const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text.length >= 20) n += 1;
      continue;
    }
    if (b.type === "subparagraph") {
      n += countBasisParagraphs(Array.isArray((b as any).blocks) ? (b as any).blocks : []);
      continue;
    }
  }
  return n;
}

function countImmediateMicroheadings(blocksRaw: any[]): number {
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];
  return blocks.filter((b: any) => {
    if (!b || typeof b !== "object") return false;
    if (b.type !== "subparagraph") return false;
    const t = typeof b.title === "string" ? normalizeWs(b.title) : "";
    if (!t) return false;
    return !NUMBERED_SUBPARA_TITLE_RE.test(t);
  }).length;
}

function countDraftImages(blocksRaw: any[]): { total: number; withPrompt: number } {
  let total = 0;
  let withPrompt = 0;

  const walk = (raw: any[]) => {
    const blocks = Array.isArray(raw) ? raw : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const type = typeof (b as any).type === "string" ? String((b as any).type) : "";
      if (type === "subparagraph") {
        walk(Array.isArray((b as any).blocks) ? (b as any).blocks : []);
        continue;
      }

      const images = Array.isArray((b as any).images) ? (b as any).images : [];
      for (const img of images) {
        if (!img || typeof img !== "object") continue;
        total += 1;
        const p = typeof (img as any).suggestedPrompt === "string" ? String((img as any).suggestedPrompt).trim() : "";
        if (p) withPrompt += 1;
      }
    }
  };

  walk(blocksRaw);
  return { total, withPrompt };
}

function hasBoxHtmlWithinNumberedSubparagraph(opts: {
  draft: DraftSection;
  numberedSubparagraphTitle: string;
  kind: "praktijkHtml" | "verdiepingHtml";
}): boolean {
  const blocksIn = Array.isArray((opts.draft as any)?.blocks) ? (opts.draft as any).blocks : [];
  const wantTitle = normalizeWs(opts.numberedSubparagraphTitle);
  const top = blocksIn.find(
    (b: any) => b && typeof b === "object" && b.type === "subparagraph" && typeof b.title === "string" && normalizeWs(b.title) === wantTitle,
  );
  if (!top) return false;

  const walk = (raw: any[]): boolean => {
    const blocks = Array.isArray(raw) ? raw : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const t = String((b as any).type || "");
      if (t === "paragraph") {
        const html = typeof (b as any)[opts.kind] === "string" ? String((b as any)[opts.kind]).trim() : "";
        if (html) return true;
        continue;
      }
      if (t === "subparagraph") {
        if (walk(Array.isArray((b as any).blocks) ? (b as any).blocks : [])) return true;
      }
    }
    return false;
  };

  return walk(Array.isArray((top as any).blocks) ? (top as any).blocks : []);
}

function assertBoxTargetsSatisfied(opts: {
  draft: DraftSection;
  requiredSubparagraphTitles: string[];
  praktijkTargets: string[] | null;
  verdiepingTargets: string[] | null;
}) {
  const required = new Set<string>(opts.requiredSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean));
  const check = (kind: "praktijkHtml" | "verdiepingHtml", targets: string[] | null) => {
    const arr = Array.isArray(targets) ? targets.map((t) => normalizeWs(t)).filter(Boolean) : [];
    for (const t of arr) {
      if (!required.has(t)) {
        throw new Error(`BLOCKED: ${kind} target is not in required outline titles: '${t}'`);
      }
      if (!hasBoxHtmlWithinNumberedSubparagraph({ draft: opts.draft, numberedSubparagraphTitle: t, kind })) {
        throw new Error(`BLOCKED: Missing ${kind} for target numbered subparagraph '${t}'`);
      }
    }
  };
  check("praktijkHtml", opts.praktijkTargets);
  check("verdiepingHtml", opts.verdiepingTargets);
}

function validateDraftSectionDensity(opts: {
  draft: DraftSection;
  requiredSubparagraphTitles: string[];
  layoutProfile: ChapterLayoutProfile;
  microheadingDensity: MicroheadingDensity;
}) {
  const blocksIn = Array.isArray((opts.draft as any)?.blocks) ? (opts.draft as any).blocks : [];

  const required = opts.requiredSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean);
  const byTitle = new Map<string, any>();
  for (const b of blocksIn) {
    if (b && typeof b === "object" && b.type === "subparagraph" && typeof b.title === "string") {
      byTitle.set(normalizeWs(b.title), b);
    }
  }

  // We enforce depth primarily via paragraph count (basisHtml). Microheadings are encouraged via prompt,
  // but not a hard blocker (models sometimes write directly under the numbered subparagraph).
  const thresholds =
    opts.layoutProfile === "pass2"
      ? { minBasisPerSub: 2, minTotalBasis: Math.max(6, required.length * 2) }
      : opts.layoutProfile === "sparse"
        ? { minBasisPerSub: 1, minTotalBasis: Math.max(2, required.length * 1) }
        : { minBasisPerSub: 2, minTotalBasis: Math.max(4, required.length * 2) };

  // If we don't have a locked outline, only require non-empty content.
  if (!required.length) {
    const total = countBasisParagraphs(blocksIn);
    if (total < thresholds.minTotalBasis) {
      throw new Error(`BLOCKED: Draft section too sparse (basisParagraphs=${total}, min=${thresholds.minTotalBasis})`);
    }
    return;
  }

  let totalBasis = 0;
  for (const reqTitle of required) {
    const sub = byTitle.get(reqTitle);
    if (!sub) continue; // required presence is validated elsewhere
    const inner = Array.isArray((sub as any).blocks) ? (sub as any).blocks : [];
    const basis = countBasisParagraphs(inner);
    totalBasis += basis;
    if (basis < thresholds.minBasisPerSub) {
      throw new Error(`BLOCKED: Draft too sparse under '${reqTitle}' (basisParagraphs=${basis}, min=${thresholds.minBasisPerSub})`);
    }
  }

  if (totalBasis < thresholds.minTotalBasis) {
    throw new Error(`BLOCKED: Draft section too sparse overall (basisParagraphs=${totalBasis}, min=${thresholds.minTotalBasis})`);
  }
}

function assertTerminologyEmphasis(opts: { draft: DraftSection; layoutProfile: ChapterLayoutProfile }) {
  // Required so index/glossary generation can be deterministic (terms come from canonical; no guessing).
  const blocksIn = Array.isArray((opts.draft as any)?.blocks) ? (opts.draft as any).blocks : [];

  const collect = (b: any, acc: string[]) => {
    if (!b || typeof b !== "object") return;
    const t = String((b as any).type || "");
    if (t === "paragraph") {
      acc.push(...extractStrongTerms((b as any).basisHtml));
      acc.push(...extractStrongTerms((b as any).praktijkHtml));
      acc.push(...extractStrongTerms((b as any).verdiepingHtml));
      return;
    }
    if (t === "list" || t === "steps") {
      const items = Array.isArray((b as any).items) ? (b as any).items : [];
      for (const it of items) acc.push(...extractStrongTerms(it));
      return;
    }
    if (t === "subparagraph") {
      const kids = Array.isArray((b as any).blocks) ? (b as any).blocks : [];
      for (const k of kids) collect(k, acc);
    }
  };

  const terms: string[] = [];
  for (const b of blocksIn) collect(b, terms);
  const uniq = new Set<string>(terms.map((t) => normalizeWs(t).toLowerCase()).filter(Boolean));

  const min =
    opts.layoutProfile === "pass2"
      ? 4
      : opts.layoutProfile === "sparse"
        ? 2
        : 3;
  if (uniq.size < min) {
    throw new Error(
      `BLOCKED: Not enough <strong> terminology emphasis in section draft (got ${uniq.size}, expected >= ${min}). ` +
        "Wrap key terms in <strong> on first mention.",
    );
  }
}

function assertMicroheadingsAreSingleLevel(opts: {
  draft: DraftSection;
  requiredSubparagraphTitles: string[];
  layoutProfile: ChapterLayoutProfile;
  microheadingDensity: MicroheadingDensity;
}) {
  // Only enforce when we have a locked numbered outline. Freeform sections may use top-level
  // subparagraphs as headings and are not guaranteed to follow PASS2 structure.
  const required = opts.requiredSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean);
  if (!required.length) return;

  const blocksIn = Array.isArray((opts.draft as any)?.blocks) ? (opts.draft as any).blocks : [];

  const punctRe = /[?!;:]/u;
  const sanitizeMicroheadingTitle = (raw: string) => normalizeWs(String(raw || "").replace(/[?!;:]/gu, " "));
  const countWords = (s: string) => normalizeWs(s).split(/\s+/).filter(Boolean).length;

  const isNumbered = (title: string) => NUMBERED_SUBPARA_TITLE_RE.test(normalizeWs(title));
  const isMicroheadingTitle = (title: string) => {
    const t = normalizeWs(title);
    return !!t && !isNumbered(t);
  };

  const hasMeaningfulNonSubContent = (rawBlocks: any[]): boolean => {
    const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const t = String((b as any).type || "");
      if (t === "paragraph") {
        const html = typeof (b as any).basisHtml === "string" ? String((b as any).basisHtml).trim() : "";
        const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (text.length >= 20) return true;
        continue;
      }
      if (t === "list" || t === "steps") {
        const items = Array.isArray((b as any).items) ? (b as any).items : [];
        if (items.some((x: any) => typeof x === "string" && x.trim().length >= 8)) return true;
        continue;
      }
      if (t === "subparagraph") {
        // Disallow microheading-of-microheading (double microheadings).
        return false;
      }
    }
    return false;
  };

  for (const top of blocksIn) {
    if (!top || typeof top !== "object") continue;
    if (String((top as any).type || "") !== "subparagraph") continue;
    const topTitle = typeof (top as any).title === "string" ? String((top as any).title) : "";
    if (!isNumbered(topTitle)) continue;

    const inner = Array.isArray((top as any).blocks) ? (top as any).blocks : [];
    for (const b of inner) {
      if (!b || typeof b !== "object") continue;
      if (String((b as any).type || "") !== "subparagraph") continue;
      const mhTitle = typeof (b as any).title === "string" ? String((b as any).title) : "";
      if (!isMicroheadingTitle(mhTitle)) continue;

      let t = normalizeWs(mhTitle);
      if (punctRe.test(t)) {
        // Deterministic repair: strip forbidden punctuation from microheadings to avoid stalling
        // the whole section on a minor style issue. (Content correctness is preserved.)
        const cleaned = sanitizeMicroheadingTitle(t);
        if (!cleaned) {
          throw new Error(`BLOCKED: Microheading became empty after stripping punctuation: '${t}'`);
        }
        (b as any).title = cleaned;
        t = cleaned;
      }
      const wc = countWords(t);
      if (wc < 1 || wc > 6) {
        throw new Error(`BLOCKED: Microheading must be 1-6 words (got ${wc}): '${t}'`);
      }

      const mhBlocks = Array.isArray((b as any).blocks) ? (b as any).blocks : [];
      if (mhBlocks.some((x: any) => x && typeof x === "object" && String((x as any).type || "") === "subparagraph")) {
        throw new Error(`BLOCKED: Nested microheadings are not allowed under microheading '${t}'`);
      }
      if (!hasMeaningfulNonSubContent(mhBlocks)) {
        throw new Error(`BLOCKED: Microheading '${t}' has no meaningful content (add 2-4 short sentences)`);
      }
    }
  }
}

export class BookGenerateSection implements JobExecutor {
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
    const sectionIndexRaw = requireNumber(p, "sectionIndex");
    const chapterIndex = Math.floor(chapterIndexRaw);
    const sectionIndex = Math.floor(sectionIndexRaw);
    if (chapterIndex !== chapterIndexRaw || sectionIndex !== sectionIndexRaw) {
      throw new Error("BLOCKED: chapterIndex and sectionIndex must be integers");
    }
    if (chapterIndex < 0) throw new Error("BLOCKED: chapterIndex must be >= 0");
    if (sectionIndex < 0) throw new Error("BLOCKED: sectionIndex must be >= 0");

    const topic = requireString(p, "topic");
    const language = requireString(p, "language");
    const level = requireEnum(p.level, ["n3", "n4"] as const, "level");
    const userInstructions = optionalString(p, "userInstructions");
    const imagePromptLanguage = optionalEnum(p.imagePromptLanguage, ["en", "book"] as const) ?? "en";
    const layoutProfile: ChapterLayoutProfile =
      optionalEnum((p as any).layoutProfile, ["auto", "pass2", "sparse"] as const) ?? "auto";
    const microheadingDensity =
      optionalEnum((p as any).microheadingDensity, ["low", "medium", "high"] as const) ??
        "medium";
    const writeModelSpec = parseModelSpec(p.writeModel);
    const requireImageSuggestion = (p as any).requireImageSuggestion === true;
    // Bounded retry (yield-based):
    // If the first draft fails validation, requeue the job for ONE retry instead of doing a second LLM call
    // in the same Edge invocation (which can exceed runtime limits and get marked as "stalled").
    const draftAttemptRaw = (p as any).__draftAttempt;
    const draftAttempt =
      typeof draftAttemptRaw === "number" && Number.isFinite(draftAttemptRaw)
        ? Math.max(0, Math.floor(draftAttemptRaw))
        : 0;
    const prevDraftFailureReasonRaw = (p as any).__draftFailureReason;
    const prevDraftFailureReason =
      typeof prevDraftFailureReasonRaw === "string" && prevDraftFailureReasonRaw.trim()
        ? prevDraftFailureReasonRaw.trim().slice(0, 800)
        : null;
    const mustFillTitleRaw = (p as any).__draftMustFillTitle;
    const mustFillTitle =
      typeof mustFillTitleRaw === "string" && mustFillTitleRaw.trim()
        ? normalizeWs(mustFillTitleRaw.trim()).slice(0, 120)
        : null;

    const mustBoxKindRaw = (p as any).__draftMustBoxKind;
    const mustBoxKind =
      mustBoxKindRaw === "praktijkHtml" || mustBoxKindRaw === "verdiepingHtml"
        ? (mustBoxKindRaw as "praktijkHtml" | "verdiepingHtml")
        : null;
    const mustBoxTitleRaw = (p as any).__draftMustBoxTitle;
    const mustBoxTitle =
      mustBoxKind && typeof mustBoxTitleRaw === "string" && mustBoxTitleRaw.trim()
        ? normalizeWs(mustBoxTitleRaw.trim()).slice(0, 160)
        : null;

    const llmTimeoutAttemptRaw = (p as any).__llmTimeoutAttempt;
    const llmTimeoutAttempt =
      typeof llmTimeoutAttemptRaw === "number" && Number.isFinite(llmTimeoutAttemptRaw)
        ? Math.max(0, Math.floor(llmTimeoutAttemptRaw))
        : 0;

    const sectionMaxTokens = (() => {
      const raw = p.sectionMaxTokens;
      if (typeof raw !== "number" || !Number.isFinite(raw)) return layoutProfile === "pass2" ? 9_000 : 8000;
      const n = Math.floor(raw);
      return Math.max(1200, Math.min(12_000, n));
    })();

    // Optional plan targets for this section (titles must match skeleton outline titles)
    const praktijkTargets = Array.isArray((p as any).praktijkTargets)
      ? (p as any).praktijkTargets.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim()).slice(0, 50)
      : null;
    const verdiepingTargets = Array.isArray((p as any).verdiepingTargets)
      ? (p as any).verdiepingTargets.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim()).slice(0, 50)
      : null;

    await emitAgentJobEvent(jobId, "generating", 5, `Generating section ${sectionIndex + 1} (chapter ${chapterIndex + 1})`, {
      bookId,
      bookVersionId,
      chapterIndex,
      sectionIndex,
      maxTokens: sectionMaxTokens,
      writeModel: `${writeModelSpec.provider}:${writeModelSpec.model}`,
      layoutProfile,
    }).catch(() => {});

    // 1) Load skeleton
    const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
    const skRaw = await downloadJson(adminSupabase, "books", skeletonPath);
    const v0 = validateBookSkeleton(skRaw);
    if (!v0.ok) throw new Error(`BLOCKED: Existing skeleton is invalid (${v0.issues.length} issue(s))`);
    const sk: BookSkeletonV1 = v0.skeleton;

    const chapters = Array.isArray((sk as any).chapters) ? (sk as any).chapters : [];
    const chapter = chapters[chapterIndex];
    if (!chapter) throw new Error(`BLOCKED: Skeleton missing chapter at index ${chapterIndex}`);
    const sections = Array.isArray((chapter as any).sections) ? (chapter as any).sections : [];
    const sectionRaw = sections[sectionIndex];
    if (!sectionRaw) throw new Error(`BLOCKED: Skeleton missing section at index ${sectionIndex} (chapter ${chapterIndex})`);

    const sectionId = typeof (sectionRaw as any)?.id === "string" ? String((sectionRaw as any).id).trim() : "";
    if (!sectionId) throw new Error("BLOCKED: Skeleton section is missing id");

    const expectedSectionTitle = typeof sectionRaw.title === "string" ? normalizeWs(sectionRaw.title) : "";
    const requiredSubparagraphTitlesAll = collectRequiredNumberedSubparagraphTitles(sectionRaw);
    // Guardrail: some PASS1 sources produce sections with huge lists (e.g. 19 numbered titles).
    // Enforcing an exact match becomes brittle and frequently fails JSON validation.
    // For oversized outlines, we switch to "topic coverage" mode (no locked titles).
    const MAX_LOCKED_OUTLINE_SUBS = 10;
    const lockedOutline = requiredSubparagraphTitlesAll.length > 0 && requiredSubparagraphTitlesAll.length <= MAX_LOCKED_OUTLINE_SUBS;
    const requiredSubparagraphTitles = lockedOutline ? requiredSubparagraphTitlesAll : [];
    const outlineTopics = !lockedOutline ? requiredSubparagraphTitlesAll : [];

    // 2) Load book title (for better prompts)
    const { data: bookRow, error: bookErr } = await adminSupabase.from("books").select("title").eq("id", bookId).single();
    if (bookErr || !bookRow) throw new Error(bookErr?.message || "Book not found");
    const bookTitle = String((bookRow as any).title || "").trim();

    await emitAgentJobEvent(jobId, "generating", 20, "Calling LLM to draft section content", {
      chapterIndex,
      sectionIndex,
    }).catch(() => {});

    const system = buildSystem({ language, level, imagePromptLanguage, layoutProfile, microheadingDensity });
    const sectionNumber = sectionId;
    const outlineTopicHints =
      outlineTopics.length
        ? [
            "OUTLINE TOPICS (cover these concepts; do NOT treat these as required headings):",
            ...outlineTopics.slice(0, 40).map((t) => `- ${stripNumberPrefix(normalizeWs(t)) || normalizeWs(t)}`),
          ].join("\n")
        : null;
    const timeoutNotes =
      llmTimeoutAttempt > 0
        ? `TIMEOUT RECOVERY (attempt ${llmTimeoutAttempt}): Keep the draft SHORTER and more concise. Prefer fewer microheadings and shorter paragraphs while still meeting the outline + minimum basis paragraphs.`
        : null;
    const effectiveUserInstructions =
      draftAttempt > 0
        ? [
            userInstructions,
            prevDraftFailureReason ? `Previous validation failure:\n${prevDraftFailureReason}` : null,
            mustFillTitle
              ? `MUST FIX: Add at least 2 basisHtml paragraphs under numbered subparagraph '${mustFillTitle}'. Do not leave its blocks empty.`
              : null,
            mustBoxKind && mustBoxTitle
              ? (
                `MUST FIX: Add exactly ONE ${mustBoxKind} paragraph inside numbered subparagraph '${mustBoxTitle}'.\n` +
                `- Put it on a PARAGRAPH block field named '${mustBoxKind}' (NOT in basisHtml).\n` +
                `- ${mustBoxKind} must start with <span class="box-lead">...</span> and contain 2-4 short sentences.`
              )
              : null,
            timeoutNotes,
            outlineTopicHints,
            "CRITICAL:\n" +
              "- Follow the OUTLINE exactly (titles + required numbered subparagraphs).\n" +
              "- Do NOT leave basisHtml empty.\n" +
              "- For every microheading, write 2-4 short sentences.\n" +
              "- Microheading titles MUST NOT contain punctuation (: ; ? !). Do NOT use 'X: Y' headings. Example: use 'G1 fase groei voorbereiding' (no colon).\n" +
              "- Do NOT nest microheadings inside microheadings (no subparagraph blocks inside microheading blocks).\n" +
              "- If layout targets are provided, you MUST include the corresponding praktijkHtml/verdiepingHtml inside EACH target title.\n" +
              "- If PASS2: make it long enough (many microheadings + many basis paragraphs).\n" +
              (requireImageSuggestion
                ? "- Include at least ONE image suggestion using images: [{ suggestedPrompt: \"...\", alt?: \"...\" }].\n"
                : "") +
              "- Return valid JSON only (no markdown).",
          ]
            .filter((x) => typeof x === "string" && x.trim())
            .map((x) => String(x).trim())
            .join("\n\n")
        : [userInstructions, timeoutNotes, outlineTopicHints].filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()).join("\n\n");
    const prompt = buildPrompt({
      topic,
      bookTitle,
      chapterNumber: chapterIndex + 1,
      sectionNumber,
      sectionTitle: stripNumberPrefix(expectedSectionTitle) || expectedSectionTitle || `Section ${sectionNumber}`,
      requiredSubparagraphTitles,
      userInstructions: effectiveUserInstructions,
      language,
      imagePromptLanguage,
      layoutProfile,
      microheadingDensity,
      requireImageSuggestion,
      praktijkTargets,
      verdiepingTargets,
    });

    let draft: DraftSection;
    try {
      draft = (await llmGenerateJson({
        provider: writeModelSpec.provider,
        model: writeModelSpec.model,
        system,
        prompt,
        maxTokens: sectionMaxTokens,
        tool: buildDraftBookSectionToolSpec(requiredSubparagraphTitles),
      })) as DraftSection;
    } catch (e) {
      if (isAbortTimeout(e)) {
        const MAX_LLM_TIMEOUT_ATTEMPTS = 6;
        const nextAttempt = llmTimeoutAttempt + 1;
        if (nextAttempt > MAX_LLM_TIMEOUT_ATTEMPTS) {
          throw new Error(
            `BLOCKED: LLM timed out too many times (${llmTimeoutAttempt}/${MAX_LLM_TIMEOUT_ATTEMPTS}). ` +
              "Try lowering sectionMaxTokens or switching models.",
          );
        }

        const nextTokens = Math.max(1200, Math.floor(sectionMaxTokens * 0.75));
        await emitAgentJobEvent(jobId, "generating", 25, "LLM call timed out; requeueing with lower maxTokens", {
          chapterIndex,
          sectionIndex,
          layoutProfile,
          microheadingDensity,
          llmTimeoutAttempt: nextAttempt,
          prevMaxTokens: sectionMaxTokens,
          nextMaxTokens: nextTokens,
        }).catch(() => {});

        return {
          yield: true,
          message: `LLM timed out; retrying with lower maxTokens (attempt ${nextAttempt}/${MAX_LLM_TIMEOUT_ATTEMPTS})`,
          payloadPatch: {
            __llmTimeoutAttempt: nextAttempt,
            sectionMaxTokens: nextTokens,
          },
        };
      }
      throw e;
    }

    // 3) Enforce locked outline + density (bounded retry once).
    const validateAll = (d: DraftSection) => {
      if (typeof d?.title === "string" && expectedSectionTitle) {
        const a = stripNumberPrefix(d.title);
        const b = stripNumberPrefix(expectedSectionTitle);
        if (a && b && a !== b) {
          throw new Error(`BLOCKED: LLM returned wrong section title (got='${a}', expected='${b}')`);
        }
      }

      if (requiredSubparagraphTitles.length) {
        const required = requiredSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean);
        const blocksIn = Array.isArray((d as any)?.blocks) ? (d as any).blocks : [];
        const nonSub = blocksIn.filter((b: any) => !b || typeof b !== "object" || (b as any).type !== "subparagraph");
        if (nonSub.length) {
          throw new Error("BLOCKED: Section draft has non-subparagraph top-level blocks; outline requires numbered subparagraphs only");
        }

        const got = blocksIn
          .filter((b: any) => b && typeof b === "object" && (b as any).type === "subparagraph")
          .map((b: any) => (typeof (b as any).title === "string" ? normalizeWs((b as any).title) : ""))
          .filter(Boolean);

        const gotNumbered = got.filter((t) => NUMBERED_SUBPARA_TITLE_RE.test(t));
        if (gotNumbered.length !== got.length) {
          const bad = got.filter((t) => !NUMBERED_SUBPARA_TITLE_RE.test(t)).slice(0, 3);
          throw new Error(`BLOCKED: Found unnumbered subparagraph(s) at section top level: ${bad.join(" | ")}`);
        }

        if (gotNumbered.length !== required.length) {
          throw new Error(`BLOCKED: Numbered subparagraph count mismatch (got=${gotNumbered.length}, expected=${required.length})`);
        }
        for (let i = 0; i < required.length; i++) {
          if (gotNumbered[i] !== required[i]) {
            throw new Error(`BLOCKED: Numbered subparagraph mismatch at index ${i} (got='${gotNumbered[i]}', expected='${required[i]}')`);
          }
        }
      }

      validateDraftSectionDensity({ draft: d, requiredSubparagraphTitles, layoutProfile, microheadingDensity });
      assertTerminologyEmphasis({ draft: d, layoutProfile });
      assertMicroheadingsAreSingleLevel({ draft: d, requiredSubparagraphTitles, layoutProfile, microheadingDensity });
      // Only enforce box placement targets when the outline is locked (small enough to match reliably).
      assertBoxTargetsSatisfied({
        draft: d,
        requiredSubparagraphTitles,
        praktijkTargets: lockedOutline ? praktijkTargets : null,
        verdiepingTargets: lockedOutline ? verdiepingTargets : null,
      });

      if (requireImageSuggestion) {
        const blocksIn = Array.isArray((d as any)?.blocks) ? (d as any).blocks : [];
        const counts = countDraftImages(blocksIn);
        if (counts.withPrompt < 1) {
          throw new Error("BLOCKED: Draft missing image suggestions (need at least 1 images[].suggestedPrompt)");
        }
      }
    };

    try {
      validateAll(draft);
    } catch (e) {
      let reason = e instanceof Error ? e.message : String(e);

      // Recovery: Some Anthropic tool outputs degrade to `{ title, blocks: [] }` for locked outlines.
      // This leads to repeated `got=0` failures. If OpenAI is configured, attempt a bounded recovery.
      const emptyBlocksMismatch =
        requiredSubparagraphTitles.length > 0 &&
        reason.includes("BLOCKED: Numbered subparagraph count mismatch (got=0");

      const emptyRecoveriesRaw = (p as any).__emptyBlocksRecoveries;
      const emptyRecoveries =
        typeof emptyRecoveriesRaw === "number" && Number.isFinite(emptyRecoveriesRaw)
          ? Math.max(0, Math.floor(emptyRecoveriesRaw))
          : 0;

      let recoveredOk = false;
      if (emptyBlocksMismatch && emptyRecoveries < 2 && writeModelSpec.provider === "anthropic") {
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (openaiKey && openaiKey.trim()) {
          await emitAgentJobEvent(jobId, "generating", 23, "Empty outline from Anthropic; attempting OpenAI recovery", {
            chapterIndex,
            sectionIndex,
            expectedSubparagraphs: requiredSubparagraphTitles.length,
            openAiModel: "gpt-5.2",
            attempt: emptyRecoveries + 1,
          }).catch(() => {});

          try {
            const recovered = (await llmGenerateJson({
              provider: "openai",
              model: "gpt-5.2",
              system,
              prompt,
              maxTokens: Math.max(2200, Math.min(7000, Math.floor(sectionMaxTokens * 0.85))),
            })) as DraftSection;

            validateAll(recovered);
            draft = recovered;
            recoveredOk = true;

            await emitAgentJobEvent(jobId, "generating", 24, "OpenAI recovery succeeded; continuing", {
              chapterIndex,
              sectionIndex,
            }).catch(() => {});
          } catch (e2) {
            const msg = e2 instanceof Error ? e2.message : String(e2);
            await emitAgentJobEvent(jobId, "generating", 24, "OpenAI recovery failed; continuing normal retry flow", {
              chapterIndex,
              sectionIndex,
              reason: msg.slice(0, 600),
            }).catch(() => {});

            // Record that we attempted this recovery (bounded).
            (p as any).__emptyBlocksRecoveries = emptyRecoveries + 1;
          }
        }
      }

      if (!recoveredOk) {
        const MAX_DRAFT_ATTEMPTS = 4;
        const nextAttempt = draftAttempt + 1;
        if (nextAttempt > MAX_DRAFT_ATTEMPTS) {
          throw new Error(`BLOCKED: Draft did not meet requirements after ${MAX_DRAFT_ATTEMPTS} attempts: ${reason.slice(0, 800)}`);
        }

        await emitAgentJobEvent(jobId, "generating", 25, "Draft did not meet requirements; requeueing for retry", {
          chapterIndex,
          sectionIndex,
          layoutProfile,
          microheadingDensity,
          draftAttempt: nextAttempt,
          reason: reason.slice(0, 800),
        }).catch(() => {});

        const mustFill = parseSparseUnderTitle(reason);
        const mustBox = parseMissingBoxTarget(reason);
        return {
          yield: true,
          message: "Draft did not meet requirements; retrying via requeue",
          payloadPatch: {
            __draftAttempt: nextAttempt,
            __draftFailureReason: reason.slice(0, 800),
            ...(typeof (p as any).__emptyBlocksRecoveries === "number"
              ? { __emptyBlocksRecoveries: (p as any).__emptyBlocksRecoveries }
              : {}),
            ...(mustFill ? { __draftMustFillTitle: mustFill } : {}),
            ...(mustBox ? { __draftMustBoxKind: mustBox.kind, __draftMustBoxTitle: mustBox.title } : {}),
          },
        };
      }
    }

    // 4) Apply to skeleton: replace this section's content
    const newSection = convertDraftBlocksToSkeletonSection({
      bookId,
      chapterIndex,
      sectionIndex,
      sectionId,
      sectionTitle: expectedSectionTitle || (typeof draft?.title === "string" ? draft.title : ""),
      blocksIn: Array.isArray(draft?.blocks) ? draft.blocks : [],
    });

    (sk as any).chapters[chapterIndex] = {
      ...(chapter as any),
      sections: sections.map((s: any, idx: number) => (idx === sectionIndex ? newSection : s)),
    };
    // Renumber all images in the chapter after updating the section.
    renumberChapterImages((sk as any).chapters[chapterIndex], chapterIndex + 1);

    const v1 = validateBookSkeleton(sk);
    if (!v1.ok) throw new Error(`BLOCKED: Updated skeleton validation failed (${v1.issues.length} issue(s))`);

    await emitAgentJobEvent(jobId, "storage_write", 60, "Saving skeleton + compiling canonical", {
      skeletonPath,
    }).catch(() => {});

    const saveRes = await callEdgeAsAgent({
      orgId: organizationId,
      path: "book-version-save-skeleton",
      body: { bookId, bookVersionId, skeleton: v1.skeleton, note: `BookGen Pro: ch${chapterIndex + 1} sec${sectionIndex + 1}`, compileCanonical: true },
    });
    if (saveRes?.ok !== true) throw new Error("Failed to save skeleton");

    const canonicalPath = `${bookId}/${bookVersionId}/canonical.json`;
    const compiled = compileSkeletonToCanonical(v1.skeleton);
    await uploadJson(adminSupabase, "books", canonicalPath, compiled, true);

    await emitAgentJobEvent(jobId, "done", 100, "Section generated", {
      bookId,
      bookVersionId,
      chapterIndex,
      sectionIndex,
    }).catch(() => {});

    return { ok: true, bookId, bookVersionId, chapterIndex, sectionIndex };
  }
}

