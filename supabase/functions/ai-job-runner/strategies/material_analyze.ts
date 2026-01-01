import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { generateJson } from "../../_shared/ai.ts";

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

async function downloadText(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Failed to download ${bucket}/${path}: ${error?.message || "no data"}`);
  const text = await data.text();
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Downloaded content is empty: ${bucket}/${path}`);
  return trimmed;
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

export class MaterialAnalyze implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const materialId =
      optionalString(payload, "material_id") ||
      optionalString(payload, "materialId");
    if (!materialId) throw new Error("BLOCKED: material_id is REQUIRED");

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    await emitAgentJobEvent(jobId, "generating", 10, "Loading material record", { materialId });

    const { data: record, error: recordErr } = await supabase
      .from("entity_records")
      .select("id, title, data")
      .eq("organization_id", organizationId)
      .eq("entity", "library-material")
      .eq("id", materialId)
      .maybeSingle();

    if (recordErr) throw new Error(`Failed to load library-material record: ${recordErr.message}`);
    if (!record?.data || typeof record.data !== "object") throw new Error("Material record missing data");

    const material = record.data as Record<string, unknown>;
    const summary = (material.analysis_summary && typeof material.analysis_summary === "object")
      ? (material.analysis_summary as Record<string, unknown>)
      : {};
    const ingest = (summary.ingest && typeof summary.ingest === "object") ? (summary.ingest as Record<string, unknown>) : null;

    const extracted = ingest?.extracted && typeof ingest.extracted === "object" ? (ingest.extracted as Record<string, unknown>) : null;
    const extractedBucket = (extracted?.bucket && typeof extracted.bucket === "string") ? String(extracted.bucket) : null;
    const extractedPath = (extracted?.path && typeof extracted.path === "string") ? String(extracted.path) : null;

    if (!extractedBucket || !extractedPath) {
      throw new Error("BLOCKED: material is not ingested yet (missing ingest.extracted.bucket/path)");
    }

    await emitAgentJobEvent(jobId, "storage_write", 20, "Loading extracted text", { materialId, extracted: `${extractedBucket}/${extractedPath}` });
    const text = await downloadText(supabase, extractedBucket, extractedPath);

    // Keep prompts bounded to avoid Edge/LLM timeouts.
    const PROMPT_MAX_CHARS = 16000;
    const promptText = text.length > PROMPT_MAX_CHARS ? text.slice(0, PROMPT_MAX_CHARS) : text;

    await emitAgentJobEvent(jobId, "generating", 40, "Calling LLM for analysis summary", { materialId });

    const system = [
      "You are a teaching assistant.",
      "Analyze the provided educational material and produce a teacher-facing summary and actionable recommendations.",
      "Return STRICT JSON only.",
    ].join("\n");

    const prompt = [
      "Material:",
      promptText,
      "",
      "Return JSON with the following shape:",
      "{",
      '  "summary": string,',
      '  "key_concepts": string[],',
      '  "suggested_assignments": string[],',
      '  "suggested_questions": string[]',
      "}",
    ].join("\n");

    const res = await generateJson({
      system,
      prompt,
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 110000,
      prefillJson: true,
    });

    if (!res.ok) {
      const err = res.error === "no_provider"
        ? "BLOCKED: No LLM provider configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)"
        : `LLM error: ${res.error}`;
      throw new Error(err);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      throw new Error(`LLM returned invalid JSON: ${res.text.slice(0, 200)}`);
    }

    const analysis = {
      analyzed_at: new Date().toISOString(),
      ...parsed,
    };

    await emitAgentJobEvent(jobId, "storage_write", 70, "Saving analysis artifact", { materialId });
    const analysisPath = `${organizationId}/${materialId}/derived/analysis.json`;
    await uploadJson(supabase, "materials", analysisPath, analysis);

    await emitAgentJobEvent(jobId, "catalog_update", 85, "Updating material record with analysis", { materialId });

    const now = new Date().toISOString();
    const recordTitle = String(material.title || record.title || `Material ${materialId}`);

    const nextData: Record<string, unknown> = {
      ...material,
      id: materialId,
      organization_id: organizationId,
      title: recordTitle,
      status: "ready",
      analysis_summary: {
        ...summary,
        analysis,
        derived: {
          ...(summary.derived && typeof summary.derived === "object" ? (summary.derived as Record<string, unknown>) : {}),
          analysis_artifact: { bucket: "materials", path: analysisPath },
        },
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
          data: nextData,
          updated_at: now,
          created_at: (material.created_at as string | undefined) ?? now,
        },
        { onConflict: "id" },
      );
    if (upsertErr) throw new Error(`Failed to persist library-material record: ${upsertErr.message}`);

    await emitAgentJobEvent(jobId, "done", 100, "Material analysis complete", { materialId });

    return {
      ok: true,
      material_id: materialId,
      analysis_artifact: { bucket: "materials", path: analysisPath },
    };
  }
}



