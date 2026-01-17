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

const TOOL_REPAIR_BOX: AnthropicToolSpec = {
  name: "repair_box_html",
  description:
    "Return ONLY JSON with { basisHtml, boxHtml }. " +
    "basisHtml is 1-2 short sentences; boxHtml is 2-4 short sentences and MUST start with <span class=\"box-lead\">...</span>.",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["basisHtml", "boxHtml"],
    properties: {
      basisHtml: { type: "string" },
      boxHtml: { type: "string" },
    },
  },
};

const TOOL_REPAIR_MICROHEADING: AnthropicToolSpec = {
  name: "repair_microheading_content",
  description:
    "Return ONLY JSON with { basisHtml }. " +
    "basisHtml is 2-4 short sentences for a microheading; inline HTML only.",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["basisHtml"],
    properties: {
      basisHtml: { type: "string" },
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

function buildDraftNumberedSubparagraphToolSpec(requiredNumberedTitle: string): AnthropicToolSpec {
  const title = normalizeWs(requiredNumberedTitle);
  if (!title) {
    throw new Error("BLOCKED: requiredNumberedTitle is missing for split subparagraph generation");
  }
  return {
    name: "draft_numbered_subparagraph",
    description:
      "Return ONLY the numbered subparagraph JSON object: { title, blocks }. " +
      "title MUST match the provided numbered subparagraph title exactly. " +
      "blocks MUST be a non-empty DraftBlock[] (nested microheadings + paragraphs/lists/steps).",
    input_schema: {
      type: "object",
      additionalProperties: true,
      required: ["title", "blocks"],
      properties: {
        // Allow only the requested numbered title (prevents outline drift).
        title: { type: "string", enum: [title] },
        blocks: {
          type: "array",
          minItems: 1,
          // Keep nested block shapes flexible, but require a `type` field so validators
          // (basis paragraph counting, microheading checks) don't see an array of untyped objects.
          items: {
            type: "object",
            additionalProperties: true,
            required: ["type"],
            properties: {
              type: { type: "string", enum: ["subparagraph", "paragraph", "list", "steps"] },
              title: { type: "string" },
              blocks: { type: "array", items: { type: "object", additionalProperties: true } },
              basisHtml: { type: "string" },
              praktijkHtml: { type: "string" },
              verdiepingHtml: { type: "string" },
              ordered: { type: "boolean" },
              items: { type: "array", items: { type: "string" } },
              images: { type: "array", items: { type: "object", additionalProperties: true } },
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

function parseMissingMicroheadingTitle(reason: string): string | null {
  const msg = String(reason || "");
  const m = msg.match(/Microheading '([^']+)' has no meaningful content/);
  if (!m) return null;
  const title = normalizeWs(m[1] || "");
  return title || null;
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
    // OpenAI "json_schema" strict mode has a very constrained schema dialect (all properties must be required, etc).
    // For BookGen drafts we rely on our own validators + bounded retries instead of fighting schema errors.
    const response_format = { type: "json_object" };
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format,
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

function convertDraftBlockToSkeletonBlock(opts: {
  bookId: string;
  chapterIndex: number;
  sectionIndex: number;
  keyParts: number[];
  block: DraftBlock;
}): any {
  const { bookId, chapterIndex, sectionIndex, keyParts, block } = opts;
  const chNum = chapterIndex + 1;

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

  const convert = (b: any, kp: number[]): any => {
    const t = typeof b?.type === "string" ? b.type : "";
    const key = kp.join("_");
    const blockId = `ch-${chNum}-b-${key}`;

    if (t === "subparagraph") {
      const title = typeof b?.title === "string" ? b.title.trim() : "";
      const mNum = title.match(/^(\d+(?:\.\d+){2,})\s+/);
      const numberedId = mNum ? String(mNum[1] || "").trim() : "";
      const innerIn = Array.isArray(b?.blocks) ? b.blocks : [];
      const innerBlocks = innerIn.slice(0, 20).map((ib: any, ii: number) => convert(ib, kp.concat([ii + 1])));
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
      const praktijkHtml = typeof b.praktijkHtml === "string"
        ? ensureBoxLeadSpan(normalizeInlineHtml(b.praktijkHtml), { maxWords: 3 })
        : null;
      const verdiepingHtml = typeof b.verdiepingHtml === "string"
        ? ensureBoxLeadSpan(normalizeInlineHtml(b.verdiepingHtml), { maxWords: 5 })
        : null;
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

    // Default to paragraph
    return { type: "paragraph", id: blockId, basisHtml: normalizeInlineHtml((b as any)?.basisHtml ?? "") };
  };

  // keyParts for this section begin with [sectionIndex+1, ...] but are not otherwise used.
  if (sectionIndex < 0) throw new Error("BLOCKED: sectionIndex must be >= 0");
  if (!Array.isArray(keyParts) || keyParts.length < 2) throw new Error("BLOCKED: keyParts must include sectionIndex and block index");
  return convert(block, keyParts);
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

function buildNumberedSubparagraphPrompt(opts: {
  topic: string;
  bookTitle: string;
  chapterNumber: number;
  sectionNumber: string;
  sectionTitle: string;
  numberedSubparagraphTitle: string;
  requiredNumberedSubparagraphTitles: string[];
  alreadyIntroducedTerms: string[];
  userInstructions?: string | null;
  language: string;
  imagePromptLanguage: ImagePromptLanguage;
  layoutProfile: ChapterLayoutProfile;
  microheadingDensity: MicroheadingDensity;
  requireImageSuggestion: boolean;
  requirePraktijkBox: boolean;
  requireVerdiepingBox: boolean;
}) {
  const langLabel = normalizeLanguageLabel(opts.language);
  const imageLangLabel = opts.imagePromptLanguage === "book" ? langLabel : "English";
  const requiredAll = Array.isArray(opts.requiredNumberedSubparagraphTitles)
    ? opts.requiredNumberedSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean).slice(0, 40)
    : [];
  const requiredText = requiredAll.length ? requiredAll.join(" | ") : "(none)";
  const terms = Array.isArray(opts.alreadyIntroducedTerms)
    ? opts.alreadyIntroducedTerms.map((t) => normalizeWs(t)).filter(Boolean).slice(0, 40)
    : [];
  const termsText = terms.length ? terms.join(", ") : "(none)";

  const isWideOutline = requiredAll.length >= 8;
  const microRule =
    isWideOutline
      ? (opts.microheadingDensity === "high" ? "1-2" : "0-1")
      : (
        opts.layoutProfile === "pass2"
          ? (opts.microheadingDensity === "low" ? "1-2" : opts.microheadingDensity === "high" ? "3-4" : "2-3")
          : opts.layoutProfile === "sparse"
            ? (opts.microheadingDensity === "high" ? "1-2" : "0-1")
            : (opts.microheadingDensity === "low" ? "0-1" : opts.microheadingDensity === "high" ? "2-3" : "1-2")
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
  const imageRule = opts.requireImageSuggestion ? "1-2 (REQUIRED in this subparagraph)" : "0-1";
  const minBasisPerSub = opts.layoutProfile === "sparse" ? 1 : 2;
  const boxRules = (() => {
    if (opts.requirePraktijkBox && opts.requireVerdiepingBox) {
      return (
        "- Include EXACTLY ONE praktijkHtml paragraph AND EXACTLY ONE verdiepingHtml paragraph inside this numbered subparagraph.\n" +
        "- Each box must start with <span class=\"box-lead\">...</span>.\n"
      );
    }
    if (opts.requirePraktijkBox) {
      return (
        "- Include EXACTLY ONE praktijkHtml paragraph inside this numbered subparagraph.\n" +
        "- praktijkHtml must start with <span class=\"box-lead\">...</span> and contain 2-4 short sentences.\n" +
        "- Do NOT include verdiepingHtml anywhere in this numbered subparagraph.\n"
      );
    }
    if (opts.requireVerdiepingBox) {
      return (
        "- Include EXACTLY ONE verdiepingHtml paragraph inside this numbered subparagraph.\n" +
        "- verdiepingHtml must start with <span class=\"box-lead\">...</span> and contain 2-4 short sentences.\n" +
        "- Do NOT include praktijkHtml anywhere in this numbered subparagraph.\n"
      );
    }
    return (
      "- Do NOT include praktijkHtml or verdiepingHtml anywhere in this numbered subparagraph.\n"
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
    "\nCONTEXT (keep it consistent; avoid redundancy):\n" +
    `- Already introduced key terms (avoid re-defining): ${termsText}\n\n` +
    "\nFULL OUTLINE (for context; do NOT write these other parts now):\n" +
    `- Required numbered subparagraph titles in this section: ${requiredText}\n\n` +
    "YOU ARE WRITING ONLY THIS NUMBERED SUBPARAGRAPH:\n" +
    `- title (MUST match exactly): ${normalizeWs(opts.numberedSubparagraphTitle)}\n\n` +
    "Constraints:\n" +
    "- title MUST match the numbered subparagraph title exactly.\n" +
    "- blocks MUST be NON-EMPTY.\n" +
    "- Do NOT create any numbered subparagraph titles inside blocks.\n" +
    `- Add ${microRule} microheadings as nested subparagraph blocks (1-6 words).\n` +
    "- Microheading titles MUST NOT contain punctuation characters: : ; ? !\n" +
    `- Include ${paragraphRule} paragraph blocks (basisHtml) across the microheadings.\n` +
    `- MUST include at least ${minBasisPerSub} paragraph block(s) with NON-EMPTY basisHtml (2-4 short sentences each).\n` +
    "- IMPORTANT: list/steps items do NOT count as basisHtml paragraphs.\n" +
    boxRules +
    `- Include ${imageRule} image suggestions via images[].suggestedPrompt.\n` +
    "- Place images on paragraph/list/steps blocks as: images: [{ suggestedPrompt: string, alt?: string, caption?: string, layoutHint?: string }]\n" +
    `- suggestedPrompt MUST be written in ${imageLangLabel}.\n`
    +
    "\nWRITING STYLE (Dutch MBO textbook style):\n" +
    "- Write in conversational, student-friendly Dutch. Address the reader as 'je' where natural.\n" +
    "- Use simple, flowing sentences. Explain terms the first time (unless already introduced).\n" +
    "- Use small concrete examples ('bijvoorbeeld').\n" +
    "- Keep it practical; avoid academic tone.\n"
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

function stripHtmlToText(html: unknown): string {
  const s = typeof html === "string" ? html : "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function collectContextSnippet(blocksRaw: any[], maxChars: number): string {
  const limit = Math.max(0, Math.floor(maxChars || 0));
  if (!limit) return "";
  let out = "";
  const push = (raw: unknown) => {
    if (!raw || out.length >= limit) return;
    const text = stripHtmlToText(raw);
    if (!text) return;
    const next = out ? `${out} ${text}` : text;
    out = next.length > limit ? next.slice(0, limit) : next;
  };
  const walk = (raw: any[]) => {
    const blocks = Array.isArray(raw) ? raw : [];
    for (const b of blocks) {
      if (out.length >= limit) return;
      if (!b || typeof b !== "object") continue;
      const t = String((b as any).type || "");
      if (t === "paragraph") {
        push((b as any).basisHtml);
        continue;
      }
      if (t === "list" || t === "steps") {
        const items = Array.isArray((b as any).items) ? (b as any).items : [];
        for (const it of items) {
          if (out.length >= limit) break;
          push(it);
        }
        continue;
      }
      if (t === "subparagraph") {
        walk(Array.isArray((b as any).blocks) ? (b as any).blocks : []);
      }
    }
  };
  walk(blocksRaw);
  return out.trim();
}

function findNumberedSubparagraphBlock(draft: DraftSection, title: string): DraftBlock | null {
  const want = normalizeWs(title);
  const blocks = Array.isArray((draft as any)?.blocks) ? (draft as any).blocks : [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if ((b as any).type !== "subparagraph") continue;
    const t = typeof (b as any).title === "string" ? normalizeWs((b as any).title) : "";
    if (t === want) return b as DraftBlock;
  }
  return null;
}

type MicroheadingTarget = {
  parentTitle: string;
  parentBlock: DraftBlock;
  microheading: DraftBlock;
};

function findMicroheadingInDraft(draft: DraftSection, microheadingTitle: string): MicroheadingTarget | null {
  const want = normalizeWs(microheadingTitle);
  const blocks = Array.isArray((draft as any)?.blocks) ? (draft as any).blocks : [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if ((b as any).type !== "subparagraph") continue;
    const parentTitle = typeof (b as any).title === "string" ? normalizeWs((b as any).title) : "";
    const inner = Array.isArray((b as any).blocks) ? (b as any).blocks : [];
    for (const mh of inner) {
      if (!mh || typeof mh !== "object") continue;
      if ((mh as any).type !== "subparagraph") continue;
      const t = typeof (mh as any).title === "string" ? normalizeWs((mh as any).title) : "";
      if (t === want) {
        return { parentTitle, parentBlock: b as DraftBlock, microheading: mh as DraftBlock };
      }
    }
  }
  return null;
}

function attachBoxHtmlToSubparagraphBlocks(opts: {
  blocks: DraftBlock[];
  kind: "praktijkHtml" | "verdiepingHtml";
  boxHtml: string;
  basisHtml: string;
}): boolean {
  const blocks = Array.isArray(opts.blocks) ? opts.blocks : [];
  const kind = opts.kind;
  const boxHtml = String(opts.boxHtml || "").trim();
  const basisHtml = String(opts.basisHtml || "").trim();
  if (!boxHtml) return false;

  const walk = (arr: DraftBlock[]): boolean => {
    for (const b of arr) {
      if (!b || typeof b !== "object") continue;
      const t = String((b as any).type || "");
      if (t === "paragraph") {
        const existing = typeof (b as any)[kind] === "string" ? String((b as any)[kind]).trim() : "";
        if (!existing) {
          (b as any)[kind] = boxHtml;
          return true;
        }
        continue;
      }
      if (t === "subparagraph") {
        const inner = Array.isArray((b as any).blocks) ? (b as any).blocks : [];
        if (walk(inner as DraftBlock[])) return true;
      }
    }
    return false;
  };

  if (walk(blocks)) return true;
  if (!basisHtml) return false;
  blocks.push({
    type: "paragraph",
    basisHtml,
    ...(kind === "praktijkHtml" ? { praktijkHtml: boxHtml } : { verdiepingHtml: boxHtml }),
  } as DraftBlock);
  return true;
}

function buildBoxRepairPrompt(opts: {
  bookTitle: string;
  topic: string;
  chapterNumber: number;
  sectionNumber: string;
  sectionTitle: string;
  numberedSubparagraphTitle: string;
  kind: "praktijkHtml" | "verdiepingHtml";
  userInstructions?: string | null;
  language: string;
  contextSnippet: string;
}): string {
  const langLabel = normalizeLanguageLabel(opts.language);
  const kindLabel = opts.kind === "praktijkHtml" ? "praktijk" : "verdieping";
  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  "basisHtml": string,\n' +
    '  "boxHtml": string\n' +
    "}\n\n" +
    `Book title: ${opts.bookTitle}\n` +
    `Topic: ${opts.topic}\n` +
    `Chapter: ${opts.chapterNumber}\n` +
    `Section: ${opts.sectionNumber} ${opts.sectionTitle}\n` +
    `Numbered subparagraph: ${opts.numberedSubparagraphTitle}\n` +
    `Box kind: ${kindLabel}\n` +
    `Book language: ${opts.language} (${langLabel})\n` +
    (opts.userInstructions ? `User instructions: ${opts.userInstructions}\n` : "") +
    "\nContext from this subparagraph:\n" +
    (opts.contextSnippet || "(none)") +
    "\n\nRequirements:\n" +
    "- basisHtml: 1-2 short sentences that introduce the box context.\n" +
    "- boxHtml: 2-4 short sentences; MUST start with <span class=\"box-lead\">...</span>.\n" +
    "- Use only topics present in the context; do NOT invent new topics.\n" +
    "- Inline HTML only. No markdown.\n"
  );
}

function buildMicroheadingRepairPrompt(opts: {
  bookTitle: string;
  topic: string;
  chapterNumber: number;
  sectionNumber: string;
  sectionTitle: string;
  numberedSubparagraphTitle: string;
  microheadingTitle: string;
  userInstructions?: string | null;
  language: string;
  contextSnippet: string;
}): string {
  const langLabel = normalizeLanguageLabel(opts.language);
  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  "basisHtml": string\n' +
    "}\n\n" +
    `Book title: ${opts.bookTitle}\n` +
    `Topic: ${opts.topic}\n` +
    `Chapter: ${opts.chapterNumber}\n` +
    `Section: ${opts.sectionNumber} ${opts.sectionTitle}\n` +
    `Numbered subparagraph: ${opts.numberedSubparagraphTitle}\n` +
    `Microheading: ${opts.microheadingTitle}\n` +
    `Book language: ${opts.language} (${langLabel})\n` +
    (opts.userInstructions ? `User instructions: ${opts.userInstructions}\n` : "") +
    "\nContext from this subparagraph:\n" +
    (opts.contextSnippet || "(none)") +
    "\n\nRequirements:\n" +
    "- basisHtml: 2-4 short sentences for the microheading.\n" +
    "- Use only topics present in the context; do NOT invent new topics.\n" +
    "- Inline HTML only. No markdown.\n"
  );
}

async function repairMissingBoxInDraft(opts: {
  draft: DraftSection;
  kind: "praktijkHtml" | "verdiepingHtml";
  numberedSubparagraphTitle: string;
  provider: Provider;
  model: string;
  system: string;
  bookTitle: string;
  topic: string;
  chapterNumber: number;
  sectionNumber: string;
  sectionTitle: string;
  language: string;
  userInstructions?: string | null;
}): Promise<boolean> {
  const target = findNumberedSubparagraphBlock(opts.draft, opts.numberedSubparagraphTitle);
  if (!target || (target as any).type !== "subparagraph") return false;
  const blocks = Array.isArray((target as any).blocks) ? (target as any).blocks : [];
  const contextSnippet = collectContextSnippet(blocks, 900);
  const prompt = buildBoxRepairPrompt({
    bookTitle: opts.bookTitle,
    topic: opts.topic,
    chapterNumber: opts.chapterNumber,
    sectionNumber: opts.sectionNumber,
    sectionTitle: opts.sectionTitle,
    numberedSubparagraphTitle: opts.numberedSubparagraphTitle,
    kind: opts.kind,
    userInstructions: opts.userInstructions,
    language: opts.language,
    contextSnippet,
  });
  const raw = await llmGenerateJson({
    provider: opts.provider,
    model: opts.model,
    system: opts.system,
    prompt,
    maxTokens: 700,
    tool: TOOL_REPAIR_BOX,
  });
  const basisHtml = typeof (raw as any)?.basisHtml === "string" ? String((raw as any).basisHtml).trim() : "";
  const boxHtmlRaw = typeof (raw as any)?.boxHtml === "string" ? String((raw as any).boxHtml).trim() : "";
  if (!basisHtml) throw new Error("BLOCKED: Box repair returned empty basisHtml");
  if (!boxHtmlRaw) throw new Error("BLOCKED: Box repair returned empty boxHtml");
  const normalizedBox = ensureBoxLeadSpan(boxHtmlRaw, { maxWords: 4 }) || boxHtmlRaw;
  if (stripHtmlToText(normalizedBox).length < 20) {
    throw new Error("BLOCKED: Box repair produced too little content");
  }
  const ok = attachBoxHtmlToSubparagraphBlocks({
    blocks: blocks as DraftBlock[],
    kind: opts.kind,
    boxHtml: normalizedBox,
    basisHtml,
  });
  return ok;
}

async function repairMissingMicroheadingInDraft(opts: {
  draft: DraftSection;
  microheadingTitle: string;
  provider: Provider;
  model: string;
  system: string;
  bookTitle: string;
  topic: string;
  chapterNumber: number;
  sectionNumber: string;
  sectionTitle: string;
  language: string;
  userInstructions?: string | null;
}): Promise<boolean> {
  const target = findMicroheadingInDraft(opts.draft, opts.microheadingTitle);
  if (!target) return false;
  const parentBlocks = Array.isArray((target.parentBlock as any)?.blocks) ? (target.parentBlock as any).blocks : [];
  const contextSnippet = collectContextSnippet(parentBlocks, 900);
  const prompt = buildMicroheadingRepairPrompt({
    bookTitle: opts.bookTitle,
    topic: opts.topic,
    chapterNumber: opts.chapterNumber,
    sectionNumber: opts.sectionNumber,
    sectionTitle: opts.sectionTitle,
    numberedSubparagraphTitle: target.parentTitle || opts.sectionTitle,
    microheadingTitle: opts.microheadingTitle,
    userInstructions: opts.userInstructions,
    language: opts.language,
    contextSnippet,
  });
  const raw = await llmGenerateJson({
    provider: opts.provider,
    model: opts.model,
    system: opts.system,
    prompt,
    maxTokens: 600,
    tool: TOOL_REPAIR_MICROHEADING,
  });
  const basisHtml = typeof (raw as any)?.basisHtml === "string" ? String((raw as any).basisHtml).trim() : "";
  if (!basisHtml) throw new Error("BLOCKED: Microheading repair returned empty basisHtml");
  if (stripHtmlToText(basisHtml).length < 20) {
    throw new Error("BLOCKED: Microheading repair produced too little content");
  }
  const blocks = Array.isArray((target.microheading as any).blocks) ? (target.microheading as any).blocks : [];
  blocks.push({ type: "paragraph", basisHtml } as DraftBlock);
  (target.microheading as any).blocks = blocks;
  return true;
}

async function attemptRepairForReason(opts: {
  reason: string;
  draft: DraftSection;
  provider: Provider;
  model: string;
  system: string;
  bookTitle: string;
  topic: string;
  chapterNumber: number;
  sectionNumber: string;
  sectionTitle: string;
  language: string;
  userInstructions?: string | null;
  jobId: string;
  chapterIndex: number;
  sectionIndex: number;
  splitMode: boolean;
}): Promise<boolean> {
  const missingBox = parseMissingBoxTarget(opts.reason);
  if (missingBox) {
    await emitAgentJobEvent(
      opts.jobId,
      "generating",
      24,
      "Auto-repair: filling missing box",
      {
        chapterIndex: opts.chapterIndex,
        sectionIndex: opts.sectionIndex,
        splitMode: opts.splitMode,
        targetTitle: missingBox.title,
        kind: missingBox.kind,
      },
    ).catch(() => {});
    return await repairMissingBoxInDraft({
      draft: opts.draft,
      kind: missingBox.kind,
      numberedSubparagraphTitle: missingBox.title,
      provider: opts.provider,
      model: opts.model,
      system: opts.system,
      bookTitle: opts.bookTitle,
      topic: opts.topic,
      chapterNumber: opts.chapterNumber,
      sectionNumber: opts.sectionNumber,
      sectionTitle: opts.sectionTitle,
      language: opts.language,
      userInstructions: opts.userInstructions,
    });
  }

  const missingMicro = parseMissingMicroheadingTitle(opts.reason);
  if (missingMicro) {
    await emitAgentJobEvent(
      opts.jobId,
      "generating",
      24,
      "Auto-repair: filling empty microheading",
      {
        chapterIndex: opts.chapterIndex,
        sectionIndex: opts.sectionIndex,
        splitMode: opts.splitMode,
        microheadingTitle: missingMicro,
      },
    ).catch(() => {});
    return await repairMissingMicroheadingInDraft({
      draft: opts.draft,
      microheadingTitle: missingMicro,
      provider: opts.provider,
      model: opts.model,
      system: opts.system,
      bookTitle: opts.bookTitle,
      topic: opts.topic,
      chapterNumber: opts.chapterNumber,
      sectionNumber: opts.sectionNumber,
      sectionTitle: opts.sectionTitle,
      language: opts.language,
      userInstructions: opts.userInstructions,
    });
  }
  return false;
}

function coerceListItemsIntoBasisParagraphs(opts: { blocksRaw: any[]; minBasis: number }): void {
  const blocks = Array.isArray(opts.blocksRaw) ? opts.blocksRaw : [];
  const minBasis = Math.max(0, Math.floor(opts.minBasis || 0));
  if (!minBasis) return;

  // If we're already meeting the threshold, no-op.
  let need = minBasis - countBasisParagraphs(blocks);
  if (need <= 0) return;

  const MIN_CHARS = 20; // matches countBasisParagraphs()

  const makeParagraph = (basisHtml: string, images: any[] | null): any => {
    const b: any = { type: "paragraph", basisHtml };
    if (images && Array.isArray(images) && images.length) b.images = images;
    return b;
  };

  const walk = (arrRaw: any[]) => {
    if (need <= 0) return;
    const arr = Array.isArray(arrRaw) ? arrRaw : [];

    for (let i = 0; i < arr.length && need > 0; i++) {
      const b = arr[i];
      if (!b || typeof b !== "object") continue;
      const t = String((b as any).type || "");

      if (t === "subparagraph") {
        walk(Array.isArray((b as any).blocks) ? (b as any).blocks : []);
        continue;
      }

      if (t !== "list" && t !== "steps") continue;

      const itemsIn = Array.isArray((b as any).items) ? (b as any).items : [];
      const items: string[] = itemsIn
        .map((x: any) => (typeof x === "string" ? x.trim() : ""))
        .filter((x: string) => !!x);
      if (!items.length) continue;

      // Preserve images by attaching them to the first generated paragraph (if any).
      let images: any[] | null = Array.isArray((b as any).images) ? (b as any).images : null;

      const newBlocks: any[] = [];
      let remaining = items.slice();

      while (need > 0 && remaining.length) {
        const chunk: string[] = [];
        while (remaining.length && stripHtmlToText(chunk.join(" ")).length < MIN_CHARS) {
          const next = String(remaining.shift() || "").trim();
          if (!next) continue;
          chunk.push(next);
        }
        const html = chunk.join(" ").trim();
        if (!html) break;
        // Ensure it will count.
        if (stripHtmlToText(html).length < MIN_CHARS) break;
        newBlocks.push(makeParagraph(html, images));
        images = null;
        need -= 1;
      }

      // If we still have remaining list items, keep the original list/steps block with leftovers.
      if (remaining.length) {
        const keep: any = { ...(b as any), items: remaining };
        if (images) keep.images = images;
        newBlocks.push(keep);
      }

      if (newBlocks.length) {
        // Replace this list/steps block with generated paragraph(s) + remaining list.
        arr.splice(i, 1, ...newBlocks);
        i += newBlocks.length - 1;
      }
    }
  };

  walk(blocks);
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

function hasMeaningfulContent(blocksRaw: any[]): boolean {
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];

  const walk = (raw: any[]): boolean => {
    const arr = Array.isArray(raw) ? raw : [];
    for (const b of arr) {
      if (!b || typeof b !== "object") continue;
      const t = String((b as any).type || "");
      if (t === "paragraph") {
        const basis = typeof (b as any).basisHtml === "string" ? String((b as any).basisHtml).trim() : "";
        const text = basis.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text.length >= 20) return true;
        const prak = typeof (b as any).praktijkHtml === "string" ? String((b as any).praktijkHtml).trim() : "";
        const verd = typeof (b as any).verdiepingHtml === "string" ? String((b as any).verdiepingHtml).trim() : "";
        if (prak || verd) return true;
        continue;
      }
      if (t === "list" || t === "steps") {
        const items = Array.isArray((b as any).items) ? (b as any).items : [];
        if (items.some((x: any) => typeof x === "string" && x.trim().length >= 8)) return true;
        continue;
      }
      if (t === "subparagraph") {
        if (walk(Array.isArray((b as any).blocks) ? (b as any).blocks : [])) return true;
      }
    }
    return false;
  };

  return walk(blocks);
}

function collectStrongTermsFromBlocks(blocksRaw: any[]): string[] {
  const out: string[] = [];
  const walk = (raw: any[]) => {
    const blocks = Array.isArray(raw) ? raw : [];
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const t = String((b as any).type || "");
      if (t === "paragraph") {
        out.push(...extractStrongTerms((b as any).basisHtml));
        out.push(...extractStrongTerms((b as any).praktijkHtml));
        out.push(...extractStrongTerms((b as any).verdiepingHtml));
        continue;
      }
      if (t === "list" || t === "steps") {
        const items = Array.isArray((b as any).items) ? (b as any).items : [];
        for (const it of items) out.push(...extractStrongTerms(it));
        continue;
      }
      if (t === "subparagraph") {
        walk(Array.isArray((b as any).blocks) ? (b as any).blocks : []);
      }
    }
  };
  walk(blocksRaw);
  return out;
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

    // Split-mode (robustness): For heavy locked outlines, generate ONE numbered subparagraph at a time.
    // This keeps each LLM call small enough to reliably complete within Edge timeouts and avoids stalling
    // the whole section on a single long request.
    const forceSplitLockedOutline = (p as any).splitLockedOutline === true;
    const useSplitLockedOutline =
      lockedOutline && requiredSubparagraphTitles.length > 0 && (forceSplitLockedOutline || requiredSubparagraphTitles.length >= 8);

    if (useSplitLockedOutline) {
      const sectionBlocksIn = Array.isArray((sectionRaw as any)?.blocks) ? (sectionRaw as any).blocks : [];
      const required = requiredSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean);
      if (!required.length) throw new Error("BLOCKED: splitLockedOutline requires requiredSubparagraphTitles");

      const requiredSet = new Set<string>(required);
      const byTitle = new Map<string, any>();
      const indexByTitle = new Map<string, number>();
      for (let i = 0; i < sectionBlocksIn.length; i++) {
        const b = sectionBlocksIn[i];
        if (!b || typeof b !== "object") continue;
        if (String((b as any).type || "") !== "subparagraph") continue;
        const tRaw = typeof (b as any).title === "string" ? String((b as any).title) : "";
        const t = normalizeWs(tRaw);
        if (!t) continue;
        if (!requiredSet.has(t)) continue;
        byTitle.set(t, b);
        indexByTitle.set(t, i);
      }

      const missingTitles = required.filter((t) => {
        const b = byTitle.get(t);
        if (!b) return true;
        const inner = Array.isArray((b as any).blocks) ? (b as any).blocks : [];
        return !hasMeaningfulContent(inner);
      });
      const doneCount = required.length - missingTitles.length;

      // If everything is already filled, just validate + compile canonical and finish.
      if (missingTitles.length === 0) {
        const draftFromSkeleton: DraftSection = {
          title: expectedSectionTitle || (typeof (sectionRaw as any)?.title === "string" ? String((sectionRaw as any).title) : `Section ${sectionId}`),
          blocks: sectionBlocksIn as any,
        };

        // Final validation pass over the assembled skeleton blocks.
        validateDraftSectionDensity({ draft: draftFromSkeleton, requiredSubparagraphTitles, layoutProfile, microheadingDensity });
        assertTerminologyEmphasis({ draft: draftFromSkeleton, layoutProfile });
        assertMicroheadingsAreSingleLevel({ draft: draftFromSkeleton, requiredSubparagraphTitles, layoutProfile, microheadingDensity });
        assertBoxTargetsSatisfied({
          draft: draftFromSkeleton,
          requiredSubparagraphTitles,
          praktijkTargets: lockedOutline ? praktijkTargets : null,
          verdiepingTargets: lockedOutline ? verdiepingTargets : null,
        });
        if (requireImageSuggestion) {
          const counts = countDraftImages(sectionBlocksIn);
          if (counts.withPrompt < 1) {
            throw new Error("BLOCKED: Draft missing image suggestions (need at least 1 images[].suggestedPrompt)");
          }
        }

        const vFinal = validateBookSkeleton(sk);
        if (!vFinal.ok) throw new Error(`BLOCKED: Updated skeleton validation failed (${vFinal.issues.length} issue(s))`);

        await emitAgentJobEvent(jobId, "storage_write", 60, "Split-mode: saving skeleton + compiling canonical", {
          skeletonPath,
          splitMode: true,
          chapterIndex,
          sectionIndex,
        }).catch(() => {});

        const saveRes = await callEdgeAsAgent({
          orgId: organizationId,
          path: "book-version-save-skeleton",
          body: {
            bookId,
            bookVersionId,
            skeleton: vFinal.skeleton,
            note: `BookGen Pro split: ch${chapterIndex + 1} sec${sectionIndex + 1} finalize`,
            compileCanonical: true,
          },
        });
        if (saveRes?.ok !== true) throw new Error("Failed to save skeleton");

        const canonicalPath = `${bookId}/${bookVersionId}/canonical.json`;
        const compiled = compileSkeletonToCanonical(vFinal.skeleton);
        await uploadJson(adminSupabase, "books", canonicalPath, compiled, true);

        await emitAgentJobEvent(jobId, "done", 100, "Section generated (split-mode)", {
          bookId,
          bookVersionId,
          chapterIndex,
          sectionIndex,
          splitMode: true,
        }).catch(() => {});

        return { ok: true, bookId, bookVersionId, chapterIndex, sectionIndex };
      }

      const currentTitle = missingTitles[0];
      const currentReqIndex = required.indexOf(currentTitle);
      if (currentReqIndex < 0) throw new Error("BLOCKED: splitLockedOutline could not locate current title index");
      const currentBlockIndex = indexByTitle.get(currentTitle);
      if (typeof currentBlockIndex !== "number") {
        throw new Error(`BLOCKED: splitLockedOutline missing top-level subparagraph block for '${currentTitle}'`);
      }

      // Context packet: list already-introduced <strong> terms from completed subparagraphs (avoid redundancy).
      const introducedTerms: string[] = [];
      for (const t of required) {
        if (t === currentTitle) break;
        const b = byTitle.get(t);
        const inner = b && typeof b === "object" ? (Array.isArray((b as any).blocks) ? (b as any).blocks : []) : [];
        if (!inner.length) continue;
        introducedTerms.push(...collectStrongTermsFromBlocks(inner));
      }
      const uniqTerms = Array.from(new Set(introducedTerms.map((x) => normalizeWs(x).toLowerCase()).filter(Boolean))).slice(0, 35);

      const targetsP = Array.isArray(praktijkTargets) ? praktijkTargets.map((t) => normalizeWs(t)).filter(Boolean) : [];
      const targetsV = Array.isArray(verdiepingTargets) ? verdiepingTargets.map((t) => normalizeWs(t)).filter(Boolean) : [];
      const requirePraktijkBox = targetsP.includes(currentTitle);
      const requireVerdiepingBox = targetsV.includes(currentTitle);

      const needImage = requireImageSuggestion && countDraftImages(sectionBlocksIn).withPrompt < 1;
      const timeoutNotes =
        llmTimeoutAttempt > 0
          ? `TIMEOUT RECOVERY (attempt ${llmTimeoutAttempt}): Keep the subparagraph SHORTER and more concise while meeting constraints.`
          : null;
      const effectiveUserInstructions =
        draftAttempt > 0
          ? [
              userInstructions,
              prevDraftFailureReason ? `Previous validation failure:\n${prevDraftFailureReason}` : null,
              mustFillTitle && mustFillTitle === currentTitle
                ? `MUST FIX: Add at least 2 *paragraph* blocks with non-empty basisHtml under '${mustFillTitle}' (2-4 short sentences each).`
                : null,
              mustBoxKind && mustBoxTitle && mustBoxTitle === currentTitle
                ? `MUST FIX: Add exactly ONE ${mustBoxKind} paragraph inside numbered subparagraph '${mustBoxTitle}'.`
                : null,
              timeoutNotes,
              "CRITICAL: You are writing ONLY the requested numbered subparagraph (do not write other numbered titles).",
            ]
              .filter((x) => typeof x === "string" && x.trim())
              .map((x) => String(x).trim())
              .join("\n\n")
          : [userInstructions, timeoutNotes].filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim()).join("\n\n");

      const system = buildSystem({ language, level, imagePromptLanguage, layoutProfile, microheadingDensity });
      const sectionNumber = sectionId;
      const subMaxTokens = (() => {
        // Derive a per-subparagraph budget from the section budget.
        const per = Math.floor(sectionMaxTokens / Math.max(1, required.length));
        return Math.max(900, Math.min(3200, Math.floor(per * 2)));
      })();

      await emitAgentJobEvent(jobId, "generating", 20, "Split-mode: drafting numbered subparagraph", {
        chapterIndex,
        sectionIndex,
        splitMode: true,
        doneCount,
        total: required.length,
        currentTitle,
        maxTokens: subMaxTokens,
        requirePraktijkBox,
        requireVerdiepingBox,
        requireImageSuggestion: needImage,
      }).catch(() => {});

      const prompt = buildNumberedSubparagraphPrompt({
        topic,
        bookTitle,
        chapterNumber: chapterIndex + 1,
        sectionNumber,
        sectionTitle: stripNumberPrefix(expectedSectionTitle) || expectedSectionTitle || `Section ${sectionNumber}`,
        numberedSubparagraphTitle: currentTitle,
        requiredNumberedSubparagraphTitles: required,
        alreadyIntroducedTerms: uniqTerms,
        userInstructions: effectiveUserInstructions,
        language,
        imagePromptLanguage,
        layoutProfile,
        microheadingDensity,
        requireImageSuggestion: needImage,
        requirePraktijkBox,
        requireVerdiepingBox,
      });

      let subDraft: { title: string; blocks: DraftBlock[] };
      try {
        const raw = await llmGenerateJson({
          provider: writeModelSpec.provider,
          model: writeModelSpec.model,
          system,
          prompt,
          maxTokens: subMaxTokens,
          tool: buildDraftNumberedSubparagraphToolSpec(currentTitle),
        });
        const title = typeof (raw as any)?.title === "string" ? String((raw as any).title).trim() : "";
        const blocks = Array.isArray((raw as any)?.blocks) ? ((raw as any).blocks as DraftBlock[]) : [];
        subDraft = { title, blocks };
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
          await emitAgentJobEvent(jobId, "generating", 25, "Split-mode: LLM call timed out; requeueing with lower maxTokens", {
            chapterIndex,
            sectionIndex,
            splitMode: true,
            currentTitle,
            llmTimeoutAttempt: nextAttempt,
            prevMaxTokens: sectionMaxTokens,
            nextMaxTokens: nextTokens,
          }).catch(() => {});
          return {
            yield: true,
            message: `Split-mode: LLM timed out; retrying with lower maxTokens (attempt ${nextAttempt}/${MAX_LLM_TIMEOUT_ATTEMPTS})`,
            payloadPatch: {
              __splitCurrentTitle: currentTitle,
              __llmTimeoutAttempt: nextAttempt,
              sectionMaxTokens: nextTokens,
            },
          };
        }
        throw e;
      }

      try {
        // Validate + deterministic fixes.
        const top: DraftBlock = { type: "subparagraph", title: normalizeWs(subDraft.title), blocks: subDraft.blocks };
        if (!top.title || normalizeWs(top.title) !== currentTitle) {
          throw new Error(
            `BLOCKED: LLM returned wrong numbered subparagraph title (got='${top.title}', expected='${currentTitle}')`,
          );
        }
        if (!Array.isArray(top.blocks) || top.blocks.length === 0) {
          throw new Error(`BLOCKED: Draft too sparse under '${currentTitle}' (basisParagraphs=0, min=2)`);
        }

        const oneDraft: DraftSection = { title: expectedSectionTitle || sectionNumber, blocks: [top] as any };
        const validateTop = () => {
          // Re-use microheading validator + its deterministic punctuation sanitization.
          assertMicroheadingsAreSingleLevel({
            draft: oneDraft,
            requiredSubparagraphTitles: [currentTitle],
            layoutProfile,
            microheadingDensity,
          });

          // Basic density check for this numbered subparagraph.
          const minBasisPerSub = layoutProfile === "sparse" ? 1 : 2;
          // Deterministic salvage: if the model wrote lists/steps but not enough paragraphs,
          // convert some list/steps items into paragraph blocks so density checks can pass.
          coerceListItemsIntoBasisParagraphs({ blocksRaw: top.blocks, minBasis: minBasisPerSub });
          const basisCount = countBasisParagraphs(top.blocks);
          if (basisCount < minBasisPerSub) {
            throw new Error(`BLOCKED: Draft too sparse under '${currentTitle}' (basisParagraphs=${basisCount}, min=${minBasisPerSub})`);
          }

          // Box targets must be satisfied within this numbered subparagraph if required.
          if (
            requirePraktijkBox &&
            !hasBoxHtmlWithinNumberedSubparagraph({ draft: oneDraft, numberedSubparagraphTitle: currentTitle, kind: "praktijkHtml" })
          ) {
            throw new Error(`BLOCKED: Missing praktijkHtml for target numbered subparagraph '${currentTitle}'`);
          }
          if (
            requireVerdiepingBox &&
            !hasBoxHtmlWithinNumberedSubparagraph({ draft: oneDraft, numberedSubparagraphTitle: currentTitle, kind: "verdiepingHtml" })
          ) {
            throw new Error(`BLOCKED: Missing verdiepingHtml for target numbered subparagraph '${currentTitle}'`);
          }

          if (needImage) {
            const counts = countDraftImages([top]);
            if (counts.withPrompt < 1) {
              throw new Error("BLOCKED: Draft missing image suggestions (need at least 1 images[].suggestedPrompt)");
            }
          }
        };

        const MAX_REPAIR_ATTEMPTS = 2;
        let lastErr = "";
        for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
          try {
            validateTop();
            lastErr = "";
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
            if (attempt >= MAX_REPAIR_ATTEMPTS) break;
            const repaired = await attemptRepairForReason({
              reason: lastErr,
              draft: oneDraft,
              provider: writeModelSpec.provider,
              model: writeModelSpec.model,
              system,
              bookTitle,
              topic,
              chapterNumber: chapterIndex + 1,
              sectionNumber,
              sectionTitle: stripNumberPrefix(expectedSectionTitle) || expectedSectionTitle || `Section ${sectionNumber}`,
              language,
              userInstructions,
              jobId,
              chapterIndex,
              sectionIndex,
              splitMode: true,
            });
            if (!repaired) break;
          }
        }
        if (lastErr) throw new Error(lastErr);

        // Convert this numbered subparagraph into skeleton blocks and persist progress.
        const skTop = convertDraftBlockToSkeletonBlock({
          bookId,
          chapterIndex,
          sectionIndex,
          keyParts: [sectionIndex + 1, currentReqIndex + 1],
          block: top,
        });
        sectionBlocksIn[currentBlockIndex] = skTop;

        (sk as any).chapters[chapterIndex] = {
          ...(chapter as any),
          sections: sections.map((s: any, idx: number) =>
            idx === sectionIndex ? { ...(sectionRaw as any), blocks: sectionBlocksIn } : s),
        };
        renumberChapterImages((sk as any).chapters[chapterIndex], chapterIndex + 1);

        const v1 = validateBookSkeleton(sk);
        if (!v1.ok) throw new Error(`BLOCKED: Updated skeleton validation failed (${v1.issues.length} issue(s))`);

        await emitAgentJobEvent(jobId, "storage_write", 55, "Split-mode: saving partial skeleton", {
          skeletonPath,
          splitMode: true,
          doneCount: doneCount + 1,
          total: required.length,
          currentTitle,
        }).catch(() => {});

        const saveRes = await callEdgeAsAgent({
          orgId: organizationId,
          path: "book-version-save-skeleton",
          body: {
            bookId,
            bookVersionId,
            skeleton: v1.skeleton,
            note: `BookGen Pro split: ch${chapterIndex + 1} sec${sectionIndex + 1} ${currentTitle}`,
            compileCanonical: false,
          },
        });
        if (saveRes?.ok !== true) throw new Error("Failed to save skeleton");

        const nextTitle = missingTitles.length >= 2 ? missingTitles[1] : null;
        return {
          yield: true,
          message: `Split-mode: wrote ${doneCount + 1}/${required.length} numbered subparagraphs; continuing`,
          payloadPatch: {
            __splitCurrentTitle: nextTitle || currentTitle,
            __draftAttempt: 0,
            __draftFailureReason: null,
            __draftMustFillTitle: mustFillTitle && mustFillTitle !== currentTitle ? mustFillTitle : null,
            __draftMustBoxKind: mustBoxTitle && mustBoxTitle !== currentTitle ? mustBoxKind : null,
            __draftMustBoxTitle: mustBoxTitle && mustBoxTitle !== currentTitle ? mustBoxTitle : null,
            __llmTimeoutAttempt: 0,
            sectionMaxTokens: null,
          },
        };
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        const MAX_DRAFT_ATTEMPTS = 4;
        const nextAttempt = draftAttempt + 1;
        if (nextAttempt > MAX_DRAFT_ATTEMPTS) {
          throw new Error(`BLOCKED: Draft did not meet requirements after ${MAX_DRAFT_ATTEMPTS} attempts: ${reason.slice(0, 800)}`);
        }

        await emitAgentJobEvent(jobId, "generating", 25, "Split-mode: draft did not meet requirements; requeueing for retry", {
          chapterIndex,
          sectionIndex,
          splitMode: true,
          currentTitle,
          draftAttempt: nextAttempt,
          reason: reason.slice(0, 800),
        }).catch(() => {});

        const mustFill = parseSparseUnderTitle(reason);
        const mustBox = parseMissingBoxTarget(reason);
        return {
          yield: true,
          message: "Split-mode: draft did not meet requirements; retrying via requeue",
          payloadPatch: {
            __splitCurrentTitle: currentTitle,
            __draftAttempt: nextAttempt,
            __draftFailureReason: reason.slice(0, 800),
            ...(mustFill ? { __draftMustFillTitle: mustFill } : {}),
            ...(mustBox ? { __draftMustBoxKind: mustBox.kind, __draftMustBoxTitle: mustBox.title } : {}),
          },
        };
      }
    }

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

    let validationError = "";
    const MAX_REPAIR_ATTEMPTS = 2;
    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      try {
        validateAll(draft);
        validationError = "";
        break;
      } catch (e) {
        validationError = e instanceof Error ? e.message : String(e);
        if (attempt >= MAX_REPAIR_ATTEMPTS) break;
        const repaired = await attemptRepairForReason({
          reason: validationError,
          draft,
          provider: writeModelSpec.provider,
          model: writeModelSpec.model,
          system,
          bookTitle,
          topic,
          chapterNumber: chapterIndex + 1,
          sectionNumber,
          sectionTitle: stripNumberPrefix(expectedSectionTitle) || expectedSectionTitle || `Section ${sectionNumber}`,
          language,
          userInstructions,
          jobId,
          chapterIndex,
          sectionIndex,
          splitMode: false,
        });
        if (!repaired) break;
      }
    }
    if (validationError) {
      const reason = validationError;

      // Recovery: Some Anthropic tool outputs degrade to `{ title, blocks: [] }` for locked outlines.
      // This leads to repeated `got=0` failures. Prefer an Anthropic-only recovery:
      // force split-mode next attempt (one numbered subparagraph per tick) instead of switching providers.
      const emptyBlocksMismatch =
        requiredSubparagraphTitles.length > 0 &&
        reason.includes("BLOCKED: Numbered subparagraph count mismatch (got=0");

      const forceSplitLockedOutlineForRetry = emptyBlocksMismatch && writeModelSpec.provider === "anthropic";
      if (forceSplitLockedOutlineForRetry) {
        await emitAgentJobEvent(jobId, "generating", 23, "Empty outline; forcing split-mode retry (Anthropic-only)", {
          chapterIndex,
          sectionIndex,
          expectedSubparagraphs: requiredSubparagraphTitles.length,
          splitLockedOutline: true,
        }).catch(() => {});
      }

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
          ...(mustFill ? { __draftMustFillTitle: mustFill } : {}),
          ...(mustBox ? { __draftMustBoxKind: mustBox.kind, __draftMustBoxTitle: mustBox.title } : {}),
          ...(forceSplitLockedOutlineForRetry ? { splitLockedOutline: true } : {}),
        },
      };
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

