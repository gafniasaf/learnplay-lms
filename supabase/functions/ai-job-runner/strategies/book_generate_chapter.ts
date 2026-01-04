/**
 * book_generate_chapter (Factory / ai_agent_jobs)
 *
 * Generates content for a single chapter in a skeleton-first pipeline and chains the next chapter job.
 *
 * - Loads skeleton.json from Storage
 * - Uses an LLM to draft sections/blocks and image placeholder suggestions
 * - Writes updates back to skeleton (authoring source of truth)
 * - Compiles deterministic canonical and uploads canonical.json (root path) for render worker stability
 * - Enqueues next chapter job until completion
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

function normalizeLanguageLabel(code: string): string {
  const s = (code || "").trim().toLowerCase();
  if (!s) return "the book language";
  // keep it simple; we don't need full locale support for prompt text
  if (s === "nl" || s.startsWith("nl-")) return "Dutch";
  if (s === "en" || s.startsWith("en-")) return "English";
  if (s === "de" || s.startsWith("de-")) return "German";
  if (s === "fr" || s.startsWith("fr-")) return "French";
  if (s === "es" || s.startsWith("es-")) return "Spanish";
  return s;
}

function parseModelSpec(raw: unknown): { provider: Provider; model: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) {
    throw new Error("BLOCKED: writeModel is REQUIRED");
  }
  const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const provider = parts[0] as Provider;
    const model = parts.slice(1).join(":");
    if (provider !== "openai" && provider !== "anthropic") {
      throw new Error("BLOCKED: writeModel provider must be 'openai' or 'anthropic' (use 'openai:<model>' or 'anthropic:<model>')");
    }
    if (!model) throw new Error("BLOCKED: writeModel model is missing");
    return { provider, model };
  }
  throw new Error("BLOCKED: writeModel must be prefixed with provider (use 'openai:<model>' or 'anthropic:<model>')");
}

async function llmGenerateJson(opts: { provider: Provider; model: string; system: string; prompt: string; maxTokens?: number }): Promise<any> {
  const { provider, model, system, prompt, maxTokens = 8000 } = opts;
  const timeoutMs = 110_000;

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
  const toolName = "draft_book_chapter";
  // Keep the tool schema intentionally minimal (we validate/enforce the shape ourselves later).
  // The key property is: Anthropic returns structured JSON arguments for tool use, avoiding brittle
  // “extract JSON from text” parsing failures (e.g. due to unescaped quotes/newlines in HTML strings).
  const tools = [
    {
      name: toolName,
      description:
        "Return ONLY the chapter draft JSON object (chapterTitle, sections, openerImage). " +
        "All HTML must be inline and stored in string fields (basisHtml/praktijkHtml/verdiepingHtml).",
      input_schema: {
        type: "object",
        additionalProperties: true,
        required: ["chapterTitle", "sections"],
        properties: {
          chapterTitle: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["title", "blocks"],
              properties: {
                title: { type: "string" },
                blocks: { type: "array", items: { type: "object", additionalProperties: true } },
              },
            },
          },
          openerImage: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: true,
                properties: {
                  suggestedPrompt: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
              },
            ],
          },
        },
      },
    },
  ];
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

  // Preferred path: tool-based structured output (no JSON parsing from text needed).
  const toolUse = (Array.isArray((data as any)?.content) ? (data as any).content : []).find(
    (b: any) => b?.type === "tool_use" && b?.name === toolName && b?.input && typeof b.input === "object",
  );
  if (toolUse?.input && typeof toolUse.input === "object") {
    return toolUse.input;
  }

  // Back-compat fallback: some models/configs may still return plain text. Parse it, but fail loudly with context.
  const out = (Array.isArray(data?.content) ? data.content : [])
    .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
    .map((b: any) => b.text)
    .join("\n");
  if (!out.trim()) throw new Error("LLM(anthropic) returned empty content");
  try {
    return extractJsonFromText(out);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const preview = out.replace(/\s+/g, " ").slice(0, 600);
    throw new Error(`LLM(anthropic) invalid_json (${reason}). Output preview: ${preview}`);
  }
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

function normalizeInlineHtml(raw: unknown): string {
  // Keep generation simple: inline HTML only; the renderer sanitizes.
  const s = typeof raw === "string" ? raw.trim() : "";
  return s;
}

function ensureBoxLeadSpan(raw: unknown, opts: { maxWords: number }): string | null {
  const s0 = typeof raw === "string" ? raw.trim() : "";
  if (!s0) return null;

  // Already has a lead span up front
  if (/^<\s*span\b[^>]*class\s*=\s*\"[^\"]*box-lead[^\"]*\"/i.test(s0)) return s0;
  if (/^<\s*span\b[^>]*class\s*=\s*'[^']*box-lead[^']*'/i.test(s0)) return s0;

  // Common legacy lead style: <strong>Lead:</strong> Rest...
  const mStrong = s0.match(/^<\s*strong\s*>\s*([^<]{1,120}?)\s*:?\s*<\s*\/\s*strong\s*>\s*(.*)$/i);
  if (mStrong) {
    const lead = String(mStrong[1] || "").trim();
    const rest = String(mStrong[2] || "").trim();
    if (!lead) return s0;
    return `<span class="box-lead">${lead}</span>${rest ? ` ${rest}` : ""}`;
  }

  // Other inline-lead patterns: <span>Lead:</span> Rest... (or <em>/<b>/<i>)
  const mTag = s0.match(/^<\s*(span|em|b|i)\b[^>]*>\s*([^<]{1,120}?)\s*:?\s*<\s*\/\s*\1\s*>\s*(.*)$/i);
  if (mTag) {
    const lead = String(mTag[2] || "").trim();
    const rest = String(mTag[3] || "").trim();
    if (!lead) return s0;
    return `<span class="box-lead">${lead}</span>${rest ? ` ${rest}` : ""}`;
  }

  // If the string starts with a tag we don't understand, avoid corrupting HTML.
  if (s0.startsWith("<")) return s0;

  const words = s0.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return null;
  const n = Math.max(1, Math.min(Math.floor(opts.maxWords || 2), words.length));
  const lead = words.slice(0, n).join(" ");
  const rest = words.slice(n).join(" ");
  return `<span class="box-lead">${lead}</span>${rest ? ` ${rest}` : ""}`;
}

function safeItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => !!x)
    .slice(0, 50);
}

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

type DraftChapter = {
  chapterTitle: string;
  sections: Array<{
    title: string;
    blocks: DraftBlock[];
  }>;
  openerImage?: { suggestedPrompt?: string | null } | null;
};

type ChapterOutline = {
  chapterTitle?: string;
  sections: Array<{
    title: string;
    numberedSubparagraphTitles: string[];
  }>;
};

function normalizeWs(s: string): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function stripNumberPrefix(title: string): string {
  return normalizeWs(title).replace(/^\d+(?:\.\d+)*\s+/, "").trim();
}

function stripChapterNumberPrefix(title: string): string {
  return normalizeWs(title).replace(/^\d+\.\s+/, "").trim();
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
    .slice(0, 6);

  const hasSectionTitles = sections.length > 0;
  if (!lockChapterTitle && !hasSectionTitles) return null;

  return {
    ...(lockChapterTitle ? { chapterTitle } : {}),
    sections,
  };
}

// House style reference:
// `canonical_book_PASS2.assembled_prince.html` (Prince pass2) demonstrates the target voice/structure:
// - short sentences
// - clear definitions with "Dit heet..." / "Dat betekent..."
// - bold key terms on first mention
// - praktijk/verdieping are boxed and start with a short "lead" phrase (first 1-2 words)
const PRINCE_PASS2_MBO_HOUSE_STYLE = [
  "House style (match canonical_book_PASS2 Prince PASS2):",
  "- Use short, clear sentences and active voice.",
  "- Prefer: 'X is ...', 'Dit heet ...', 'Dat betekent ...'.",
  "- Bold new key terms on first mention with <strong>.",
  "- Use 1 simple analogy when helpful (e.g. 'een beetje zoals ...').",
  "- Keep titles short (micro-title vibe): 2-6 words, no punctuation at the end.",
  "- Do NOT include the labels 'In de praktijk:' or 'Verdieping:' in the text; the renderer adds them.",
  "- Praktijk text should read like a short workplace scenario in second person ('Je ...' / 'Bij een ...' / 'Een ...').",
  "- For praktijk/verdieping: start with a lead phrase wrapped as <span class=\"box-lead\">LEAD</span>.",
].join("\n") + "\n";

function buildSystem(opts: {
  language: string;
  level: "n3" | "n4";
  imagePromptLanguage: ImagePromptLanguage;
  mboProfile: "mbo_generic";
}) {
  const { language, level, imagePromptLanguage } = opts;
  const langLabel = normalizeLanguageLabel(language);
  const imageLangLabel = imagePromptLanguage === "book" ? langLabel : "English";
  const depthGuidance =
    level === "n3"
      ? (
        "Depth policy (MBO N3): keep it practical and accessible.\n" +
        "- Avoid heavy theory-dumps.\n" +
        "- Do NOT introduce advanced equations/constants unless the topic truly requires it.\n" +
        "- If you include any formula, keep it very simple and explain it in plain language.\n"
      )
      : (
        "Depth policy (MBO N4): you may go slightly deeper, but stay teachable.\n" +
        "- You may include at most ONE simple formula OR named law if it helps learning.\n" +
        "- Always explain jargon and any formula in plain language.\n"
      );

  return (
    "You are BookGen Pro.\n" +
    "You write educational book chapters as inline HTML strings (no <p> tags).\n" +
    "Allowed inline tags: <strong>, <em>, <b>, <i>, <sup>, <sub>, <span>, <br/>.\n" +
    "Do NOT use any <<MARKER>> tokens at all.\n" +
    "Write for MBO students: clear, concrete, and example-driven.\n" +
    "Use short sentences. Define terms the first time you use them.\n" +
    PRINCE_PASS2_MBO_HOUSE_STYLE +
    depthGuidance +
    "Output MUST be valid JSON ONLY (no markdown).\n" +
    `Book language: ${language} (${langLabel})\n` +
    `Image suggestedPrompt language: ${imageLangLabel}\n` +
    `Level: ${level}\n`
  );
}

function buildPrompt(opts: {
  topic: string;
  bookTitle: string;
  chapterNumber: number;
  chapterCount: number;
  userInstructions?: string | null;
  level: "n3" | "n4";
  language: string;
  imagePromptLanguage: ImagePromptLanguage;
  outline?: ChapterOutline | null;
}) {
  const { topic, bookTitle, chapterNumber, chapterCount, userInstructions, level, language, imagePromptLanguage, outline } = opts;
  const langLabel = normalizeLanguageLabel(language);
  const imageLangLabel = imagePromptLanguage === "book" ? langLabel : "English";

  const outlineText =
    outline && Array.isArray(outline.sections) && outline.sections.length
      ? (
        "\nOUTLINE (MUST FOLLOW):\n" +
        (typeof outline.chapterTitle === "string" && outline.chapterTitle.trim()
          ? `- Chapter title (DO NOT change): ${outline.chapterTitle.trim()}\n`
          : "") +
        outline.sections
          .map((s, i) => {
            const st = typeof s?.title === "string" ? s.title.trim() : "";
            const subs = Array.isArray(s?.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles : [];
            const subsLine = subs.length ? `\n    - Numbered subparagraphs (h3): ${subs.join(" | ")}` : "";
            return `- Section ${i + 1}: ${st}${subsLine}`;
          })
          .join("\n") +
        "\n\n"
      )
      : "";

  const verdiepingGuidance =
    level === "n3"
      ? (
        "- verdiepingHtml is OPTIONAL. If you include it, keep it short (1-3 sentences), practical, and explain terms.\n" +
        "- Avoid equations and named scientific laws unless the topic truly requires it.\n"
      )
      : (
        "- verdiepingHtml is OPTIONAL. If you include it, keep it teachable and explain jargon.\n" +
        "- You may include ONE simple formula OR named law if helpful, but explain it plainly.\n"
      );

  const outlineSectionCount =
    outline && Array.isArray(outline.sections) && outline.sections.length ? outline.sections.length : null;

  const sectionCountConstraint = outlineSectionCount
    ? `- Return EXACTLY ${outlineSectionCount} sections, in the same order as the outline.\n`
    : "- Make 2-4 sections.\n";

  const titleConstraints = outlineSectionCount
    ? (
      "- chapterTitle MUST match the outline (ignore the topic if it conflicts).\n" +
      "- Each sections[i].title MUST match the outline's section title.\n"
    )
    : (
      "- Section titles should read like micro-titles (short noun phrase).\n"
    );

  const structureConstraints = outlineSectionCount
    ? (
      "- In each section, create 4-9 numbered subparagraph blocks (type='subparagraph') with titles like '1.4.2 Diffusie'.\n" +
      "- If the outline lists numbered subparagraph titles, you MUST include them EXACTLY as subparagraph.title.\n" +
      "- Inside each numbered subparagraph, add 1 microheading as a nested subparagraph (type='subparagraph') with a SHORT title (2-6 words, no punctuation).\n"
    )
    : (
      "- Each section: 2-5 blocks.\n" +
      "- Include microheadings using subparagraph blocks (type='subparagraph'). Aim for 1-2 subparagraphs per section.\n" +
      "- subparagraph.title must be short (2-6 words) and have no punctuation at the end.\n"
    );

  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  \"chapterTitle\": string,\n' +
    '  \"sections\": [\n' +
    "    {\n" +
    '      \"title\": string,\n' +
    '      \"blocks\": [\n' +
    "        {\n" +
    '          \"type\": \"subparagraph\",\n' +
    '          \"title\": string,\n' +
    '          \"blocks\": [ /* subparagraph | paragraph | list | steps */ ]\n' +
    "        } |\n" +
    "        {\n" +
    '          \"type\": \"paragraph\",\n' +
    '          \"basisHtml\": string,\n' +
    '          \"praktijkHtml\"?: string,\n' +
    '          \"verdiepingHtml\"?: string,\n' +
    '          \"images\"?: [{\"alt\"?: string, \"caption\"?: string, \"layoutHint\"?: string, \"suggestedPrompt\"?: string}]\n' +
    "        } |\n" +
    "        {\n" +
    '          \"type\": \"list\",\n' +
    '          \"ordered\"?: boolean,\n' +
    '          \"items\": string[],\n' +
    '          \"images\"?: [{\"alt\"?: string, \"caption\"?: string, \"layoutHint\"?: string, \"suggestedPrompt\"?: string}]\n' +
    "        } |\n" +
    "        {\n" +
    '          \"type\": \"steps\",\n' +
    '          \"items\": string[],\n' +
    '          \"images\"?: [{\"alt\"?: string, \"caption\"?: string, \"layoutHint\"?: string, \"suggestedPrompt\"?: string}]\n' +
    "        }\n" +
    "      ]\n" +
    "    }\n" +
    "  ],\n" +
    '  \"openerImage\"?: {\"suggestedPrompt\"?: string} | null\n' +
    "}\n\n" +
    `Book title: ${bookTitle}\n` +
    `Topic: ${topic}\n` +
    `Chapter: ${chapterNumber} of ${chapterCount}\n` +
    `Book language: ${language} (${langLabel})\n` +
    `Image suggestedPrompt language: ${imageLangLabel}\n` +
    (userInstructions ? `User instructions: ${userInstructions}\n` : "") +
    outlineText +
    "\nConstraints:\n" +
    sectionCountConstraint +
    titleConstraints +
    structureConstraints +
    "- Use the book language for chapterTitle, section titles, basisHtml, praktijkHtml, verdiepingHtml, alt, caption.\n" +
    `- suggestedPrompt MUST be written in ${imageLangLabel}.\n` +
    "- Include 1-2 image suggestions across the chapter via images[].suggestedPrompt.\n" +
    "- suggestedPrompt must be concise and specific (no camera brand names, no artist names).\n" +
    "- basisHtml: 2-5 short sentences. Define key terms. Prefer 'Dit heet...' / 'Dat betekent...'.\n" +
    "- praktijkHtml: 2-4 short sentences. Workplace scenario, second person.\n" +
    "- praktijkHtml MUST start with: <span class=\"box-lead\">LEAD</span> ... (LEAD is 1-4 words).\n" +
    "- verdiepingHtml: OPTIONAL. If present, keep it simple and step-by-step.\n" +
    "- verdiepingHtml MUST start with: <span class=\"box-lead\">LEAD</span> ... (LEAD is 1-6 words).\n" +
    "- Do NOT include 'In de praktijk:' or 'Verdieping:' in the text.\n" +
    verdiepingGuidance
  );
}

