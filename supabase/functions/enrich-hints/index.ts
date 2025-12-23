import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors, getRequestId } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { generateJson, getModel, getProvider } from "../_shared/ai.ts";
import { extractJsonFromText } from "../_shared/generation-utils.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Minimal Deno shim for local TypeScript tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(key: string): string | undefined }; serve: any };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

const InputSchema = z.object({
  courseId: z.string().min(1),
  itemIds: z.array(z.number().int().nonnegative()).optional(),
});

const HintSchema = z.object({
  nudge: z.string().min(1),
  guide: z.string().min(1),
  reveal: z.string().min(1),
});

function getStemText(item: any): string {
  const stem = item?.stem?.text;
  const legacy = item?.text;
  return String(stem ?? legacy ?? "").trim();
}

function getOptionsText(item: any): string[] {
  const opts = item?.options;
  if (!Array.isArray(opts)) return [];
  return opts
    .map((o: any) => (typeof o === "string" ? o : o?.text))
    .map((t: any) => String(t ?? "").trim())
    .filter(Boolean);
}

function getCorrectAnswerForPrompt(item: any, options: string[]): string {
  const mode = String(item?.mode || "options");
  if (mode === "numeric") {
    const ans = item?.answer;
    return Number.isFinite(ans) ? String(ans) : "";
  }
  const idx = typeof item?.correctIndex === "number" ? item.correctIndex : -1;
  return idx >= 0 && idx < options.length ? options[idx] : "";
}

function buildSystem() {
  return (
    "You are an expert tutor writing high-quality hints for a single quiz question.\n" +
    "You must produce progressive hints that improve learning, not generic filler.\n" +
    "Output MUST be valid JSON only (no markdown) matching the required schema."
  );
}

function buildPrompt(input: {
  courseTitle: string;
  subject: string;
  stem: string;
  options: string[];
  correctAnswer: string;
  mode: string;
}) {
  const { courseTitle, subject, stem, options, correctAnswer, mode } = input;

  return (
    "Return JSON with this exact shape:\n" +
    '{ "nudge": string, "guide": string, "reveal": string }\n\n' +
    "Constraints:\n" +
    "- nudge: gentle conceptual reminder. Do NOT reference the correct option directly.\n" +
    "- guide: more specific clue that points toward the correct reasoning path. Do NOT say 'the answer is'.\n" +
    "- reveal: can be very explicit, but do NOT say 'the answer is <X>' or repeat the full option text verbatim.\n" +
    "- Keep each hint 1–2 sentences, concise and student-friendly.\n" +
    "- If the stem contains a term that can be defined (prefix/suffix/definition), use that.\n\n" +
    `Course title: ${courseTitle}\n` +
    `Subject: ${subject}\n` +
    `Mode: ${mode}\n\n` +
    "Question (stem):\n" +
    stem +
    "\n\n" +
    (options.length
      ? "Options:\n" + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n") + "\n\n"
      : "") +
    (correctAnswer ? `Correct answer (for you only): ${correctAnswer}\n\n` : "") +
    "Now produce the JSON."
  );
}

