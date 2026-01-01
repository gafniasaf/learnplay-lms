import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { buildLessonKit } from "../../_shared/lesson-kit/index.ts";

function requireString(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${key} is REQUIRED`);
  }
  return v.trim();
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function optionalBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const v = payload[key];
  if (typeof v !== "boolean") return undefined;
  return v;
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(`BLOCKED: ${name} is REQUIRED`);
  }
  return v;
}

async function uploadJson(
  supabase: ReturnType<typeof createClient>,
  path: string,
  data: unknown,
): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage
    .from("courses")
    .upload(path, blob, { upsert: true, contentType: "application/json" });
  if (error) {
    throw new Error(`Storage upload failed (${path}): ${error.message}`);
  }
}

async function downloadText(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Failed to download ${bucket}/${path}: ${error?.message || "no data"}`);
  }
  const text = await data.text();
  if (!text.trim()) {
    throw new Error(`Downloaded content is empty: ${bucket}/${path}`);
  }
  return text;
}

/**
 * Manual strategy override for lessonkit_build.
 *
 * Uses the ported 3-pass lesson kit pipeline in `supabase/functions/_shared/lesson-kit/*`.
 */
export class LessonkitBuild implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    // Required (no fallbacks)
    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const moduleId =
      optionalString(payload, "module_id") ||
      optionalString(payload, "moduleId");
    if (!moduleId) throw new Error("BLOCKED: module_id is REQUIRED");

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // html_content OR storage_bucket + storage_path
    const htmlContentInline = optionalString(payload, "html_content") || optionalString(payload, "htmlContent");
    const storageBucket = optionalString(payload, "storage_bucket") || optionalString(payload, "storageBucket");
    const storagePath = optionalString(payload, "storage_path") || optionalString(payload, "storagePath");

    let htmlContent: string;
    if (htmlContentInline) {
      htmlContent = htmlContentInline;
    } else if (storageBucket && storagePath) {
      htmlContent = await downloadText(supabase, storageBucket, storagePath);
    } else {
      throw new Error("BLOCKED: html_content is REQUIRED (or provide storage_bucket + storage_path)");
    }

    const protocol = optionalString(payload, "protocol");
    const autoRepair = optionalBoolean(payload, "auto_repair") ?? optionalBoolean(payload, "autoRepair");
    const skipLLM = optionalBoolean(payload, "skipLLM") ?? optionalBoolean(payload, "skip_llm");
    const thresholds = (payload.thresholds && typeof payload.thresholds === "object") ? payload.thresholds as Record<string, unknown> : undefined;

    // Optional metadata for the entity record
    const title = optionalString(payload, "title");
    const locale = optionalString(payload, "locale");
    const materialId = optionalString(payload, "material_id") || optionalString(payload, "materialId");
    const sourceCourseId = optionalString(payload, "source_course_id") || optionalString(payload, "sourceCourseId");

    // Persist request input (debug)
    await uploadJson(supabase, `debug/jobs/${jobId}/lessonkit_input.json`, {
      jobId,
      organization_id: organizationId,
      module_id: moduleId,
      protocol: protocol || null,
      auto_repair: autoRepair ?? null,
      skipLLM: skipLLM ?? null,
      thresholds: thresholds ?? null,
      // Do NOT inline html_content here (may be large); store separately to avoid huge JSON envelopes.
      html_source: htmlContentInline ? "inline" : `${storageBucket}/${storagePath}`,
      locale: locale ?? null,
      material_id: materialId ?? null,
      source_course_id: sourceCourseId ?? null,
      title: title ?? null,
    });
    await uploadJson(supabase, `debug/jobs/${jobId}/lessonkit_source.html.json`, { html: htmlContent });

    const result = await buildLessonKit(moduleId, htmlContent, {
      protocolId: protocol,
      autoRepair: autoRepair,
      skipLLM: skipLLM,
      thresholds: thresholds as any,
    });

    // Persist output artifact (debug)
    await uploadJson(supabase, `debug/jobs/${jobId}/lessonkit_result.json`, result);

    const now = new Date().toISOString();
    const success = (result as any)?.success === true;
    const needsReview = Boolean((result as any)?.needsReview);
    const status: "draft" | "ready" | "failed" = success ? (needsReview ? "draft" : "ready") : "failed";

    const recordId = jobId;
    const entity = "lesson-kit";
    const recordTitle = title || (success ? (result as any)?.kit?.title : undefined) || moduleId;

    const recordData: Record<string, unknown> = {
      id: recordId,
      organization_id: organizationId,
      version: 1,
      format: "v1",
      created_at: now,
      updated_at: now,
      title: recordTitle,
      material_id: materialId,
      source_course_id: sourceCourseId,
      locale: locale,
      status,
      kit: success ? (result as any).kit : null,
      guard_report: {
        success,
        needsReview,
        groundingScore: (result as any)?.groundingScore ?? null,
        error: success ? null : String((result as any)?.error || "lessonkit_build failed"),
        logs: Array.isArray((result as any)?.logs) ? (result as any).logs : [],
      },
      // Also store the request metadata for traceability.
      request: {
        module_id: moduleId,
        protocol: protocol || null,
        auto_repair: autoRepair ?? null,
        skipLLM: skipLLM ?? null,
      },
    };

    const { error: upsertErr } = await supabase
      .from("entity_records")
      .upsert(
        {
          id: recordId,
          organization_id: organizationId,
          entity,
          title: recordTitle,
          data: recordData,
          updated_at: now,
          created_at: now,
        },
        { onConflict: "id" },
      );

    if (upsertErr) {
      throw new Error(`Failed to persist lesson-kit record: ${upsertErr.message}`);
    }

    if (!success) {
      throw new Error(String((result as any)?.error || "lessonkit_build failed"));
    }

    return {
      ok: true,
      lessonKitRecordId: recordId,
      status,
      needsReview,
      groundingScore: (result as any)?.groundingScore ?? null,
    };
  }
}



