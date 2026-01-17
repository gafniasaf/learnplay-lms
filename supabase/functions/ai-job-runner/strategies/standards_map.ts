import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v;
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function optionalNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const v = payload[key];
  if (typeof v !== "number" || Number.isNaN(v)) return undefined;
  return v;
}

async function uploadJson(
  supabase: any,
  bucket: string,
  path: string,
  data: unknown,
): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
}

async function downloadJson(
  supabase: any,
  bucket: string,
  path: string,
): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Failed to download ${bucket}/${path}: ${error?.message || "no data"}`);
  const text = await data.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Downloaded JSON is empty: ${bucket}/${path}`);
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`Downloaded JSON is invalid: ${bucket}/${path}`);
  }
}

async function generateEmbedding(text: string, opts: { apiKey: string; model: string }): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("Embeddings response missing embedding array");
  return emb as number[];
}

type StandardsItem = { code?: string; text?: string };

export class StandardsMap implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const standardsDocumentId =
      optionalString(payload, "standards_document_id") ||
      optionalString(payload, "standardsDocumentId");
    if (!standardsDocumentId) throw new Error("BLOCKED: standards_document_id is REQUIRED");

    const materialId =
      optionalString(payload, "material_id") ||
      optionalString(payload, "materialId");
    if (!materialId) throw new Error("BLOCKED: material_id is REQUIRED");

    const maxItems = Math.min(200, Math.max(1, Math.floor(optionalNumber(payload, "max_items") ?? 50)));
    const topK = Math.min(10, Math.max(1, Math.floor(optionalNumber(payload, "top_k") ?? 5)));

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
    const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    await emitAgentJobEvent(jobId, "generating", 5, "Loading standards-document record", { standardsDocumentId });

    const { data: stdRow, error: stdErr } = await supabase
      .from("entity_records")
      .select("id, title, data")
      .eq("organization_id", organizationId)
      .eq("entity", "standards-document")
      .eq("id", standardsDocumentId)
      .maybeSingle();
    if (stdErr) throw new Error(`Failed to load standards-document record: ${stdErr.message}`);
    if (!stdRow?.data || typeof stdRow.data !== "object") throw new Error("Standards document missing data");

    const stdData = stdRow.data as Record<string, unknown>;

    let items: StandardsItem[] = [];
    if (Array.isArray(stdData.items)) {
      items = stdData.items as StandardsItem[];
    } else {
      const ingest = (stdData.ingest_summary && typeof stdData.ingest_summary === "object")
        ? (stdData.ingest_summary as Record<string, unknown>)
        : {};
      const parsed = (ingest.parsed && typeof ingest.parsed === "object") ? (ingest.parsed as Record<string, unknown>) : {};
      const artifact = (parsed.artifact && typeof parsed.artifact === "object") ? (parsed.artifact as Record<string, unknown>) : {};
      const b = typeof artifact.bucket === "string" ? artifact.bucket : null;
      const p = typeof artifact.path === "string" ? artifact.path : null;
      if (!b || !p) throw new Error("BLOCKED: standards-document has no items and no parsed artifact");
      const artifactJson = await downloadJson(supabase, String(b), String(p));
      items = Array.isArray(artifactJson?.items) ? (artifactJson.items as StandardsItem[]) : [];
    }

    if (!items.length) throw new Error("BLOCKED: standards-document contains 0 items");

    const sliced = items.slice(0, maxItems);
    const materialKey = `material:${materialId}`;

    await emitAgentJobEvent(jobId, "generating", 15, `Mapping ${sliced.length} standards items`, {
      standardsDocumentId,
      materialId,
      topK,
      embeddingModel: EMBEDDING_MODEL,
    });

    const mappingRows: Array<{
      code: string;
      text: string;
      matches: Array<{ item_index: number; similarity: number; text: string }>;
    }> = [];

    for (let i = 0; i < sliced.length; i++) {
      const it = sliced[i] || {};
      const code = typeof it.code === "string" && it.code.trim() ? it.code.trim() : `S${String(i + 1).padStart(3, "0")}`;
      const text = typeof it.text === "string" ? it.text.trim() : "";
      if (!text) continue;

      const embedding = await generateEmbedding(text, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });

      const { data: matches, error: matchErr } = await supabase.rpc("match_content_embeddings", {
        p_organization_id: organizationId,
        p_course_id: materialKey,
        p_query_embedding: embedding,
        p_limit: topK,
      });
      if (matchErr) throw new Error(`match_content_embeddings failed: ${matchErr.message}`);

      const normalizedMatches = Array.isArray(matches)
        ? matches.map((m: any) => ({
            item_index: Number(m?.item_index ?? -1),
            similarity: Number(m?.similarity ?? 0),
            text: String(m?.text_content ?? ""),
          }))
        : [];

      mappingRows.push({
        code,
        text,
        matches: normalizedMatches.filter((m) => Number.isFinite(m.item_index) && m.item_index >= 0),
      });

      if ((i + 1) % 5 === 0 || i === sliced.length - 1) {
        const progress = Math.min(80, 15 + Math.floor(((i + 1) / sliced.length) * 65));
        await emitAgentJobEvent(jobId, "generating", progress, `Mapped ${i + 1}/${sliced.length} items`, { standardsDocumentId, materialId });
      }
    }

    const mappingArtifactPath = `${organizationId}/standards/mappings/${jobId}/mapping.json`;
    const now = new Date().toISOString();

    await emitAgentJobEvent(jobId, "storage_write", 85, "Saving mapping artifact", { mappingArtifactPath });
    await uploadJson(supabase, "materials", mappingArtifactPath, {
      mapping_id: jobId,
      standards_document_id: standardsDocumentId,
      material_id: materialId,
      created_at: now,
      items: mappingRows,
    });

    await emitAgentJobEvent(jobId, "catalog_update", 92, "Persisting standards-mapping record", { mappingId: jobId });

    const recordTitle = `Mapping ${standardsDocumentId} → ${materialId}`;
    const recordData: Record<string, unknown> = {
      id: jobId,
      organization_id: organizationId,
      title: recordTitle,
      standards_document_id: standardsDocumentId,
      material_id: materialId,
      status: "ready",
      mapping: {
        item_count: mappingRows.length,
        top_k: topK,
        artifact: { bucket: "materials", path: mappingArtifactPath },
      },
      export: {},
      created_at: now,
      updated_at: now,
    };

    const { error: upsertErr } = await supabase
      .from("entity_records")
      .upsert(
        {
          id: jobId,
          organization_id: organizationId,
          entity: "standards-mapping",
          title: recordTitle,
          data: recordData,
          updated_at: now,
          created_at: now,
        },
        { onConflict: "id" },
      );
    if (upsertErr) throw new Error(`Failed to persist standards-mapping record: ${upsertErr.message}`);

    await emitAgentJobEvent(jobId, "done", 100, "Standards mapping complete", {
      mappingId: jobId,
      itemsMapped: mappingRows.length,
    });

    return { ok: true, mapping_id: jobId, matches: mappingRows.length };
  }
}