Deno.serve(
  withCors(async (req: Request) => {
    const requestId = getRequestId(req);

    if (req.method !== "POST") {
      return Errors.methodNotAllowed(req.method, requestId, req);
    }

    // Auth: agent token OR user session
    try {
      await authenticateRequest(req);
    } catch {
      return Errors.invalidAuth(requestId, req);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return Errors.invalidRequest("Invalid JSON body", requestId, req);
    }

    const parsed = InputSchema.safeParse(raw);
    if (!parsed.success) {
      return Errors.invalidRequest(parsed.error.message, requestId, req);
    }

    const provider = getProvider();
    if (provider === "none") {
      return Errors.internal(
        "BLOCKED: No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.",
        requestId,
        req,
      );
    }

    const { courseId, itemIds } = parsed.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download existing course.json (envelope)
    const path = `${courseId}/course.json`;
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("courses")
      .download(path);
    if (downloadError || !fileData) {
      return Errors.notFound("Course JSON", requestId, req);
    }

    const text = await fileData.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return Errors.invalidRequest("Invalid course JSON", requestId, req);
    }

    const isEnvelope =
      json && typeof json === "object" && "content" in json && "format" in json;
    const envelope = isEnvelope
      ? json
      : { id: courseId, format: "practice", version: 1, content: json };
    const content = envelope.content || {};

    const courseTitle = String(content?.title || envelope?.title || courseId);
    const subject = String(content?.subject || "");

    // Locate items (prefer envelope.content.items; fallback to groups[].items)
    const rootItems: any[] = Array.isArray(content.items) ? content.items : [];
    const groupItems: any[] = Array.isArray(content.groups)
      ? content.groups.flatMap((g: any) => (Array.isArray(g?.items) ? g.items : []))
      : [];

    const items: any[] = rootItems.length ? rootItems : groupItems;
    if (!Array.isArray(items) || items.length === 0) {
      return Errors.invalidRequest("Course has no items to enrich", requestId, req);
    }

    const selected = Array.isArray(itemIds) && itemIds.length
      ? items.filter((it) => itemIds.includes(Number(it?.id)))
      : items;

    const updatedIds: number[] = [];

    for (const it of selected) {
      const itemId = Number(it?.id);
      if (!Number.isFinite(itemId)) {
        return Errors.invalidRequest("Item missing numeric id", requestId, req);
      }

      const stem = getStemText(it);
      const options = getOptionsText(it);
      const mode = String(it?.mode || "options");
      const correct = getCorrectAnswerForPrompt(it, options);

      if (!stem) {
        return Errors.invalidRequest(`Item ${itemId} missing stem text`, requestId, req);
      }
      if (mode !== "numeric" && options.length < 2) {
        return Errors.invalidRequest(`Item ${itemId} missing options`, requestId, req);
      }

      const system = buildSystem();
      const prompt = buildPrompt({
        courseTitle,
        subject,
        stem,
        options,
        correctAnswer: correct,
        mode,
      });

      const out = await generateJson({
        system,
        prompt,
        temperature: 0.35,
        maxTokens: 650,
        timeoutMs: 60_000,
        prefillJson: true,
      });

      if (!out.ok) {
        return Errors.internal(
          `enrich-hints failed (provider=${provider} model=${getModel()}): ${out.error}`,
          requestId,
          req,
        );
      }

      let payload: any;
      try {
        payload = extractJsonFromText(out.text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return Errors.internal(`enrich-hints returned invalid JSON: ${msg}`, requestId, req);
      }

      const hintParsed = HintSchema.safeParse(payload);
      if (!hintParsed.success) {
        return Errors.internal(`enrich-hints returned invalid hint schema: ${hintParsed.error.message}`, requestId, req);
      }

      const hints = hintParsed.data;
      it.hints = { nudge: hints.nudge, guide: hints.guide, reveal: hints.reveal };
      // Legacy fallback for older clients: keep a single hint field.
      it.hint = hints.nudge;
      updatedIds.push(itemId);
    }

    // Save back to the same shape we loaded
    if (rootItems.length) {
      envelope.content = { ...content, items };
    } else {
      // Mutated group items in-place; keep envelope.content as-is.
      envelope.content = content;
    }

    const updated = JSON.stringify(envelope, null, 2);
    const blob = new Blob([updated], { type: "application/json" });
    const { error: uploadError } = await supabase.storage
      .from("courses")
      .upload(path, blob, { upsert: true, contentType: "application/json" });

    if (uploadError) {
      return Errors.internal(`Upload failed: ${uploadError.message}`, requestId, req);
    }

    return {
      ok: true,
      courseId,
      updatedItemIds: updatedIds,
      count: updatedIds.length,
      provider,
      model: getModel(),
      requestId,
      timestamp: new Date().toISOString(),
    };
  }),
);


