/**
 * book_normalize_voice (Factory / ai_agent_jobs)
 *
 * Post-pass rewrite to normalize the writing voice across a book version.
 *
 * Goal: make all chapters match an N3-style voice (student-friendly Dutch) while preserving:
 * - exact outline structure (titles + block nesting)
 * - paragraph IDs
 * - inline HTML constraints
 * - deterministic index/glossary markers (<strong> emphasis)
 *
 * IMPORTANT:
 * - This job MUTATES skeleton.json and re-compiles canonical.json. It must NOT run while
 *   BookGen generation jobs are actively writing to the same skeleton.
 * - It is yield-based and bounded (no infinite loops).
 */
import type { JobContext, JobExecutor } from "./types.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { validateBookSkeleton, type BookSkeletonV1 } from "../../_shared/bookSkeletonCore.ts";

type Provider = "openai" | "anthropic";

type RewriteItem = {
  key: string;
  text: string;
};

const TOOL_REWRITE_VOICE = {
  name: "rewrite_voice",
  description:
    "Rewrite inline HTML snippets to match the requested voice while preserving meaning, correctness, and allowed tags.",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["rewrites"],
    properties: {
      rewrites: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          required: ["key", "text"],
          properties: {
            key: { type: "string" },
            text: { type: "string" },
          },
        },
      },
    },
  },
} as const;

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v.trim();
}

function requireString(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`BLOCKED: ${key} is REQUIRED`);
  return v.trim();
}

function requireNumber(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`BLOCKED: ${key} is REQUIRED (number)`);
  return v;
}

function normalizeWs(s: string): string {
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseModelSpec(raw: unknown): { provider: Provider; model: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) throw new Error("BLOCKED: writeModel is REQUIRED");
  const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) throw new Error("BLOCKED: writeModel must be provider-prefixed (e.g. 'anthropic:claude-sonnet-4-5')");
  const provider = parts[0] as Provider;
  const model = parts.slice(1).join(":");
  if (provider !== "openai" && provider !== "anthropic") throw new Error("BLOCKED: writeModel provider must be 'openai' or 'anthropic'");
  if (!model) throw new Error("BLOCKED: writeModel model is missing");
  return { provider, model };
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

