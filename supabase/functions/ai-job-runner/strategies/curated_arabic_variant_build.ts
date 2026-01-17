import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { generateJson, getProvider } from "../../_shared/ai.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v;
}

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

function uniqueStrings(items: unknown[], max = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of items) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

async function downloadJson(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Failed to download ${bucket}/${path}: ${error?.message || "no data"}`);
  }
  const text = await data.text();
  if (!text.trim()) throw new Error(`Downloaded JSON is empty: ${bucket}/${path}`);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON at ${bucket}/${path}`);
  }
}

async function uploadJson(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  data: unknown,
): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function requiredNlSpansMissing(html: string, nlKeywords: string[], maxCheck = 12): string[] {
  const needles = nlKeywords.slice(0, maxCheck);
  const missing: string[] = [];
  for (const kw of needles) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`<span\\s+class=["']nl-term["']\\s*>\\s*${escaped}\\s*<\\/span>`, "i");
    if (!re.test(html)) missing.push(kw);
  }
  return missing;
}

/**
 * Offline/high-quality: Arabic variant with Dutch keywords in blue parentheses.
 *
 * Input payload (fail-loud):
 * - organization_id (string)
 * - curated_material_id (string, UUID)  -> entity_records.id (entity="curated-material")
 * - source_language_variant (string)    -> one of b2|b1|a2 (must exist in record.variants)
 */
