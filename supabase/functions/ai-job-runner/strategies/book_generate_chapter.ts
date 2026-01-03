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
  const { provider, model, system, prompt, maxTokens = 3600 } = opts;
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
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(anthropic) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
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

function buildSystem({ language, level }: { language: string; level: "n3" | "n4" }) {
  return (
    "You are BookGen Pro.\n" +
    "You write educational book chapters as inline HTML strings (no <p> tags).\n" +
    "Allowed inline tags: <strong>, <em>, <b>, <i>, <sup>, <sub>, <span>, <br/>.\n" +
    "Do NOT use any <<MARKER>> tokens at all.\n" +
    "Output MUST be valid JSON ONLY (no markdown).\n" +
    `Language: ${language}\n` +
    `Level: ${level}\n`
  );
}

function buildPrompt(opts: {
  topic: string;
  bookTitle: string;
  chapterNumber: number;
  chapterCount: number;
  userInstructions?: string | null;
}) {
  const { topic, bookTitle, chapterNumber, chapterCount, userInstructions } = opts;

  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  \"chapterTitle\": string,\n' +
    '  \"sections\": [\n' +
    "    {\n" +
    '      \"title\": string,\n' +
    '      \"blocks\": [\n' +
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
    (userInstructions ? `User instructions: ${userInstructions}\n` : "") +
    "\nConstraints:\n" +
    "- Make 2-4 sections.\n" +
    "- Each section: 2-4 blocks.\n" +
    "- Include 1-2 image suggestions across the chapter via images[].suggestedPrompt.\n" +
    "- suggestedPrompt must be a concise, specific image description (no camera brand names).\n"
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
    const blocksIn = Array.isArray((s as any)?.blocks) ? (s as any).blocks : [];
    const blocks = blocksIn.slice(0, 20).map((b: any, bi: number) => {
      const t = typeof b?.type === "string" ? b.type : "";
      const blockId = `ch-${chNum}-b-${si + 1}-${bi + 1}`;
      if (t === "paragraph") {
        const imgsRaw = Array.isArray(b.images) ? b.images : [];
        const images: SkeletonImage[] | null =
          imgsRaw.length
            ? imgsRaw.slice(0, 6).map((img: any, ii: number) => {
                imageCounter += 1;
                const src = `figures/${bookId}/ch${chNum}/img_${si + 1}_${bi + 1}_${ii + 1}.png`;
                return {
                  src,
                  alt: typeof img?.alt === "string" ? img.alt : null,
                  caption: typeof img?.caption === "string" ? img.caption : null,
                  figureNumber: `${chNum}.${imageCounter}`,
                  layoutHint: typeof img?.layoutHint === "string" ? img.layoutHint : null,
                  suggestedPrompt: typeof img?.suggestedPrompt === "string" ? img.suggestedPrompt : null,
                };
              })
            : null;
        return {
          type: "paragraph",
          id: blockId,
          basisHtml: normalizeInlineHtml(b.basisHtml),
          ...(typeof b.praktijkHtml === "string" ? { praktijkHtml: normalizeInlineHtml(b.praktijkHtml) } : {}),
          ...(typeof b.verdiepingHtml === "string" ? { verdiepingHtml: normalizeInlineHtml(b.verdiepingHtml) } : {}),
          ...(images ? { images } : {}),
        };
      }
      if (t === "list") {
        const imgsRaw = Array.isArray(b.images) ? b.images : [];
        const images: SkeletonImage[] | null =
          imgsRaw.length
            ? imgsRaw.slice(0, 6).map((img: any, ii: number) => {
                imageCounter += 1;
                const src = `figures/${bookId}/ch${chNum}/img_${si + 1}_${bi + 1}_${ii + 1}.png`;
                return {
                  src,
                  alt: typeof img?.alt === "string" ? img.alt : null,
                  caption: typeof img?.caption === "string" ? img.caption : null,
                  figureNumber: `${chNum}.${imageCounter}`,
                  layoutHint: typeof img?.layoutHint === "string" ? img.layoutHint : null,
                  suggestedPrompt: typeof img?.suggestedPrompt === "string" ? img.suggestedPrompt : null,
                };
              })
            : null;
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
        const images: SkeletonImage[] | null =
          imgsRaw.length
            ? imgsRaw.slice(0, 6).map((img: any, ii: number) => {
                imageCounter += 1;
                const src = `figures/${bookId}/ch${chNum}/img_${si + 1}_${bi + 1}_${ii + 1}.png`;
                return {
                  src,
                  alt: typeof img?.alt === "string" ? img.alt : null,
                  caption: typeof img?.caption === "string" ? img.caption : null,
                  figureNumber: `${chNum}.${imageCounter}`,
                  layoutHint: typeof img?.layoutHint === "string" ? img.layoutHint : null,
                  suggestedPrompt: typeof img?.suggestedPrompt === "string" ? img.suggestedPrompt : null,
                };
              })
            : null;
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
    });

    return {
      id: `ch-${chNum}-s-${si + 1}`,
      title: typeof (s as any)?.title === "string" ? String((s as any).title) : "",
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

    // 2) Load book title (for better prompts)
    const { data: bookRow, error: bookErr } = await adminSupabase.from("books").select("title").eq("id", bookId).single();
    if (bookErr || !bookRow) throw new Error(bookErr?.message || "Book not found");
    const bookTitle = String((bookRow as any).title || "").trim();

    await emitAgentJobEvent(jobId, "generating", 20, "Calling LLM to draft chapter content", {
      chapterIndex,
    }).catch(() => {});

    const system = buildSystem({ language, level });
    const prompt = buildPrompt({
      topic,
      bookTitle,
      chapterNumber: chapterIndex + 1,
      chapterCount,
      userInstructions,
    });
    const draft = (await llmGenerateJson({
      provider: writeModelSpec.provider,
      model: writeModelSpec.model,
      system,
      prompt,
      maxTokens: 3200,
    })) as DraftChapter;

    // 3) Apply updates to skeleton chapter
    const { title: chapterTitle, sections: newSections, openerImageSrc } = assignIdsAndImages({
      bookId,
      chapterIndex,
      draft,
    });

    (sk as any).chapters[chapterIndex] = {
      ...(sk as any).chapters[chapterIndex],
      id: (sk as any).chapters[chapterIndex]?.id || `ch-${chapterIndex + 1}`,
      number: (sk as any).chapters[chapterIndex]?.number || (chapterIndex + 1),
      title: chapterTitle,
      ...(openerImageSrc ? { openerImageSrc } : {}),
      sections: newSections,
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


