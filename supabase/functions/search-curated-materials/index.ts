import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions, getRequestId } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type SearchRequest = {
  query?: string;
  kd_code?: string;
  material_type?: string;
  category?: string;
  mbo_level?: string;
  source?: string;
  language_variant?: string;
  limit?: number;
};

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function json(req: Request, reqId: string, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }),
  });
}

function scoreText(haystack: string, terms: string[]): number {
  const h = haystack.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    if (h === t) score += 12;
    else if (h.includes(t)) score += 6;
  }
  return score;
}

serve(async (req: Request): Promise<Response> => {
  const reqId = getRequestId(req);

  if (req.method === "OPTIONS") {
    return handleOptions(req, reqId);
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const code =
      message === "Missing organization_id" ? "missing_organization_id" :
      message.toLowerCase().includes("unauthorized") ? "unauthorized" :
      "unauthorized";
    return json(req, reqId, { ok: false, error: { code, message }, httpStatus: 401, requestId: reqId });
  }

  let params: SearchRequest = {};
  try {
    if (req.method === "POST") {
      params = (await req.json()) as SearchRequest;
    } else {
      const url = new URL(req.url);
      const limitRaw = url.searchParams.get("limit");
      params = {
        query: url.searchParams.get("query") ?? undefined,
        kd_code: url.searchParams.get("kd_code") ?? undefined,
        material_type: url.searchParams.get("material_type") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        mbo_level: url.searchParams.get("mbo_level") ?? undefined,
        source: url.searchParams.get("source") ?? undefined,
        language_variant: url.searchParams.get("language_variant") ?? undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
      };
    }
  } catch {
    return json(req, reqId, { ok: false, error: { code: "invalid_request", message: "Invalid request body" }, httpStatus: 400, requestId: reqId });
  }

  const organizationId = requireOrganizationId(auth);
  const query = normalizeString(params.query);
  const kdCode = normalizeString(params.kd_code);
  const materialType = normalizeString(params.material_type);
  const categoryFilter = normalizeString(params.category);
  const mboLevelFilter = normalizeString(params.mbo_level);
  const sourceFilter = normalizeString(params.source);
  const languageVariant = normalizeString(params.language_variant);
  const limit = Math.min(50, Math.max(1, Number.isFinite(Number(params.limit)) ? Math.floor(Number(params.limit)) : 10));

  // Curated materials live as entity_records rows with entity="curated-material".
  // This search is read-only and returns only persisted curated packs (no live generation).
  const { data, error: dbError } = await supabase
    .from("entity_records")
    .select("id, title, data, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("entity", "curated-material")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (dbError) {
    console.error(`[search-curated-materials] db_error (${reqId}):`, dbError);
    return json(req, reqId, { ok: false, error: { code: "db_error", message: dbError.message }, httpStatus: 500, requestId: reqId });
  }

  const terms = query
    ? query
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const results = (Array.isArray(data) ? data : [])
    .map((row) => {
      const d = (row as any).data ?? {};
      const title = typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : (typeof d?.title === "string" ? d.title.trim() : "");
      const kdCodes = Array.isArray(d?.kd_codes)
        ? d.kd_codes.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];
      const mt = typeof d?.material_type === "string" ? d.material_type.trim() : "";
      const courseName = typeof d?.course_name === "string" ? d.course_name.trim() : "";
      const category = typeof d?.category === "string" ? d.category.trim() : "";
      const mboLevel = typeof d?.mbo_level === "string" ? d.mbo_level.trim() : "";
      const sourceType = typeof d?.source === "string"
        ? d.source.trim()
        : (d?.source && typeof d.source === "object" && typeof d.source.type === "string")
          ? d.source.type.trim()
          : "";
      const variants = (d?.variants && typeof d.variants === "object") ? (d.variants as Record<string, any>) : {};
      const pickVariant = (lv: string) => {
        const v = variants?.[lv];
        return (v && typeof v === "object") ? v : null;
      };
      const pickedLang = languageVariant
        ? languageVariant
        : (pickVariant("b2") ? "b2" : (pickVariant("b1") ? "b1" : (pickVariant("a2") ? "a2" : (pickVariant("ar") ? "ar" : ""))));
      const variant = pickedLang ? pickVariant(pickedLang) : null;

      const preview =
        typeof variant?.preview === "string"
          ? variant.preview
          : typeof d?.preview === "string"
            ? d.preview
            : "";

      const keywordGlobal = Array.isArray(d?.keywords) ? d.keywords.map((k: unknown) => String(k || "").trim()).filter(Boolean) : [];
      const keywordVariant = Array.isArray(variant?.keywords) ? variant.keywords.map((k: unknown) => String(k || "").trim()).filter(Boolean) : [];
      const nlKeywords = Array.isArray(variant?.nl_keywords) ? variant.nl_keywords.map((k: unknown) => String(k || "").trim()).filter(Boolean) : [];
      const keywords = keywordGlobal.concat(keywordVariant, nlKeywords);

      const storageBucket = typeof variant?.storage_bucket === "string" ? variant.storage_bucket.trim() : "";
      const storagePath = typeof variant?.storage_path === "string" ? variant.storage_path.trim() : "";

      let score = 0;
      if (terms.length) {
        score += scoreText(title, terms) * 2;
        score += scoreText(preview, terms);
        score += scoreText(keywords.join(" "), terms);
      }
      if (kdCode && kdCodes.some((c) => c.toLowerCase() === kdCode.toLowerCase())) score += 5;
      if (materialType && mt.toLowerCase() === materialType.toLowerCase()) score += 2;
      if (pickedLang && languageVariant && pickedLang.toLowerCase() === languageVariant.toLowerCase()) score += 2;

      return {
        id: row.id,
        title,
        material_type: mt || undefined,
        course_name: courseName || undefined,
        category: category || undefined,
        mbo_level: mboLevel || undefined,
        source: sourceType || undefined,
        language_variant: pickedLang || undefined,
        kd_codes: kdCodes,
        preview: preview || undefined,
        storage_bucket: storageBucket || undefined,
        storage_path: storagePath || undefined,
        score,
      };
    })
    .filter((r) => {
      if (!r.title) return false;
      if (kdCode && !(r.kd_codes || []).some((c) => c.toLowerCase() === kdCode.toLowerCase())) return false;
      if (materialType && (r.material_type || "").toLowerCase() !== materialType.toLowerCase()) return false;
      if (categoryFilter && !(r.category || "").toLowerCase().includes(categoryFilter.toLowerCase())) return false;
      if (mboLevelFilter && (r.mbo_level || "").toLowerCase() !== mboLevelFilter.toLowerCase()) return false;
      if (sourceFilter && (r.source || "").toLowerCase() !== sourceFilter.toLowerCase()) return false;
      // If a language variant was requested, only include records that have that variant.
      if (languageVariant && (r.language_variant || "").toLowerCase() !== languageVariant.toLowerCase()) return false;
      if (languageVariant && (!r.storage_bucket || !r.storage_path)) return false;
      if (terms.length && r.score <= 0) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return json(req, reqId, {
    ok: true,
    query,
    filters: {
      ...(kdCode ? { kd_code: kdCode } : {}),
      ...(materialType ? { material_type: materialType } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(mboLevelFilter ? { mbo_level: mboLevelFilter } : {}),
      ...(sourceFilter ? { source: sourceFilter } : {}),
      ...(languageVariant ? { language_variant: languageVariant } : {}),
      limit,
    },
    results,
    requestId: reqId,
  });
});