function assertInlineHtmlSafe(s: string) {
  const text = String(s || "");
  // Disallow block-level tags and dangerous tags.
  const bad = text.match(/<\s*(p|div|h\d|section|article|table|ul|ol|li|script|style|iframe|img)\b/i);
  if (bad) throw new Error(`BLOCKED: Rewrite introduced disallowed tag: <${bad[1]}>`);
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
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `Edge call failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

async function llmRewriteBatch(opts: {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<{ rewrites: Array<{ key: string; text: string }> }> {
  const timeoutMs = 120_000;
  const { provider, model, system, prompt, maxTokens } = opts;

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
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`LLM(openai) failed: ${resp.status} ${text.slice(0, 400)}`);
    const data = JSON.parse(text);
    const out = data?.choices?.[0]?.message?.content;
    if (typeof out !== "string" || !out.trim()) throw new Error("LLM(openai) returned empty content");
    const parsed = JSON.parse(out);
    return parsed as any;
  }

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
      temperature: 0.2,
      system,
      tools: [TOOL_REWRITE_VOICE],
      tool_choice: { type: "tool", name: TOOL_REWRITE_VOICE.name },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(anthropic) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  const toolUse = (Array.isArray((data as any)?.content) ? (data as any).content : []).find(
    (b: any) => b?.type === "tool_use" && b?.name === TOOL_REWRITE_VOICE.name && b?.input && typeof b.input === "object",
  );
  if (toolUse?.input && typeof toolUse.input === "object") return toolUse.input as any;
  throw new Error("LLM(anthropic) returned no tool_use payload");
}

function buildSystem(opts: { language: string }) {
  const lang = normalizeWs(opts.language);
  return (
    "You are an expert educational editor for Dutch MBO textbooks.\n" +
    "Goal: rewrite text to match an N3 voice: practical, student-friendly, short sentences, and often addressing the reader as 'je'.\n" +
    "Preserve meaning and factual correctness.\n" +
    "IMPORTANT HTML RULES:\n" +
    "- Input strings are INLINE HTML only (no <p> tags).\n" +
    "- Allowed tags: <strong>, <em>, <b>, <i>, <sup>, <sub>, <span>, <br/>.\n" +
    "- Do NOT introduce block tags (<p>, <div>, <h1>, etc.).\n" +
    "- If the text starts with <span class=\"box-lead\">...</span>, KEEP it as the first element.\n" +
    "- Keep existing <strong> emphasis; add <strong> around key terms on first mention where helpful.\n" +
    "- Do NOT add labels like 'In de praktijk:' or 'Verdieping:'; those are rendered elsewhere.\n" +
    `Language: ${lang}\n`
  );
}

function buildPrompt(opts: {
  items: RewriteItem[];
  styleReference?: string | null;
}): string {
  const styleRef = opts.styleReference ? normalizeWs(opts.styleReference).slice(0, 900) : "";
  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  \"rewrites\": [{\"key\": string, \"text\": string}, ...]\n' +
    "}\n\n" +
    (styleRef ? `STYLE REFERENCE (match style only; do NOT copy content):\n${styleRef}\n\n` : "") +
    "REWRITE ITEMS (JSON):\n" +
    JSON.stringify({ items: opts.items }, null, 2) +
    "\n\nRules:\n" +
    "- Return rewrites for EVERY input item (same keys).\n" +
    "- Do NOT return empty text.\n"
  );
}

function collectStyleReferenceFromChapter(sk: BookSkeletonV1, chapterIndex: number): string | null {
  const chapters = Array.isArray((sk as any).chapters) ? (sk as any).chapters : [];
  const ch = chapters[chapterIndex];
  if (!ch) return null;
  const out: string[] = [];

  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (typeof node !== "object") return;
    if (node.type === "paragraph") {
      const b = typeof node.basisHtml === "string" ? node.basisHtml.trim() : "";
      if (b) out.push(b);
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(ch);

  const sample = out.slice(0, 3).join("\n");
  return sample ? sample : null;
}

function collectSectionRewriteItems(sectionRaw: any): Array<{ key: string; block: any; field: "basisHtml" | "praktijkHtml" | "verdiepingHtml"; text: string }> {
  const out: Array<{ key: string; block: any; field: "basisHtml" | "praktijkHtml" | "verdiepingHtml"; text: string }> = [];
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (typeof node !== "object") return;
    const t = typeof node.type === "string" ? String(node.type) : "";
    if (t === "paragraph") {
      const pid = typeof node.id === "string" ? String(node.id).trim() : "";
      if (!pid) return;
      const basis = typeof node.basisHtml === "string" ? node.basisHtml.trim() : "";
      const praktijk = typeof node.praktijkHtml === "string" ? node.praktijkHtml.trim() : "";
      const verdieping = typeof node.verdiepingHtml === "string" ? node.verdiepingHtml.trim() : "";
      if (basis) out.push({ key: `${pid}::basisHtml`, block: node, field: "basisHtml", text: basis });
      if (praktijk) out.push({ key: `${pid}::praktijkHtml`, block: node, field: "praktijkHtml", text: praktijk });
      if (verdieping) out.push({ key: `${pid}::verdiepingHtml`, block: node, field: "verdiepingHtml", text: verdieping });
      return;
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(sectionRaw);
  return out;
}

async function assertNoActiveBookGenWrites(opts: { adminSupabase: any; organizationId: string; bookId: string; bookVersionId: string }) {
  const { adminSupabase, organizationId, bookId, bookVersionId } = opts;
  const { data, error } = await adminSupabase
    .from("ai_agent_jobs")
    .select("id,job_type,status")
    .eq("organization_id", organizationId)
    .in("job_type", ["book_generate_chapter", "book_generate_section"])
    .in("status", ["queued", "processing"])
    .filter("payload->>bookId", "eq", bookId)
    .filter("payload->>bookVersionId", "eq", bookVersionId)
    .limit(1);
  if (error) throw new Error(`BLOCKED: Failed to check active generation jobs: ${error.message}`);
  if (Array.isArray(data) && data.length > 0) {
    throw new Error("BLOCKED: Book generation is still running for this version. Wait until it finishes before normalizing voice.");
  }
}

export class BookNormalizeVoice implements JobExecutor {
  async execute(context: JobContext): Promise<any> {
    const { payload, jobId } = context;
    const p = (payload || {}) as Record<string, unknown>;

    const organizationId = requireString(p, "organization_id");
    const bookId = requireString(p, "bookId");
    const bookVersionId = requireString(p, "bookVersionId");
    const language = requireString(p, "language");
    const writeModel = requireString(p, "writeModel");
    const { provider, model } = parseModelSpec(writeModel);

    const chapterIndexRaw = requireNumber(p, "chapterIndex");
    const chapterIndex = Math.floor(chapterIndexRaw);
    if (chapterIndex !== chapterIndexRaw || chapterIndex < 0) throw new Error("BLOCKED: chapterIndex must be an integer >= 0");

    const chapterCountRaw = requireNumber(p, "chapterCount");
    const chapterCount = Math.floor(chapterCountRaw);
    if (chapterCount !== chapterCountRaw || chapterCount <= 0) throw new Error("BLOCKED: chapterCount must be an integer > 0");

    const enqueueChapters = (p as any).enqueueChapters === true;
    const rewriteReferenceChapter = (p as any).rewriteReferenceChapter === true;

    const nextSectionIndexRaw = (p as any).nextSectionIndex;
    const nextSectionIndex =
      typeof nextSectionIndexRaw === "number" && Number.isFinite(nextSectionIndexRaw) ? Math.max(0, Math.floor(nextSectionIndexRaw)) : 0;

    const sectionItemOffsetRaw = (p as any).__voiceItemOffset;
    const itemOffset =
      typeof sectionItemOffsetRaw === "number" && Number.isFinite(sectionItemOffsetRaw) ? Math.max(0, Math.floor(sectionItemOffsetRaw)) : 0;

    const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    await emitAgentJobEvent(jobId, "generating", 5, "Starting voice normalization", {
      bookId,
      bookVersionId,
      chapterIndex,
      nextSectionIndex,
      itemOffset,
      provider,
      model,
    }).catch(() => {});

    // Safety: do not mutate skeleton while generation is actively writing.
    await assertNoActiveBookGenWrites({ adminSupabase, organizationId, bookId, bookVersionId });

    // Load skeleton
    const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
    const skRaw = await downloadJson(adminSupabase, "books", skeletonPath);
    const v0 = validateBookSkeleton(skRaw);
    if (!v0.ok) throw new Error(`BLOCKED: Existing skeleton is invalid (${v0.issues.length} issue(s))`);
    const sk: BookSkeletonV1 = v0.skeleton;

    const chapters = Array.isArray((sk as any).chapters) ? (sk as any).chapters : [];
    if (chapterIndex >= chapters.length) {
      throw new Error(`BLOCKED: chapterIndex ${chapterIndex} out of range (skeleton has ${chapters.length} chapters)`);
    }
    const chapter = chapters[chapterIndex];
    const sections = Array.isArray((chapter as any)?.sections) ? (chapter as any).sections : [];
    const sectionCount = sections.length;

    // Default behavior: treat Chapter 1 (index 0) as the style reference and DO NOT rewrite it,
    // unless explicitly requested.
    if (chapterIndex === 0 && !rewriteReferenceChapter) {
      if (enqueueChapters && chapterIndex + 1 < chapterCount) {
        const { data: queued, error: insErr } = await adminSupabase
          .from("ai_agent_jobs")
          .insert({
            organization_id: organizationId,
            job_type: "book_normalize_voice",
            status: "queued",
            max_retries: 6,
            payload: {
              bookId,
              bookVersionId,
              chapterIndex: chapterIndex + 1,
              chapterCount,
              language,
              writeModel,
              enqueueChapters: true,
              rewriteReferenceChapter,
              nextSectionIndex: 0,
            },
          })
          .select("id")
          .single();
        if (insErr || !queued?.id) throw new Error(insErr?.message || "Failed to enqueue next voice normalization chapter job");
        await emitAgentJobEvent(jobId, "done", 100, "Skipped reference chapter; queued next chapter voice normalization", {
          chapterIndex,
          nextChapterJobId: queued.id,
        }).catch(() => {});
        return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, skipped: true, nextChapterJobId: queued.id };
      }

      await emitAgentJobEvent(jobId, "done", 100, "Skipped reference chapter voice normalization", {
        chapterIndex,
      }).catch(() => {});
      return { ok: true, bookId, bookVersionId, chapterIndex, skipped: true, done: true };
    }

    if (nextSectionIndex >= sectionCount) {
      // Chapter done; enqueue next chapter normalization if requested.
      if (enqueueChapters && chapterIndex + 1 < chapterCount) {
        const { data: queued, error: insErr } = await adminSupabase
          .from("ai_agent_jobs")
          .insert({
            organization_id: organizationId,
            job_type: "book_normalize_voice",
            status: "queued",
            max_retries: 6,
            payload: {
              bookId,
              bookVersionId,
              chapterIndex: chapterIndex + 1,
              chapterCount,
              language,
              writeModel,
              enqueueChapters: true,
              rewriteReferenceChapter,
              nextSectionIndex: 0,
            },
          })
          .select("id")
          .single();
        if (insErr || !queued?.id) throw new Error(insErr?.message || "Failed to enqueue next voice normalization chapter job");
        await emitAgentJobEvent(jobId, "done", 100, "Chapter voice normalized; queued next chapter", {
          chapterIndex,
          nextChapterJobId: queued.id,
        }).catch(() => {});
        return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, nextChapterJobId: queued.id };
      }

      await emitAgentJobEvent(jobId, "done", 100, "Voice normalization complete (chapter)", {
        chapterIndex,
      }).catch(() => {});
      return { ok: true, bookId, bookVersionId, chapterIndex, done: true };
    }

    // Normalize one section at a time, in small batches.
    const sectionRaw = sections[nextSectionIndex];
    if (!sectionRaw) throw new Error(`BLOCKED: Skeleton missing section at index ${nextSectionIndex} (chapter ${chapterIndex})`);

    const allItems = collectSectionRewriteItems(sectionRaw);
    if (allItems.length === 0) {
      // Nothing to rewrite; advance section pointer.
      return {
        yield: true,
        message: "No rewrite targets in this section; advancing",
        nextPayload: {
          ...p,
          chapterIndex,
          chapterCount,
          nextSectionIndex: nextSectionIndex + 1,
          __voiceItemOffset: 0,
        },
      };
    }

    const BATCH = 8;
    const slice = allItems.slice(itemOffset, itemOffset + BATCH);
    if (!slice.length) {
      // Section finished (offset past end).
      await emitAgentJobEvent(jobId, "generating", 70, "Section voice normalized; advancing", {
        chapterIndex,
        sectionIndex: nextSectionIndex,
      }).catch(() => {});
      // Save + compile canonical at section boundary.
      const saveRes = await callEdgeAsAgent({
        orgId: organizationId,
        path: "book-version-save-skeleton",
        body: {
          bookId,
          bookVersionId,
          skeleton: sk,
          note: `Voice normalize: ch${chapterIndex + 1} sec${nextSectionIndex + 1}`,
          compileCanonical: true,
        },
      });
      if (saveRes?.ok !== true) throw new Error("Failed to save skeleton (voice normalize)");

      return {
        yield: true,
        message: "Section normalized; moving to next section",
        nextPayload: {
          ...p,
          chapterIndex,
          chapterCount,
          nextSectionIndex: nextSectionIndex + 1,
          __voiceItemOffset: 0,
        },
      };
    }

    const styleRef = collectStyleReferenceFromChapter(sk, 0);
    const items: RewriteItem[] = slice.map((x) => ({ key: x.key, text: x.text }));

    const system = buildSystem({ language });
    const prompt = buildPrompt({ items, styleReference: styleRef });

    let rewritten: { rewrites: Array<{ key: string; text: string }> };
    try {
      rewritten = await llmRewriteBatch({
        provider,
        model,
        system,
        prompt,
        maxTokens: 2500,
      });
    } catch (e) {
      if (isAbortTimeout(e)) {
        await emitAgentJobEvent(jobId, "generating", 25, "LLM timed out; requeueing voice batch", {
          chapterIndex,
          sectionIndex: nextSectionIndex,
          itemOffset,
        }).catch(() => {});
        return {
          yield: true,
          message: "LLM timed out; retrying batch via requeue",
          nextPayload: { ...p, chapterIndex, chapterCount, nextSectionIndex, __voiceItemOffset: itemOffset },
        };
      }
      throw e;
    }

    const arr = Array.isArray((rewritten as any)?.rewrites) ? (rewritten as any).rewrites : [];
    const outMap = new Map<string, string>();
    for (const r of arr) {
      const k = typeof (r as any)?.key === "string" ? String((r as any).key).trim() : "";
      const t = typeof (r as any)?.text === "string" ? String((r as any).text).trim() : "";
      if (!k || !t) continue;
      outMap.set(k, t);
    }
    if (outMap.size !== items.length) {
      throw new Error(`BLOCKED: Voice rewrite returned incomplete batch (got=${outMap.size}, expected=${items.length})`);
    }

    // Apply rewrites
    for (const it of slice) {
      const next = outMap.get(it.key);
      if (!next) throw new Error(`BLOCKED: Missing rewrite for key '${it.key}'`);
      assertInlineHtmlSafe(next);
      (it.block as any)[it.field] = next;
    }

    const v1 = validateBookSkeleton(sk);
    if (!v1.ok) throw new Error(`BLOCKED: Updated skeleton validation failed (${v1.issues.length} issue(s))`);

    const doneItems = Math.min(allItems.length, itemOffset + slice.length);
    const pct = Math.min(90, Math.floor((doneItems / Math.max(1, allItems.length)) * 85) + 5);
    await emitAgentJobEvent(jobId, "generating", pct, "Voice batch applied", {
      chapterIndex,
      sectionIndex: nextSectionIndex,
      itemOffset,
      doneItems,
      totalItems: allItems.length,
    }).catch(() => {});

    const sectionDone = doneItems >= allItems.length;
    const saveRes = await callEdgeAsAgent({
      orgId: organizationId,
      path: "book-version-save-skeleton",
      body: {
        bookId,
        bookVersionId,
        skeleton: v1.skeleton,
        note: sectionDone
          ? `Voice normalize: ch${chapterIndex + 1} sec${nextSectionIndex + 1}`
          : `Voice normalize (progress): ch${chapterIndex + 1} sec${nextSectionIndex + 1} items ${itemOffset}-${itemOffset + slice.length - 1}`,
        compileCanonical: sectionDone,
      },
    });
    if (saveRes?.ok !== true) throw new Error("Failed to save skeleton (voice normalize)");

    return {
      yield: true,
      message: sectionDone
        ? `Section normalized (${nextSectionIndex + 1}/${sectionCount}); advancing`
        : `Applied voice rewrites (${doneItems}/${allItems.length}) in section ${nextSectionIndex + 1}/${sectionCount}`,
      nextPayload: {
        ...p,
        chapterIndex,
        chapterCount,
        nextSectionIndex: sectionDone ? nextSectionIndex + 1 : nextSectionIndex,
        __voiceItemOffset: sectionDone ? 0 : itemOffset + slice.length,
      },
    };
  }
}


