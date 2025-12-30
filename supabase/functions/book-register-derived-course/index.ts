/**
 * book-register-derived-course (HYBRID AUTH)
 *
 * Registers a derived Course (typically generated via ai_course_generate) as originating from
 * a specific BookVersion/Overlay + paragraph_id set. This enables staleness invalidation when overlays change.
 *
 * Request (POST):
 * {
 *   bookId: string,
 *   bookVersionId: string,
 *   overlayId?: string,
 *   courseId: string,        // derived course id (payload.course_id)
 *   jobId: string,           // ai_course_jobs.id
 *   paragraphIds: string[]   // selected paragraph ids
 * }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Body {
  bookId: string;
  bookVersionId: string;
  overlayId?: string;
  courseId: string;
  jobId: string;
  paragraphIds: string[];
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method not allowed" }, httpStatus: 405, requestId }, 200);
  }

  try {
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, httpStatus: 401, requestId }, 200);
    }

    const orgId = requireOrganizationId(auth);

    let body: Body;
    try {
      body = await req.json() as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
    const bookVersionId = typeof body.bookVersionId === "string" ? body.bookVersionId.trim() : "";
    const overlayId = typeof body.overlayId === "string" ? body.overlayId.trim() : null;
    const courseId = typeof body.courseId === "string" ? body.courseId.trim() : "";
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    const paragraphIds = Array.isArray(body.paragraphIds) ? body.paragraphIds.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];

    if (!bookId || !bookVersionId || !courseId || !jobId) {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId, bookVersionId, courseId, and jobId are required" }, httpStatus: 400, requestId }, 200);
    }
    if (paragraphIds.length === 0) {
      return json({ ok: false, error: { code: "invalid_request", message: "paragraphIds must be a non-empty array" }, httpStatus: 400, requestId }, 200);
    }

    // Verify job exists and belongs to org, and targets this course id.
    const { data: job, error: jobErr } = await adminSupabase
      .from("ai_course_jobs")
      .select("id, organization_id, course_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr) {
      return json({ ok: false, error: { code: "db_error", message: jobErr.message }, httpStatus: 500, requestId }, 200);
    }
    if (!job) {
      return json({ ok: false, error: { code: "not_found", message: "Job not found" }, httpStatus: 404, requestId }, 200);
    }
    if (String((job as any).organization_id) !== String(orgId)) {
      return json({ ok: false, error: { code: "forbidden", message: "Job belongs to a different organization" }, httpStatus: 403, requestId }, 200);
    }
    if (String((job as any).course_id || "") !== courseId) {
      return json({ ok: false, error: { code: "invalid_request", message: "jobId does not match courseId" }, httpStatus: 400, requestId }, 200);
    }

    // Optional overlay updated_at snapshot
    let overlayUpdatedAt: string | null = null;
    if (overlayId) {
      const { data: ov, error: ovErr } = await adminSupabase
        .from("book_overlays")
        .select("id, updated_at")
        .eq("id", overlayId)
        .eq("book_id", bookId)
        .eq("book_version_id", bookVersionId)
        .maybeSingle();
      if (ovErr) {
        return json({ ok: false, error: { code: "db_error", message: ovErr.message }, httpStatus: 500, requestId }, 200);
      }
      if (!ov) {
        return json({ ok: false, error: { code: "not_found", message: "Overlay not found" }, httpStatus: 404, requestId }, 200);
      }
      overlayUpdatedAt = ov.updated_at ? String(ov.updated_at) : null;
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await adminSupabase
      .from("book_elearning_links")
      .upsert(
        {
          organization_id: orgId,
          book_id: bookId,
          book_version_id: bookVersionId,
          overlay_id: overlayId,
          kind: "derived_course",
          course_id: courseId,
          study_text_id: "__derived__",
          derived_job_id: jobId,
          source_paragraph_ids: paragraphIds,
          overlay_updated_at_at_link: overlayUpdatedAt,
          stale: false,
          stale_reason: null,
          last_synced_at: nowIso,
        },
        { onConflict: "course_id,kind,study_text_id" },
      );

    if (upErr) {
      return json({ ok: false, error: { code: "db_error", message: upErr.message }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      bookId,
      bookVersionId,
      overlayId,
      courseId,
      jobId,
      paragraphCount: paragraphIds.length,
      overlayUpdatedAt,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-register-derived-course] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


