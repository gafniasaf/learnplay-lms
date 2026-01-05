/**
 * book_generate_index (Factory / ai_agent_jobs)
 *
 * Generates an Index term list for a canonical book version (no page numbers yet).
 * Output is stored at:
 *   books/{bookId}/{bookVersionId}/matter/index.generated.json
 *
 * Notes:
 * - This job MUST be real (no mocks/placeholders). If requirements are missing, fail with BLOCKED.
 * - Page references are computed later during the render pipeline (page-map stage).
 */

import type { JobContext, JobExecutor } from "./types.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { extractJsonFromText } from "../../_shared/generation-utils.ts";

type Provider = "openai" | "anthropic";

const TOOL_INDEX: { name: string; description: string; input_schema: Record<string, unknown> } = {
  name: "draft_book_index_terms",
  description:
    "Return ONLY a JSON object with the index terms: { schemaVersion, bookId, bookVersionId, language, entries: [{ term, variants?, seeAlso? }] }",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["schemaVersion", "bookId", "bookVersionId", "language", "entries"],
    properties: {
      schemaVersion: { type: "string" },
      bookId: { type: "string" },
      bookVersionId: { type: "string" },
      language: { type: "string" },
      entries: { type: "array", items: { type: "object", additionalProperties: true } },
    },
  },
};

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
  if (parts.length < 2) throw new Error("BLOCKED: writeModel must be prefixed with provider (use 'openai:<model>' or 'anthropic:<model>')");
  const provider = parts[0] as Provider;
  const model = parts.slice(1).join(":");
  if (provider !== "openai" && provider !== "anthropic") throw new Error("BLOCKED: writeModel provider must be 'openai' or 'anthropic'");
  if (!model) throw new Error("BLOCKED: writeModel model is missing");
  return { provider, model };
}

function extractBoldTerms(raw: string): string[] {
  const s = String(raw || "");
  const out: string[] = [];
  const re = /<<\s*BOLD_START\s*>>([\s\S]*?)<<\s*BOLD_END\s*>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const t0 = normalizeWs(String(m[1] || ""));
    if (!t0) continue;
    // Strip leading/trailing punctuation that often sneaks in.
    const t = t0.replace(/^[\s,.;:!?()\[\]«»"']+/, "").replace(/[\s,.;:!?()\[\]«»"']+$/, "").trim();
    if (!t) continue;
    out.push(t);
  }
  return out;
}

function walkJson(value: unknown, visitor: (s: string) => void) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const v of value) walkJson(v, visitor);
    return;
  }
  if (typeof value === "string") {
    visitor(value);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) walkJson(v, visitor);
  }
}

