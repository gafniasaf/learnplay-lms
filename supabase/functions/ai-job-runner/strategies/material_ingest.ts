import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { chunkText, extractText, parseText } from "../../_shared/materials/ingest-utils.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`BLOCKED: ${key} is REQUIRED`);
  return v.trim();
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function truncateForEmbedding(input: string, maxChars = 12000): string {
  const s = String(input ?? "");
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}

async function downloadBytes(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Failed to download ${bucket}/${path}: ${error?.message || "no data"}`);
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

async function uploadText(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  text: string,
  contentType = "text/plain",
): Promise<void> {
  const blob = new Blob([text], { type: contentType });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
}

async function uploadJson(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  data: unknown,
): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
}

async function generateEmbeddings(
  inputs: string[],
  opts: { apiKey: string; model: string },
): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input: inputs,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const rows = (data?.data ?? []) as Array<{ embedding: number[] }>;
  return rows.map((r) => r.embedding);
}

export class MaterialIngest implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const materialId =
      optionalString(payload, "material_id") ||
      optionalString(payload, "materialId") ||
      requireString(payload, "material_id");

    const storageBucket =
      optionalString(payload, "storage_bucket") ||
      optionalString(payload, "storageBucket") ||
      requireString(payload, "storage_bucket");

    const storagePath =
      optionalString(payload, "storage_path") ||
      optionalString(payload, "storagePath") ||
      requireString(payload, "storage_path");

    const fileName = optionalString(payload, "file_name") || optionalString(payload, "fileName") || storagePath.split("/").pop();
    const contentType = optionalString(payload, "content_type") || optionalString(payload, "contentType") || "application/octet-stream";

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
    const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const now = new Date().toISOString();
    const derivedPrefix = `${organizationId}/${materialId}/derived`;
    const extractedTextPath = `${derivedPrefix}/extracted.txt`;
    const chunksPath = `${derivedPrefix}/chunks.json`;
    const ingestMetaPath = `${derivedPrefix}/ingest.json`;

    await emitAgentJobEvent(jobId, "storage_write", 5, "Downloading source material", {
      materialId,
      storage: `${storageBucket}/${storagePath}`,
    });

    // 1) Download bytes
    const bytes = await downloadBytes(supabase, storageBucket, storagePath);

    // 2) Extract text
    await emitAgentJobEvent(jobId, "generating", 15, "Extracting text", { materialId, fileName, contentType });
    const extracted = await extractText(bytes, contentType, fileName || "");
    const parsed = parseText(extracted);
    if (!parsed.text.trim()) throw new Error("Extraction produced empty text");

    // Persist extracted text artifact
    await emitAgentJobEvent(jobId, "storage_write", 25, "Saving extracted text", { materialId, extractedTextPath });
    await uploadText(supabase, "materials", extractedTextPath, parsed.text, "text/plain");

    // 3) Chunking
    await emitAgentJobEvent(jobId, "generating", 35, "Chunking text", { materialId });
    const chunks = chunkText(parsed.text, 900, 1600, 200);
    if (chunks.length === 0) throw new Error("Chunking produced 0 chunks");

    const chunkRows = chunks.map((t, idx) => ({ index: idx, chars: t.length, text: t }));

    await emitAgentJobEvent(jobId, "storage_write", 45, "Saving chunks artifact", { materialId, chunksPath, chunkCount: chunks.length });
    await uploadJson(supabase, "materials", chunksPath, { materialId, chunk_count: chunks.length, chunks: chunkRows });

    // 4) Embeddings (store in content_embeddings as reference text; course_id is namespaced to avoid collisions)
    await emitAgentJobEvent(jobId, "enriching", 55, "Generating embeddings", { materialId, model: EMBEDDING_MODEL });

    const materialKey = `material:${materialId}`;

    // Clear existing embeddings for this material key
    await supabase
      .from("content_embeddings")
      .delete()
      .eq("organization_id", organizationId)
      .eq("course_id", materialKey)
      .eq("content_type", "reference");

    const BATCH_SIZE = 32;
    const maxChars = 12000;
    let embedded = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map((t) => truncateForEmbedding(t, maxChars));
      const vectors = await generateEmbeddings(batch, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });

      const rows = vectors.map((embedding, idx) => ({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        course_id: materialKey,
        group_index: 0,
        item_index: i + idx,
        content_type: "reference",
        option_id: null,
        text_content: chunks[i + idx],
        embedding,
      }));

      const { error } = await supabase.from("content_embeddings").insert(rows);
      if (error) throw new Error(`Failed to store embeddings: ${error.message}`);

      embedded += rows.length;
      const progress = Math.min(90, 55 + Math.floor((embedded / chunks.length) * 35));
      await emitAgentJobEvent(jobId, "enriching", progress, `Embedded ${embedded}/${chunks.length} chunks`, { materialId });
    }

    // 5) Persist ingest metadata into the LibraryMaterial entity record
    await emitAgentJobEvent(jobId, "catalog_update", 92, "Updating material record", { materialId });

    const { data: existing, error: existingErr } = await supabase
      .from("entity_records")
      .select("id, title, data")
      .eq("organization_id", organizationId)
      .eq("entity", "library-material")
      .eq("id", materialId)
      .maybeSingle();

    if (existingErr) throw new Error(`Failed to load library-material record: ${existingErr.message}`);

    const prev = (existing?.data && typeof existing.data === "object") ? (existing.data as Record<string, unknown>) : {};
    const prevSummary = (prev.analysis_summary && typeof prev.analysis_summary === "object") ? (prev.analysis_summary as Record<string, unknown>) : {};

    const ingestSummary = {
      status: "ok",
      ingested_at: now,
      source: {
        bucket: storageBucket,
        path: storagePath,
        file_name: fileName ?? null,
        content_type: contentType,
      },
      extracted: {
        bucket: "materials",
        path: extractedTextPath,
        word_count: parsed.wordCount,
        char_count: parsed.text.length,
      },
      chunks: {
        bucket: "materials",
        path: chunksPath,
        chunk_count: chunks.length,
      },
      embeddings: {
        provider: "openai",
        model: EMBEDDING_MODEL,
        count: embedded,
        target_table: "content_embeddings",
        material_key: materialKey,
      },
    };

    const recordTitle = String(prev.title || existing?.title || fileName || `Material ${materialId}`);

    const recordData: Record<string, unknown> = {
      ...prev,
      id: materialId,
      organization_id: organizationId,
      title: recordTitle,
      file_name: fileName ?? prev.file_name ?? null,
      content_type: contentType ?? prev.content_type ?? null,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      status: "ingesting",
      analysis_summary: {
        ...prevSummary,
        ingest: ingestSummary,
      },
      updated_at: now,
    };

    const { error: upsertErr } = await supabase
      .from("entity_records")
      .upsert(
        {
          id: materialId,
          organization_id: organizationId,
          entity: "library-material",
          title: recordTitle,
          data: recordData,
          updated_at: now,
          created_at: (prev.created_at as string | undefined) ?? now,
        },
        { onConflict: "id" },
      );
    if (upsertErr) throw new Error(`Failed to persist library-material record: ${upsertErr.message}`);

    await uploadJson(supabase, "materials", ingestMetaPath, ingestSummary);

    await emitAgentJobEvent(jobId, "done", 100, "Material ingest complete", { materialId, chunkCount: chunks.length });

    return {
      ok: true,
      material_id: materialId,
      chunk_count: chunks.length,
      embedded_count: embedded,
      extracted_text_path: extractedTextPath,
      chunks_path: chunksPath,
    };
  }
}



