import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { extractText, parseText } from "../../_shared/materials/ingest-utils.ts";

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

function requireString(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`BLOCKED: ${key} is REQUIRED`);
  return v.trim();
}

async function downloadBytes(
  supabase: any,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Failed to download ${bucket}/${path}: ${error?.message || "no data"}`);
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
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

type StandardsItem = { code: string; text: string };

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseStandardsItems(text: string): StandardsItem[] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => normalizeLine(l))
    .filter((l) => l.length > 0);

  const items: StandardsItem[] = [];
  for (const line of lines) {
    // Accept patterns like "CODE: text" or "CODE - text"
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]{0,40})\s*[:\-–]\s*(.+)$/);
    if (m?.[1] && m?.[2]) {
      items.push({ code: m[1].trim(), text: m[2].trim() });
      continue;
    }
    items.push({ code: "", text: line });
  }

  // Fill empty codes deterministically (S001…)
  let n = 1;
  for (const it of items) {
    if (!it.code) {
      it.code = `S${String(n).padStart(3, "0")}`;
      n++;
    }
  }

  return items;
}

export class StandardsIngest implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const standardsDocumentId =
      optionalString(payload, "standards_document_id") ||
      optionalString(payload, "standardsDocumentId") ||
      requireString(payload, "standards_document_id");

    const storageBucket =
      optionalString(payload, "storage_bucket") ||
      optionalString(payload, "storageBucket") ||
      requireString(payload, "storage_bucket");
    const storagePath =
      optionalString(payload, "storage_path") ||
      optionalString(payload, "storagePath") ||
      requireString(payload, "storage_path");

    const fileName =
      optionalString(payload, "file_name") ||
      optionalString(payload, "fileName") ||
      storagePath.split("/").pop() ||
      "standards";
    const contentType =
      optionalString(payload, "content_type") ||
      optionalString(payload, "contentType") ||
      "application/octet-stream";
    const locale = optionalString(payload, "locale") || "und";

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const now = new Date().toISOString();

    await emitAgentJobEvent(jobId, "storage_write", 5, "Downloading standards source", {
      standardsDocumentId,
      storage: `${storageBucket}/${storagePath}`,
    });

    const bytes = await downloadBytes(supabase, storageBucket, storagePath);

    await emitAgentJobEvent(jobId, "generating", 20, "Extracting text from standards document", {
      standardsDocumentId,
      fileName,
      contentType,
    });

    const extracted = await extractText(bytes, contentType, fileName);
    const parsed = parseText(extracted);
    if (!parsed.text.trim()) throw new Error("Extraction produced empty text");

    await emitAgentJobEvent(jobId, "generating", 40, "Parsing standards items", { standardsDocumentId });
    const items = parseStandardsItems(parsed.text);
    if (items.length === 0) throw new Error("No standards items parsed");

    const artifactPath = `${organizationId}/${standardsDocumentId}/derived/standards_items.json`;
    await emitAgentJobEvent(jobId, "storage_write", 60, "Saving parsed standards items artifact", {
      standardsDocumentId,
      artifactPath,
      itemCount: items.length,
    });
    await uploadJson(supabase, "materials", artifactPath, {
      standards_document_id: standardsDocumentId,
      locale,
      item_count: items.length,
      items,
    });

    await emitAgentJobEvent(jobId, "catalog_update", 85, "Updating standards-document record", { standardsDocumentId });

    const recordTitle = optionalString(payload, "title") || fileName;
    const recordData: Record<string, unknown> = {
      id: standardsDocumentId,
      organization_id: organizationId,
      title: recordTitle,
      source: "upload",
      locale,
      file_name: fileName,
      content_type: contentType,
      storage_path: storagePath,
      status: "ready",
      item_count: items.length,
      // Keep the full list in data for small docs; for large docs, the artifact is the source of truth.
      items,
      ingest_summary: {
        ingested_at: now,
        source: { bucket: storageBucket, path: storagePath },
        parsed: { item_count: items.length, artifact: { bucket: "materials", path: artifactPath } },
        extracted: { word_count: parsed.wordCount, char_count: parsed.text.length },
      },
      updated_at: now,
      created_at: now,
    };

    const { error: upsertErr } = await supabase
      .from("entity_records")
      .upsert(
        {
          id: standardsDocumentId,
          organization_id: organizationId,
          entity: "standards-document",
          title: recordTitle,
          data: recordData,
          updated_at: now,
          created_at: now,
        },
        { onConflict: "id" },
      );

    if (upsertErr) throw new Error(`Failed to persist standards-document record: ${upsertErr.message}`);

    await emitAgentJobEvent(jobId, "done", 100, "Standards ingest complete", {
      standardsDocumentId,
      itemCount: items.length,
    });

    return { ok: true, standards_document_id: standardsDocumentId, item_count: items.length };
  }
}



