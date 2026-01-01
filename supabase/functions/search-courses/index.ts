import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const QuerySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

function unwrapCoursePayload(payload: any): { course: any; format: string } {
  if (payload && typeof payload === "object" && "content" in payload && "format" in payload) {
    return { course: (payload as any).content, format: String((payload as any).format ?? "practice") };
  }
  return { course: payload, format: "practice" };
}

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Validate BEFORE auth (search is allowed without auth; visibility enforced server-side)
    const url = new URL(req.url);
    const formatParamRaw = (url.searchParams.get("format") ?? "").trim();
    const formatFilter =
      formatParamRaw && formatParamRaw.toLowerCase() !== "all"
        ? formatParamRaw
        : null;
    if (formatFilter && !/^[a-zA-Z0-9_-]{1,40}$/.test(formatFilter)) {
      return Errors.invalidRequest(
        `Invalid format filter '${formatFilter}'. Expected alphanumeric/dash/underscore.`,
        requestId,
        req,
      );
    }

    const parsed = QuerySchema.safeParse({
      query: url.searchParams.get("query") ?? "",
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return Errors.invalidRequest("Invalid query/limit", requestId, req);

    const { query, limit } = parsed.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Best-effort visibility filtering:
    // - If a user is authenticated, include org + global
    // - Else global only
    let userOrgId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        userOrgId =
          (user?.app_metadata as any)?.organization_id ??
          (user?.user_metadata as any)?.organization_id ??
          null;
      } catch {
        userOrgId = null;
      }
    }

    let metaQuery = supabase
      .from("course_metadata")
      .select("*", { count: "exact" })
      .is("deleted_at", null);

    if (userOrgId) {
      metaQuery = metaQuery.or(`organization_id.eq.${userOrgId},visibility.eq.global`);
    } else {
      metaQuery = metaQuery.or("visibility.eq.global");
    }

    if (formatFilter) {
      // Filter by metadata tag `__format` (set by save-course metadata upserts).
      metaQuery = metaQuery.contains("tags", { __format: formatFilter } as any);
    }

    // Try a lightweight DB search first (if title/subject exists); always fall back to id search.
    // Note: Some schemas may not have title/subject columns; PostgREST will error if referenced.
    const filters = [
      `id.ilike.%${query}%`,
      `title.ilike.%${query}%`,
      `subject.ilike.%${query}%`,
    ];
    metaQuery = metaQuery.or(filters.join(","));

    const { data: metadata, error: metaErr, count } = await metaQuery
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (metaErr) {
      // If title/subject columns don't exist, retry with id-only filter (still loud in logs)
      console.warn("[search-courses] Metadata search failed; retrying id-only", { message: metaErr.message, requestId });
      let retryQuery = supabase
        .from("course_metadata")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .or(userOrgId ? `organization_id.eq.${userOrgId},visibility.eq.global` : "visibility.eq.global")
        .ilike("id", `%${query}%`);

      if (formatFilter) {
        retryQuery = retryQuery.contains("tags", { __format: formatFilter } as any);
      }

      const { data: retry, error: retryErr, count: retryCount } = await retryQuery
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (retryErr) return Errors.internal(retryErr.message, requestId, req);

      const courses = await Promise.all(
        (retry ?? []).map(async (m: any) => {
          const path = `${m.id}/course.json`;
          const { data: file } = await supabase.storage.from("courses").download(path);
          if (!file) return { id: m.id, title: m.id, description: "", tags: [] as string[] };
          const text = await file.text();
          const parsedJson = text ? JSON.parse(text) : {};
          const { course } = unwrapCoursePayload(parsedJson);
          return { id: m.id, title: course?.title ?? m.id, description: course?.description ?? "", tags: [] as string[] };
        }),
      );

      return { courses, total: retryCount ?? 0 };
    }

    const courses = await Promise.all(
      (metadata ?? []).map(async (m: any) => {
        try {
          const path = `${m.id}/course.json`;
          const { data: file } = await supabase.storage.from("courses").download(path);
          if (!file) return { id: m.id, title: m.title ?? m.id, description: "", tags: [] as string[] };
          const text = await file.text();
          const parsedJson = text ? JSON.parse(text) : {};
          const { course } = unwrapCoursePayload(parsedJson);
          return { id: m.id, title: m.title ?? course?.title ?? m.id, description: course?.description ?? "", tags: [] as string[] };
        } catch (e) {
          console.warn("[search-courses] Failed to load course.json", { courseId: m.id, requestId, message: e instanceof Error ? e.message : String(e) });
          return { id: m.id, title: m.title ?? m.id, description: "", tags: [] as string[] };
        }
      }),
    );

    return { courses, total: count ?? 0 };
  }),
);


