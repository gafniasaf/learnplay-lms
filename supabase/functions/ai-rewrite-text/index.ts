import { withCors, getRequestId } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { generateJson, getModel, getProvider } from "../_shared/ai.ts";
import { extractJsonFromText } from "../_shared/generation-utils.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Minimal Deno shim for local TypeScript tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(key: string): string | undefined }; serve: any };

const InputSchema = z.object({
  segmentType: z.enum(["stem", "option", "reference"]),
  currentText: z.string().min(1),
  context: z.record(z.any()).default({}),
  styleHints: z.array(z.enum(["simplify", "add_visual_cue", "more_formal", "more_casual", "add_context"])).optional(),
  candidateCount: z.number().int().min(1).max(3).optional(),
});

function buildSystem(segmentType: string) {
  return (
    "You are an expert educational content editor.\n" +
    "You rewrite ONLY what the user asks, preserving meaning and correctness.\n" +
    "Output MUST be valid JSON only (no markdown) matching the schema.\n" +
    "If given HTML, keep HTML.\n" +
    `Segment: ${segmentType}\n`
  );
}

function buildPrompt(input: z.infer<typeof InputSchema>) {
  const { currentText, context, styleHints, candidateCount } = input;
  const userPrompt = typeof (context as any)?.userPrompt === "string" ? String((context as any).userPrompt) : "";

  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  "candidates": [{"text": string, "rationale": string}, ...],\n' +
    '  "originalText": string,\n' +
    '  "segmentType": string,\n' +
    '  "context": object\n' +
    "}\n\n" +
    `candidateCount: ${candidateCount ?? 1}\n` +
    (styleHints?.length ? `styleHints: ${styleHints.join(", ")}\n` : "") +
    (userPrompt ? `userPrompt: ${userPrompt}\n` : "") +
    "\nCURRENT TEXT:\n" +
    currentText +
    "\n\nCONTEXT (JSON):\n" +
    JSON.stringify(context ?? {}, null, 2)
  );
}

Deno.serve(
  withCors(async (req: Request) => {
    const requestId = getRequestId(req);
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    if (req.method !== "POST") {
      return Errors.methodNotAllowed(req.method, requestId, req);
    }

    // Auth: agent token OR user session
    try {
      await authenticateRequest(req);
    } catch (e) {
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

    const input = parsed.data;
    const system = buildSystem(input.segmentType);
    const prompt = buildPrompt(input);

    const out = await generateJson({
      system,
      prompt,
      temperature: 0.4,
      maxTokens: 1200,
      timeoutMs: 110_000,
      prefillJson: true,
    });

    if (!out.ok) {
      return Errors.internal(
        `ai-rewrite-text failed (provider=${getProvider()} model=${getModel()}): ${out.error}`,
        requestId,
        req
      );
    }

    let payload: any;
    try {
      payload = extractJsonFromText(out.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Errors.internal(`ai-rewrite-text returned invalid JSON: ${msg}`, requestId, req);
    }

    // Minimal shape normalization
    let candidates: Array<{ text: string; rationale: string }> | null = Array.isArray(payload?.candidates) ? payload.candidates : null;
    if (!candidates || candidates.length === 0) {
      // Normalize common alternate shapes
      if (typeof payload?.text === "string") {
        candidates = [{ text: String(payload.text), rationale: String(payload?.rationale || "rewrite") }];
      } else if (Array.isArray(payload?.rewrites) && payload.rewrites.length) {
        candidates = payload.rewrites
          .filter((r: any) => r && typeof r.text === "string")
          .slice(0, 3)
          .map((r: any) => ({ text: String(r.text), rationale: String(r?.rationale || "rewrite") }));
      }
    }

    if (!candidates || candidates.length === 0) {
      return {
        _error: true,
        _status: 500,
        error: {
          code: "internal_error",
          message: "ai-rewrite-text returned no candidates",
        },
        ...(debug ? { debug: { llmRaw: String(out.text).slice(0, 4000) } } : {}),
        requestId,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      candidates,
      originalText: input.currentText,
      segmentType: input.segmentType,
      context: input.context,
      ...(debug ? { debug: { provider: getProvider(), model: getModel() } } : {}),
      requestId,
    };
  }),
);

