import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { chunkText } from "../../_shared/materials/ingest-utils.ts";

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

type MesDocInput = {
  doc_id: string;
  title?: string;
  text: string;
  url?: string;
};

type MesCorpusIndexFile = {
  version: 1;
  updated_at: string;
  documents: Record<string, { title?: string; url?: string; indexed_at: string; chunk_count: number }>;
};

async function downloadJsonOrNull(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<any | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  try {
    const text = await data.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function coerceDocuments(payload: Record<string, unknown>): MesDocInput[] {
  const raw = payload.documents;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("BLOCKED: documents is REQUIRED (non-empty array)");
  }
  return raw.map((d, idx) => {
    const obj = (d && typeof d === "object") ? (d as Record<string, unknown>) : {};
    const docId = typeof obj.doc_id === "string" ? obj.doc_id.trim() : "";
    const text = typeof obj.text === "string" ? obj.text : "";
    const title = typeof obj.title === "string" ? obj.title.trim() : undefined;
    const url = typeof obj.url === "string" ? obj.url.trim() : undefined;
    if (!docId) throw new Error(`BLOCKED: documents[${idx}].doc_id is REQUIRED`);
    if (!text.trim()) throw new Error(`BLOCKED: documents[${idx}].text is REQUIRED`);
    return { doc_id: docId, title, text, url };
  });
}

export class MesCorpusIndex implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
    const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

    const docs = coerceDocuments(payload);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();

    await emitAgentJobEvent(jobId, "generating", 5, "Preparing MES corpus indexing", {
      organizationId,
      documentCount: docs.length,
      model: EMBEDDING_MODEL,
    });

    // Load existing index (best-effort) and merge
    const indexPath = `${organizationId}/mes-corpus/index.json`;
    const existingIndex = await downloadJsonOrNull(supabase, "materials", indexPath);
    const mergedIndex: MesCorpusIndexFile = {
      version: 1,
      updated_at: nowIso,
      documents: {},
    };
    if (existingIndex && typeof existingIndex === "object" && typeof (existingIndex as any).documents === "object") {
      mergedIndex.documents = { ...(existingIndex as any).documents };
    }

    let totalChunks = 0;
    let totalVectors = 0;

    // Process each doc independently for clearer progress + failure attribution
    for (let di = 0; di < docs.length; di++) {
      const doc = docs[di];
      const docKey = `mes:${doc.doc_id}`;

      await emitAgentJobEvent(jobId, "enriching", 10 + Math.floor((di / Math.max(docs.length, 1)) * 30), `Chunking ${doc.doc_id}`, {
        doc_id: doc.doc_id,
      });

      const chunks = chunkText(doc.text, 900, 1600, 200);
      if (chunks.length === 0) throw new Error(`Chunking produced 0 chunks for doc_id=${doc.doc_id}`);
      totalChunks += chunks.length;

      // Clear existing vectors for this docKey
      await supabase
        .from("content_embeddings")
        .delete()
        .eq("organization_id", organizationId)
        .eq("course_id", docKey)
        .eq("content_type", "reference");

      const BATCH_SIZE = 32;
      const maxChars = 12000;
      let embeddedForDoc = 0;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE).map((t) => truncateForEmbedding(t, maxChars));
        const vectors = await generateEmbeddings(batch, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });

        const rows = vectors.map((embedding, idx) => ({
          id: crypto.randomUUID(),
          organization_id: organizationId,
          course_id: docKey,
          group_index: 0,
          item_index: i + idx,
          content_type: "reference",
          option_id: null,
          text_content: chunks[i + idx],
          embedding,
        }));

        const { error } = await supabase.from("content_embeddings").insert(rows);
        if (error) throw new Error(`Failed to store embeddings for doc_id=${doc.doc_id}: ${error.message}`);

        embeddedForDoc += rows.length;
        totalVectors += rows.length;

        const base = 45;
        const span = 45; // 45..90 reserved for embeddings
        const docFrac = Math.min(1, embeddedForDoc / chunks.length);
        const overallFrac = (di + docFrac) / Math.max(docs.length, 1);
        const pct = Math.min(90, base + Math.floor(overallFrac * span));
        await emitAgentJobEvent(jobId, "enriching", pct, `Embedded ${embeddedForDoc}/${chunks.length} chunks for ${doc.doc_id}`, {
          doc_id: doc.doc_id,
          embeddedForDoc,
          chunkCount: chunks.length,
        });
      }

      mergedIndex.documents[doc.doc_id] = {
        title: doc.title,
        url: doc.url,
        indexed_at: nowIso,
        chunk_count: chunks.length,
      };
    }

    await emitAgentJobEvent(jobId, "storage_write", 93, "Saving MES corpus index", {
      indexPath,
      documents: Object.keys(mergedIndex.documents).length,
    });
    await uploadJson(supabase, "materials", indexPath, mergedIndex);

    await emitAgentJobEvent(jobId, "done", 100, "MES corpus indexed", {
      documentCount: docs.length,
      totalChunks,
      totalVectors,
      indexPath,
    });

    return {
      ok: true,
      indexed: docs.length,
      totalChunks,
      totalVectors,
      indexPath,
    };
  }
}


