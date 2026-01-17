import { z } from "zod";

// ---------------------------------------------------------------------------
// Curated (pre-rendered) materials
// - Stored as an entity_records row with entity="curated-material" (search index)
// - Full pack payload stored in Storage (materials bucket), referenced by storage_path
// ---------------------------------------------------------------------------

export const CURATED_MATERIAL_ENTITY = "curated-material" as const;
export const CURATED_STORAGE_BUCKET = "materials" as const;

export const CuratedMaterialTypeSchema = z.enum(["casus", "werkopdracht", "examen", "theorie", "oefening"]);
export type CuratedMaterialType = z.infer<typeof CuratedMaterialTypeSchema>;

export const CuratedLanguageVariantSchema = z.enum(["b2", "b1", "a2", "ar"]);
export type CuratedLanguageVariant = z.infer<typeof CuratedLanguageVariantSchema>;

export const CuratedKeywordAnnotationSchema = z.object({
  // Dutch term that the learner should internalize
  nl: z.string().min(1),
  // Optional: the matching Arabic term (helpful for generation + indexing)
  ar: z.string().min(1).optional(),
});
export type CuratedKeywordAnnotation = z.infer<typeof CuratedKeywordAnnotationSchema>;

/**
 * Pack payload persisted to Storage (JSON).
 *
 * Notes:
 * - `content_html` is the canonical render payload for the teacher UI.
 * - For Arabic (`language_variant="ar"`), the HTML should embed Dutch keywords using a blue
 *   styling convention, e.g. `( <span class="nl-term">bloeddruk</span> )`.
 * - `nl_keywords` is a flattened list for indexing/search (even for Arabic packs).
 */
export const CuratedMaterialPackV1Schema = z.object({
  schema_version: z.literal(1),
  id: z.string().uuid(),
  title: z.string().min(1),
  material_type: CuratedMaterialTypeSchema,
  language_variant: CuratedLanguageVariantSchema,
  module_id: z.string().min(1).optional(),
  kd_codes: z.array(z.string().min(1)).default([]),
  // Indexing/search helpers
  keywords: z.array(z.string().min(1)).default([]),
  nl_keywords: z.array(z.string().min(1)).default([]),
  // Short snippet for previews/search results
  preview: z.string().min(1).optional(),
  // Render payload (HTML)
  content_html: z.string().min(1),
  // Optional: explicit NL↔AR keyword map used by Arabic generator
  keyword_annotations: z.array(CuratedKeywordAnnotationSchema).optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});
export type CuratedMaterialPackV1 = z.infer<typeof CuratedMaterialPackV1Schema>;

export const CuratedMaterialMetadataSchema = z.object({
  mbo_track: z.string().min(1).optional(),
  module_family: z.string().min(1).optional(),
  topic_tags: z.array(z.string().min(1)).default([]),
  exercise_format: z.string().min(1).optional(),
  scenario_present: z.boolean().optional(),
  law_topics: z.array(z.string().min(1)).default([]),
  communication_context: z.array(z.string().min(1)).default([]),
});
export type CuratedMaterialMetadata = z.infer<typeof CuratedMaterialMetadataSchema>;

/**
 * Search/index record stored in `entity_records.data` for entity="curated-material".
 * This record must be sufficient for `search-curated-materials` to rank + preview results
 * without downloading the full pack file.
 */
export const CuratedMaterialIndexRecordV1Schema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  material_type: CuratedMaterialTypeSchema,
  module_id: z.string().min(1).optional(),
  kd_codes: z.array(z.string().min(1)).default([]),
  // Shared search keywords (e.g. module/domain tags); per-variant keywords live under `variants`.
  keywords: z.array(z.string().min(1)).default([]),
  metadata: CuratedMaterialMetadataSchema.optional(),
  variants: z.object({
    b2: z.object({
      storage_bucket: z.literal(CURATED_STORAGE_BUCKET),
      storage_path: z.string().min(1),
      preview: z.string().min(1).optional(),
      keywords: z.array(z.string().min(1)).default([]),
      nl_keywords: z.array(z.string().min(1)).default([]),
      updated_at: z.string().min(1),
    }).optional(),
    b1: z.object({
      storage_bucket: z.literal(CURATED_STORAGE_BUCKET),
      storage_path: z.string().min(1),
      preview: z.string().min(1).optional(),
      keywords: z.array(z.string().min(1)).default([]),
      nl_keywords: z.array(z.string().min(1)).default([]),
      updated_at: z.string().min(1),
    }).optional(),
    a2: z.object({
      storage_bucket: z.literal(CURATED_STORAGE_BUCKET),
      storage_path: z.string().min(1),
      preview: z.string().min(1).optional(),
      keywords: z.array(z.string().min(1)).default([]),
      nl_keywords: z.array(z.string().min(1)).default([]),
      updated_at: z.string().min(1),
    }).optional(),
    ar: z.object({
      storage_bucket: z.literal(CURATED_STORAGE_BUCKET),
      storage_path: z.string().min(1),
      preview: z.string().min(1).optional(),
      keywords: z.array(z.string().min(1)).default([]),
      nl_keywords: z.array(z.string().min(1)).default([]),
      updated_at: z.string().min(1),
    }).optional(),
  }).refine((v) => Boolean(v.b2 || v.b1 || v.a2 || v.ar), { message: "At least one variant is required" }),
  pack_schema_version: z.literal(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});
export type CuratedMaterialIndexRecordV1 = z.infer<typeof CuratedMaterialIndexRecordV1Schema>;

export function buildCuratedPackStoragePath(args: {
  organizationId: string;
  materialId: string;
  languageVariant: CuratedLanguageVariant;
}): string {
  const org = String(args.organizationId || "").trim();
  const id = String(args.materialId || "").trim();
  const lang = args.languageVariant;
  if (!org) throw new Error("organizationId is required");
  if (!id) throw new Error("materialId is required");
  return `${org}/${id}/curated/${lang}.json`;
}