function assignIdsAndImages(opts: {
  bookId: string;
  chapterIndex: number;
  draft: DraftChapter;
}): { title: string; sections: any[]; openerImageSrc: string | null } {
  const { bookId, chapterIndex, draft } = opts;
  const chNum = chapterIndex + 1;
  const chapterTitle = typeof draft.chapterTitle === "string" ? draft.chapterTitle.trim() : `Hoofdstuk ${chNum}`;

  let imageCounter = 0;
  const sections = (Array.isArray(draft.sections) ? draft.sections : []).slice(0, 6).map((s, si) => {
    const sectionNumber = `${chNum}.${si + 1}`;
    const rawSectionTitle = typeof (s as any)?.title === "string" ? String((s as any).title).trim() : "";
    const cleanSectionTitle = rawSectionTitle.replace(/^\d+(?:\.\d+)*\s+/, "").trim();
    const numberedSectionTitle = cleanSectionTitle ? `${sectionNumber} ${cleanSectionTitle}` : sectionNumber;

    const blocksIn = Array.isArray((s as any)?.blocks) ? (s as any).blocks : [];

    const toImages = (imgsRaw: any[], blockKey: string): SkeletonImage[] | null => {
      if (!imgsRaw.length) return null;
      const safeKey = String(blockKey || "").replace(/[^a-z0-9_]+/gi, "_");
      return imgsRaw.slice(0, 6).map((img: any, ii: number) => {
        imageCounter += 1;
        const src = `figures/${bookId}/ch${chNum}/img_${safeKey}_${ii + 1}.png`;
        return {
          src,
          alt: typeof img?.alt === "string" ? img.alt : null,
          caption: typeof img?.caption === "string" ? img.caption : null,
          figureNumber: `${chNum}.${imageCounter}`,
          layoutHint: typeof img?.layoutHint === "string" ? img.layoutHint : null,
          suggestedPrompt: typeof img?.suggestedPrompt === "string" ? img.suggestedPrompt : null,
        };
      });
    };

    const convertBlock = (b: any, keyParts: number[]): any => {
      const t = typeof b?.type === "string" ? b.type : "";
      const key = keyParts.join("_"); // stable key for ids + image filenames
      const blockId = `ch-${chNum}-b-${key}`;

      if (t === "subparagraph") {
        const title = typeof b?.title === "string" ? b.title.trim() : "";
        const innerIn = Array.isArray(b?.blocks) ? b.blocks : [];
        const innerBlocks = innerIn.slice(0, 20).map((ib: any, ii: number) => convertBlock(ib, keyParts.concat([ii + 1])));
        return {
          type: "subparagraph",
          id: `ch-${chNum}-sub-${key}`,
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

      // Unknown block: coerce to paragraph
      return {
        type: "paragraph",
        id: blockId,
        basisHtml: normalizeInlineHtml((b as any)?.basisHtml ?? ""),
      };
    };

    const blocksRaw = blocksIn.slice(0, 20).map((b: any, bi: number) => convertBlock(b, [si + 1, bi + 1]));

    // PASS2-style structure: each section has numbered subparagraph headings (e.g. 1.1.1),
    // and may include unnumbered micro-titles.
    //
    // If the draft did not explicitly include numbered subparagraph headings, wrap the section content
    // in a single numbered subparagraph so the PDF shows subparagraph numbers.
    const hasNumberedSubparagraph = blocksRaw.some((b: any) => {
      if (!b || typeof b !== "object") return false;
      if (b.type !== "subparagraph") return false;
      const t = typeof b.title === "string" ? b.title.trim() : "";
      return /^\d+(?:\.\d+){2,}\s+/.test(t); // e.g. 1.1.1 Title
    });

    let blocks: any[] = blocksRaw;
    if (!hasNumberedSubparagraph && blocksRaw.length) {
      const subNum = `${sectionNumber}.1`;
      const subTitle = `${subNum} ${cleanSectionTitle || "Inleiding"}`;

      // Ensure at least one micro-title exists inside the subparagraph (PASS2 uses micro-titles heavily).
      const hasMicroTitle = blocksRaw.some((b: any) => b && typeof b === "object" && b.type === "subparagraph" && !/^\d+(?:\.\d+){2,}\s+/.test(String(b.title || "").trim()));
      const innerBlocks = hasMicroTitle
        ? blocksRaw
        : [{
            type: "subparagraph",
            title: cleanSectionTitle || "Kernidee",
            blocks: blocksRaw,
          }];

      blocks = [{
        type: "subparagraph",
        id: subNum,
        title: subTitle,
        blocks: innerBlocks,
      }];
    }

    return {
      // Use PASS2-like ids so links/bookmarks are stable and the renderer can show numbers.
      id: sectionNumber,
      title: numberedSectionTitle,
      blocks,
    };
  });

  // We set an opener placeholder key so renderers can request/resolve it later.
  const openerPrompt = typeof draft?.openerImage?.suggestedPrompt === "string" ? draft.openerImage.suggestedPrompt.trim() : "";
  const openerImageSrc = openerPrompt ? `figures/${bookId}/ch${chNum}/opener.png` : null;

  return { title: chapterTitle, sections, openerImageSrc };
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
    if (chapterIndex < 0) {
      throw new Error("BLOCKED: chapterIndex must be >= 0");
    }
    if (chapterIndex >= chapterCount) throw new Error(`BLOCKED: chapterIndex out of range (${chapterIndex} >= ${chapterCount})`);

    const topic = requireString(p, "topic");
    const language = requireString(p, "language");
    const level = requireEnum(p.level, ["n3", "n4"] as const, "level");
    const userInstructions = optionalString(p, "userInstructions");

    const imagePromptLanguage =
      optionalEnum(p.imagePromptLanguage, ["en", "book"] as const) ?? "en";

    const writeModelSpec = parseModelSpec(p.writeModel);

    await emitAgentJobEvent(jobId, "generating", 5, `Generating chapter ${chapterIndex + 1}/${chapterCount}`, {
      bookId,
      bookVersionId,
      chapterIndex,
      writeModel: `${writeModelSpec.provider}:${writeModelSpec.model}`,
    }).catch(() => {});

    // 1) Load skeleton
    const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
    const skRaw = await downloadJson(adminSupabase, "books", skeletonPath);
    const v0 = validateBookSkeleton(skRaw);
    if (!v0.ok) {
      throw new Error(`BLOCKED: Existing skeleton is invalid (${v0.issues.length} issue(s))`);
    }
    const sk: BookSkeletonV1 = v0.skeleton;

    const chapters = Array.isArray((sk as any).chapters) ? (sk as any).chapters : [];
    if (!chapters[chapterIndex]) {
      throw new Error(`BLOCKED: Skeleton missing chapter at index ${chapterIndex}`);
    }

    const existingChapter = chapters[chapterIndex] as any;
    const outline = extractOutlineFromSkeletonChapter(existingChapter, chapterIndex + 1);

    // 2) Load book title (for better prompts)
    const { data: bookRow, error: bookErr } = await adminSupabase.from("books").select("title").eq("id", bookId).single();
    if (bookErr || !bookRow) throw new Error(bookErr?.message || "Book not found");
    const bookTitle = String((bookRow as any).title || "").trim();

    await emitAgentJobEvent(jobId, "generating", 20, "Calling LLM to draft chapter content", {
      chapterIndex,
    }).catch(() => {});

    const system = buildSystem({ language, level, imagePromptLanguage, mboProfile: "mbo_generic" });
    const prompt = buildPrompt({
      topic,
      bookTitle,
      chapterNumber: chapterIndex + 1,
      chapterCount,
      userInstructions,
      level,
      language,
      imagePromptLanguage,
      outline,
    });
    const draft = (await llmGenerateJson({
      provider: writeModelSpec.provider,
      model: writeModelSpec.model,
      system,
      prompt,
      maxTokens: 8000,
    })) as DraftChapter;

    // If we have an outline from the skeleton, enforce hierarchy so we never promote a subparagraph into a chapter title.
    if (outline && Array.isArray(outline.sections) && outline.sections.length) {
      const expectedChapter = typeof outline.chapterTitle === "string" ? outline.chapterTitle.trim() : "";
      if (expectedChapter) {
        const a = stripChapterNumberPrefix(draft?.chapterTitle || "");
        const b = stripChapterNumberPrefix(expectedChapter);
        if (!a || !b || a !== b) {
          throw new Error(`BLOCKED: LLM returned wrong chapterTitle for locked outline (got='${a}', expected='${b}')`);
        }
      }

      const draftSections = Array.isArray((draft as any)?.sections) ? (draft as any).sections : [];
      if (draftSections.length !== outline.sections.length) {
        throw new Error(`BLOCKED: LLM returned ${draftSections.length} sections but outline requires ${outline.sections.length}`);
      }

      for (let i = 0; i < outline.sections.length; i++) {
        const expectedTitle = outline.sections[i]?.title || "";
        const gotTitle = typeof draftSections[i]?.title === "string" ? draftSections[i].title : "";
        if (stripNumberPrefix(gotTitle) !== stripNumberPrefix(expectedTitle)) {
          throw new Error(`BLOCKED: Section title mismatch at index ${i} (got='${gotTitle}', expected='${expectedTitle}')`);
        }

        const requiredSubs = Array.isArray(outline.sections[i]?.numberedSubparagraphTitles)
          ? outline.sections[i].numberedSubparagraphTitles
          : [];
        if (requiredSubs.length) {
          const blocks = Array.isArray(draftSections[i]?.blocks) ? draftSections[i].blocks : [];
          const gotSubs = blocks
            .filter((b: any) => b && typeof b === "object" && b.type === "subparagraph")
            .map((b: any) => (typeof b.title === "string" ? normalizeWs(b.title) : ""))
            .filter((t: string) => /^\d+(?:\.\d+){2,}\s+/.test(t));
          for (const req of requiredSubs) {
            if (!gotSubs.includes(normalizeWs(req))) {
              throw new Error(`BLOCKED: Missing required numbered subparagraph '${req}' in section '${expectedTitle}'`);
            }
          }
        }
      }
    }

    // 3) Apply updates to skeleton chapter
    const { title: chapterTitle, sections: newSections, openerImageSrc } = assignIdsAndImages({
      bookId,
      chapterIndex,
      draft,
    });

    const finalChapterTitle =
      outline && typeof outline.chapterTitle === "string" && outline.chapterTitle.trim()
        ? outline.chapterTitle.trim()
        : chapterTitle;

    const existingSections = Array.isArray(existingChapter?.sections) ? existingChapter.sections : [];
    const mergedSections = newSections.concat(existingSections.slice(newSections.length));

    (sk as any).chapters[chapterIndex] = {
      ...(sk as any).chapters[chapterIndex],
      id: (sk as any).chapters[chapterIndex]?.id || `ch-${chapterIndex + 1}`,
      number: (sk as any).chapters[chapterIndex]?.number || (chapterIndex + 1),
      title: finalChapterTitle,
      ...(openerImageSrc ? { openerImageSrc } : {}),
      sections: mergedSections,
    };

    const v1 = validateBookSkeleton(sk);
    if (!v1.ok) {
      throw new Error(`BLOCKED: Updated skeleton validation failed (${v1.issues.length} issue(s))`);
    }

    await emitAgentJobEvent(jobId, "storage_write", 60, "Saving skeleton + compiling canonical", {
      skeletonPath,
    }).catch(() => {});

    // 4) Save skeleton (snapshot + latest) and compiled canonical pointer via edge function
    const saveRes = await callEdgeAsAgent({
      orgId: organizationId,
      path: "book-version-save-skeleton",
      body: { bookId, bookVersionId, skeleton: v1.skeleton, note: `BookGen Pro: chapter ${chapterIndex + 1}`, compileCanonical: true },
    });
    if (saveRes?.ok !== true) throw new Error("Failed to save skeleton");

    // 5) Upload canonical.json at the root path (required by book-worker input gate)
    const canonicalPath = `${bookId}/${bookVersionId}/canonical.json`;
    const compiled = compileSkeletonToCanonical(v1.skeleton);
    await uploadJson(adminSupabase, "books", canonicalPath, compiled, true);

    // 6) Chain: enqueue next chapter or finish
    if (chapterIndex < chapterCount - 1) {
      const nextIndex = chapterIndex + 1;
      await emitAgentJobEvent(jobId, "generating", 75, "Enqueuing next chapter job", { nextIndex }).catch(() => {});

      const { data: queued, error: enqueueErr } = await adminSupabase
        .from("ai_agent_jobs")
        .insert({
          organization_id: organizationId,
          job_type: "book_generate_chapter",
          status: "queued",
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
            writeModel: typeof p.writeModel === "string" ? p.writeModel : null,
          },
        })
        .select("id")
        .single();
      if (enqueueErr || !queued?.id) throw new Error(enqueueErr?.message || "Failed to enqueue next chapter job");

      await emitAgentJobEvent(jobId, "done", 100, "Chapter generated (next queued)", {
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
}