async function llmGenerateJson(opts: {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<any> {
  const { provider, model, system, prompt, maxTokens } = opts;
  const timeoutMs = 220_000;

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
    return extractJsonFromText(out);
  }

  const key = requireEnv("ANTHROPIC_API_KEY");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      tools: [TOOL_INDEX],
      tool_choice: { type: "tool", name: TOOL_INDEX.name },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(anthropic) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);

  const toolUse = (Array.isArray((data as any)?.content) ? (data as any).content : []).find(
    (b: any) => b?.type === "tool_use" && b?.name === TOOL_INDEX.name && b?.input && typeof b.input === "object",
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

async function uploadJson(supabase: any, bucket: string, path: string, value: unknown) {
  const text = JSON.stringify(value, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(error.message);
}

function normalizeTermKey(raw: string): string {
  return normalizeWs(raw).toLowerCase();
}

export class BookGenerateIndex implements JobExecutor {
  async execute(context: JobContext): Promise<any> {
    const { jobId, payload } = context;

    const bookId = requireString(payload, "bookId");
    const bookVersionId = requireString(payload, "bookVersionId");
    const language = requireString(payload, "language");
    const writeModelSpec = parseModelSpec(requireString(payload, "writeModel"));

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Skeleton-first: prefer compiled canonical when present (source of truth for authoringMode='skeleton').
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("canonical_path, compiled_canonical_path, authoring_mode")
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId)
      .single();
    if (versionErr || !version) {
      throw new Error("BLOCKED: book version not found");
    }

    const authoringMode = typeof (version as any).authoring_mode === "string" ? String((version as any).authoring_mode) : "legacy";
    const compiledPath = typeof (version as any).compiled_canonical_path === "string" ? String((version as any).compiled_canonical_path).trim() : "";
    const canonicalPathDb = typeof (version as any).canonical_path === "string" ? String((version as any).canonical_path).trim() : "";
    const canonicalPath = authoringMode === "skeleton" && compiledPath ? compiledPath : canonicalPathDb;
    if (!canonicalPath) throw new Error("BLOCKED: canonical_path is missing for this book version");

    await emitAgentJobEvent(jobId, "storage_read", 5, "Loading canonical.json", { canonicalPath, authoringMode }).catch(() => {});
    const canonical = await downloadJson(adminSupabase, "books", canonicalPath);
    if (!canonical || typeof canonical !== "object") {
      throw new Error("BLOCKED: canonical.json could not be parsed");
    }

    // Extract candidate terms from <<BOLD_START>> markers (high-signal real terminology).
    const freq = new Map<string, { term: string; count: number }>();
    walkJson(canonical, (s) => {
      for (const t of extractBoldTerms(s)) {
        const key = normalizeTermKey(t);
        const prev = freq.get(key);
        if (!prev) freq.set(key, { term: t, count: 1 });
        else prev.count += 1;
      }
    });

    const candidates = Array.from(freq.values())
      .sort((a, b) => b.count - a.count)
      .map((x) => x.term);

    if (candidates.length < 20) {
      throw new Error("BLOCKED: Not enough terminology markers found in canonical (need >= 20 <<BOLD_START>> terms)");
    }

    // Keep prompt bounded.
    const candidateLimit = 800;
    const candidateSample = candidates.slice(0, candidateLimit);

    await emitAgentJobEvent(jobId, "generating", 20, "Drafting index terms with LLM", {
      candidateCount: candidates.length,
      candidateSampleCount: candidateSample.length,
      provider: writeModelSpec.provider,
      model: writeModelSpec.model,
    }).catch(() => {});

    const system =
      "Je bent een ervaren indexredacteur voor Nederlandse MBO-studieboeken. " +
      "Je taak is om een bruikbare trefwoordenlijst (index) samen te stellen op basis van bestaande termen in het boek. " +
      "Gebruik alleen termen die in de input voorkomen (geen nieuwe termen verzinnen). " +
      "Geen paginanummers in deze output; die worden later berekend.";

    const prompt =
      `Boek:\n` +
      `- bookId: ${bookId}\n` +
      `- bookVersionId: ${bookVersionId}\n` +
      `- titel: ${(canonical as any)?.meta?.title || "Book"}\n` +
      `- taal: ${language}\n\n` +
      `Kandidaat-termen (uit vetgedrukte begrippen in de tekst):\n` +
      `${JSON.stringify(candidateSample)}\n\n` +
      `Return JSON:\n` +
      `{\n` +
      `  \"schemaVersion\": \"index_v1\",\n` +
      `  \"bookId\": string,\n` +
      `  \"bookVersionId\": string,\n` +
      `  \"language\": string,\n` +
      `  \"entries\": [\n` +
      `    {\n` +
      `      \"term\": string,\n` +
      `      \"variants\"?: string[],\n` +
      `      \"seeAlso\"?: string[]\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Regels:\n` +
      `- 200–450 entries (afhankelijk van de input), alfabetisch sorteren op term\n` +
      `- Korte termen hebben voorkeur boven hele zinnen\n` +
      `- Geen dubbele entries (case-insensitive)\n` +
      `- Geen paginanummers\n`;

    const draft = await llmGenerateJson({
      provider: writeModelSpec.provider,
      model: writeModelSpec.model,
      system,
      prompt,
      maxTokens: 7000,
    });

    const entriesRaw = Array.isArray((draft as any)?.entries) ? (draft as any).entries : null;
    if (!entriesRaw) throw new Error("BLOCKED: LLM returned invalid index JSON (missing entries[])");

    // Normalize + dedupe
    const seen = new Set<string>();
    const entries = entriesRaw
      .map((e: any) => ({
        term: typeof e?.term === "string" ? normalizeWs(e.term) : "",
        variants: Array.isArray(e?.variants) ? e.variants.filter((x: any) => typeof x === "string").map((x: string) => normalizeWs(x)).filter(Boolean).slice(0, 10) : undefined,
        seeAlso: Array.isArray(e?.seeAlso) ? e.seeAlso.filter((x: any) => typeof x === "string").map((x: string) => normalizeWs(x)).filter(Boolean).slice(0, 10) : undefined,
      }))
      .filter((e: any) => !!e.term)
      .filter((e: any) => {
        const k = normalizeTermKey(e.term);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a: any, b: any) => a.term.localeCompare(b.term, "nl"));

    if (entries.length < 50) {
      throw new Error(`BLOCKED: Index too small after normalization (got ${entries.length}, expected >= 50)`);
    }

    const out = {
      schemaVersion: "index_v1",
      bookId,
      bookVersionId,
      language,
      generatedAt: new Date().toISOString(),
      entries,
    };

    const outPath = `books/${bookId}/${bookVersionId}/matter/index.generated.json`;
    await emitAgentJobEvent(jobId, "storage_write", 85, "Saving index.generated.json", { outPath, entries: entries.length }).catch(() => {});
    await uploadJson(adminSupabase, "books", outPath, out);

    await emitAgentJobEvent(jobId, "done", 100, "Index terms generated", { outPath, entries: entries.length }).catch(() => {});
    return { ok: true, bookId, bookVersionId, outPath, entries: entries.length };
  }
}


