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

async function downloadJson(
  supabase: ReturnType<typeof createClient>,
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

async function uploadText(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  text: string,
  contentType = "text/csv",
): Promise<void> {
  const blob = new Blob([text], { type: contentType });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export class StandardsExport implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const mappingId =
      optionalString(payload, "mapping_id") ||
      optionalString(payload, "mappingId");
    if (!mappingId) throw new Error("BLOCKED: mapping_id is REQUIRED");

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    await emitAgentJobEvent(jobId, "generating", 10, "Loading standards-mapping record", { mappingId });

    const { data: mapRow, error: mapErr } = await supabase
      .from("entity_records")
      .select("id, title, data")
      .eq("organization_id", organizationId)
      .eq("entity", "standards-mapping")
      .eq("id", mappingId)
      .maybeSingle();
    if (mapErr) throw new Error(`Failed to load standards-mapping record: ${mapErr.message}`);
    if (!mapRow?.data || typeof mapRow.data !== "object") throw new Error("Mapping record missing data");

    const mapData = mapRow.data as Record<string, unknown>;
    const mappingMeta = (mapData.mapping && typeof mapData.mapping === "object") ? (mapData.mapping as Record<string, unknown>) : {};
    const artifact = (mappingMeta.artifact && typeof mappingMeta.artifact === "object") ? (mappingMeta.artifact as Record<string, unknown>) : {};
    const artifactBucket = typeof artifact.bucket === "string" ? artifact.bucket : null;
    const artifactPath = typeof artifact.path === "string" ? artifact.path : null;
    if (!artifactBucket || !artifactPath) throw new Error("BLOCKED: standards-mapping missing mapping.artifact");

    await emitAgentJobEvent(jobId, "storage_write", 25, "Downloading mapping artifact", { artifact: `${artifactBucket}/${artifactPath}` });
    const artifactJson = await downloadJson(supabase, artifactBucket, artifactPath);

    const items = Array.isArray(artifactJson?.items) ? artifactJson.items as any[] : [];
    if (items.length === 0) throw new Error("Mapping artifact contains 0 items");

    await emitAgentJobEvent(jobId, "generating", 50, "Rendering CSV export", { itemCount: items.length });

    const rows: string[] = [];
    rows.push([
      "mapping_id",
      "standards_document_id",
      "material_id",
      "standard_code",
      "standard_text",
      "match_rank",
      "material_chunk_index",
      "similarity",
      "material_chunk_text",
    ].join(","));

    const standardsDocumentId = String(mapData.standards_document_id || artifactJson?.standards_document_id || "");
    const materialId = String(mapData.material_id || artifactJson?.material_id || "");

    let lineCount = 0;
    for (const it of items) {
      const code = String(it?.code || "");
      const text = String(it?.text || "");
      const matches = Array.isArray(it?.matches) ? it.matches : [];
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i] || {};
        rows.push([
          csvEscape(mappingId),
          csvEscape(standardsDocumentId),
          csvEscape(materialId),
          csvEscape(code),
          csvEscape(text),
          csvEscape(i + 1),
          csvEscape(m?.item_index ?? ""),
          csvEscape(m?.similarity ?? ""),
          csvEscape(m?.text ?? ""),
        ].join(","));
        lineCount++;
      }
    }

    const exportPath = `${organizationId}/standards/mappings/${mappingId}/mapping.csv`;
    await emitAgentJobEvent(jobId, "storage_write", 75, "Uploading CSV export", { exportPath, rows: lineCount });
    await uploadText(supabase, "materials", exportPath, rows.join("\n"), "text/csv");

    await emitAgentJobEvent(jobId, "catalog_update", 90, "Updating standards-mapping record with export info", { mappingId });

    const now = new Date().toISOString();
    const nextData: Record<string, unknown> = {
      ...mapData,
      export: {
        ...(mapData.export && typeof mapData.export === "object" ? (mapData.export as Record<string, unknown>) : {}),
        csv: { bucket: "materials", path: exportPath },
        exported_at: now,
        rows: lineCount,
      },
      updated_at: now,
    };

    const { error: upsertErr } = await supabase
      .from("entity_records")
      .upsert(
        {
          id: mappingId,
          organization_id: organizationId,
          entity: "standards-mapping",
          title: String(mapRow.title || mapData.title || `Mapping ${mappingId}`),
          data: nextData,
          updated_at: now,
          created_at: (mapData.created_at as string | undefined) ?? now,
        },
        { onConflict: "id" },
      );
    if (upsertErr) throw new Error(`Failed to persist standards-mapping record: ${upsertErr.message}`);

    await emitAgentJobEvent(jobId, "done", 100, "Standards export complete", { mappingId, exportPath });

    return { ok: true, mapping_id: mappingId, export_path: exportPath };
  }
}