export class CuratedArabicVariantBuild implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId = requireString(payload, "organization_id");
    const curatedId = requireString(payload, "curated_material_id");
    const sourceLang = requireString(payload, "source_language_variant");

    if (!["b2", "b1", "a2"].includes(sourceLang)) {
      throw new Error("BLOCKED: source_language_variant must be one of b2|b1|a2");
    }

    // Fail loud if LLM provider is missing
    if (getProvider() === "none") {
      throw new Error("BLOCKED: OPENAI_API_KEY or ANTHROPIC_API_KEY is REQUIRED");
    }

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: row, error: recErr } = await supabase
      .from("entity_records")
      .select("id, title, data")
      .eq("organization_id", organizationId)
      .eq("entity", "curated-material")
      .eq("id", curatedId)
      .maybeSingle();

    if (recErr) throw new Error(`Failed to load curated-material record: ${recErr.message}`);
    if (!row) throw new Error("BLOCKED: curated-material record not found");

    const recordData = (row as any).data && typeof (row as any).data === "object" ? (row as any).data : {};
    const variants = recordData?.variants && typeof recordData.variants === "object" ? recordData.variants as Record<string, any> : {};
    const sourceVariant = variants?.[sourceLang];
    if (!sourceVariant || typeof sourceVariant !== "object") {
      throw new Error(`BLOCKED: source variant missing in record.variants.${sourceLang}`);
    }

    const sourceBucket = typeof sourceVariant.storage_bucket === "string" ? sourceVariant.storage_bucket : "";
    const sourcePath = typeof sourceVariant.storage_path === "string" ? sourceVariant.storage_path : "";
    if (!sourceBucket || !sourcePath) {
      throw new Error(`BLOCKED: record.variants.${sourceLang}.storage_bucket/storage_path are REQUIRED`);
    }

    const sourcePack = await downloadJson(supabase, sourceBucket, sourcePath);
    if (!sourcePack || typeof sourcePack !== "object") throw new Error("Invalid source pack JSON");
    if (sourcePack.schema_version !== 1) throw new Error("BLOCKED: source pack schema_version must be 1");
    if (typeof sourcePack.content_html !== "string" || !sourcePack.content_html.trim()) {
      throw new Error("BLOCKED: source pack content_html is required");
    }

    const nlKeywords = uniqueStrings(
      Array.isArray(sourcePack.nl_keywords) ? sourcePack.nl_keywords : (Array.isArray(sourcePack.keywords) ? sourcePack.keywords : []),
      30,
    );

    const now = new Date().toISOString();
    const targetPath = `${organizationId}/${curatedId}/curated/ar.json`;
    const targetBucket = "materials";

    // If Arabic variant already exists and looks complete, do nothing unless forced
    const force = optionalString(payload, "force") === "true" || payload["force"] === true;
    const existingAr = variants?.ar;
    if (!force && existingAr && typeof existingAr === "object" && typeof existingAr.storage_path === "string" && existingAr.storage_path.trim()) {
      return { ok: true, status: "skipped", curated_material_id: curatedId, language_variant: "ar", reason: "already_exists" };
    }

    const system = [
      "You are a careful medical education translator.",
      "You translate Dutch healthcare learning content to Arabic (Modern Standard Arabic).",
      "You MUST preserve factual meaning. Do not add new facts.",
      "Output MUST be valid JSON.",
    ].join("\n");

    const keywordList = nlKeywords.slice(0, 20);
    const promptBase = [
      "Translate the following Dutch HTML to Arabic (RTL). Preserve headings/lists and keep it teacher-friendly.",
      "",
      "CRITICAL formatting rules:",
      "- Wrap the output in a single <div dir=\"rtl\" style=\"text-align:right\">...</div>",
      "- Whenever you translate a key concept, append the Dutch keyword in parentheses, in BLUE using: (<span class=\"nl-term\">DUTCH</span>)",
      "- Ensure each of these Dutch keywords appears at least once EXACTLY inside <span class=\"nl-term\">...</span>:",
      keywordList.map((k) => `  - ${k}`).join("\n"),
      "",
      "Input HTML (Dutch):",
      sourcePack.content_html,
      "",
      "Return JSON with keys:",
      "- content_html: string (Arabic HTML as described)",
      "- preview: string (1-2 sentence Arabic preview; may include a few NL terms in <span class=\"nl-term\">)",
      "- keyword_annotations: array of { nl: string, ar: string } for the provided Dutch keywords",
    ].join("\n");

    const MAX_ATTEMPTS = 2;
    let attempt = 0;
    let generated: any = null;
    let lastError = "";

    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      const llm = await generateJson({
        system,
        prompt: attempt === 1 ? promptBase : [
          promptBase,
          "",
          "REPAIR REQUEST:",
          lastError ? `Previous output failed validation: ${lastError}` : "",
          "Fix the output so that missing Dutch keywords are included as <span class=\"nl-term\">DUTCH</span> (keep meaning).",
        ].join("\n"),
        temperature: 0.2,
        maxTokens: 4000,
        timeoutMs: 120000,
      });

      if (!llm.ok) {
        lastError = llm.error || "LLM failed";
        continue;
      }

      try {
        generated = JSON.parse(llm.text);
      } catch {
        lastError = "LLM returned invalid JSON";
        generated = null;
        continue;
      }

      const html = typeof generated?.content_html === "string" ? generated.content_html : "";
      if (!html.trim()) {
        lastError = "content_html missing";
        generated = null;
        continue;
      }
      if (!containsArabic(html)) {
        lastError = "content_html does not look like Arabic";
        generated = null;
        continue;
      }

      const missing = requiredNlSpansMissing(html, keywordList, 12);
      if (missing.length) {
        lastError = `missing nl-term spans for: ${missing.join(", ")}`;
        generated = null;
        continue;
      }

      // Valid
      break;
    }

    if (!generated) {
      throw new Error(`Arabic generation failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
    }

    const arabicPack = {
      ...sourcePack,
      schema_version: 1,
      id: curatedId,
      language_variant: "ar",
      // Keep NL keyword list for search/indexing even on Arabic variant
      nl_keywords: nlKeywords,
      preview: typeof generated.preview === "string" ? generated.preview : (typeof sourcePack.preview === "string" ? sourcePack.preview : undefined),
      content_html: generated.content_html,
      keyword_annotations: Array.isArray(generated.keyword_annotations) ? generated.keyword_annotations : sourcePack.keyword_annotations,
      updated_at: now,
    };

    // Persist pack
    await uploadJson(supabase, targetBucket, targetPath, arabicPack);

    // Persist index record update (variants map)
    const nextRecordData: Record<string, unknown> = {
      ...(recordData as Record<string, unknown>),
      id: curatedId,
      organization_id: organizationId,
      pack_schema_version: 1,
      updated_at: now,
      variants: {
        ...(variants as Record<string, unknown>),
        ar: {
          storage_bucket: targetBucket,
          storage_path: targetPath,
          preview: typeof arabicPack.preview === "string" ? arabicPack.preview : undefined,
          keywords: uniqueStrings([...(Array.isArray(sourcePack.keywords) ? sourcePack.keywords : []), ...nlKeywords], 60),
          nl_keywords: nlKeywords,
          updated_at: now,
        },
      },
    };

    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : (typeof recordData?.title === "string" ? recordData.title : curatedId);
    const { error: upsertErr } = await supabase
      .from("entity_records")
      .upsert(
        {
          id: curatedId,
          organization_id: organizationId,
          entity: "curated-material",
          title,
          data: nextRecordData,
          updated_at: now,
          created_at: now,
        },
        { onConflict: "id" },
      );

    if (upsertErr) {
      throw new Error(`Failed to persist curated-material record: ${upsertErr.message}`);
    }

    // Debug artifact (small)
    try {
      await uploadJson(supabase, "courses", `debug/jobs/${jobId}/curated_arabic_variant_result.json`, {
        ok: true,
        curated_material_id: curatedId,
        source_language_variant: sourceLang,
        language_variant: "ar",
        storage_bucket: targetBucket,
        storage_path: targetPath,
        updated_at: now,
      });
    } catch {
      // ignore debug upload failures
    }

    return {
      ok: true,
      curated_material_id: curatedId,
      language_variant: "ar",
      storage_bucket: targetBucket,
      storage_path: targetPath,
      updated_at: now,
    };
  }
}

