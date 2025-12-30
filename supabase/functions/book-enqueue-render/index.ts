/**
 * book-enqueue-render: Enqueue a book render job.
 * 
 * Expects: POST with body:
 * {
 *   bookId: string,
 *   bookVersionId: string,
 *   overlayId?: string (UUID of book_overlays row to apply),
 *   target: "chapter" | "book",
 *   chapterIndex?: number (required if target is "chapter")
 * }
 * 
 * Creates a book_runs row + a book_render_jobs row with status "pending".
 * The Docker worker polls book_render_jobs and processes them.
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

interface EnqueueBody {
  bookId: string;
  bookVersionId: string;
  overlayId?: string;
  target: "chapter" | "book";
  chapterIndex?: number;
  renderProvider?: "prince_local" | "docraptor_api";
  /**
   * If true, the worker will replace missing images with visible placeholders
   * and still produce a draft PDF + a missing-assets report.
   */
  allowMissingImages?: boolean;
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

    let body: EnqueueBody;
    try {
      body = await req.json() as EnqueueBody;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!body?.bookId || typeof body.bookId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!body?.bookVersionId || typeof body.bookVersionId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "bookVersionId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!body?.target || !["chapter", "book"].includes(body.target)) {
      return json({ ok: false, error: { code: "invalid_request", message: "target is required (chapter or book)" }, httpStatus: 400, requestId }, 200);
    }
    if (body.target === "chapter" && (body.chapterIndex === undefined || typeof body.chapterIndex !== "number")) {
      return json({ ok: false, error: { code: "invalid_request", message: "chapterIndex is required for chapter target" }, httpStatus: 400, requestId }, 200);
    }
    if (body.renderProvider && !["prince_local", "docraptor_api"].includes(body.renderProvider)) {
      return json({ ok: false, error: { code: "invalid_request", message: "renderProvider must be prince_local or docraptor_api" }, httpStatus: 400, requestId }, 200);
    }
    if (body.allowMissingImages !== undefined && typeof body.allowMissingImages !== "boolean") {
      return json({ ok: false, error: { code: "invalid_request", message: "allowMissingImages must be a boolean" }, httpStatus: 400, requestId }, 200);
    }

    // Verify book exists and belongs to org
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id, organization_id")
      .eq("id", body.bookId)
      .single();

    if (bookErr || !book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
    }

    if (book.organization_id !== orgId) {
      return json({ ok: false, error: { code: "forbidden", message: "Book belongs to a different organization" }, httpStatus: 403, requestId }, 200);
    }

    // Verify version exists
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("id, book_version_id")
      .eq("book_id", body.bookId)
      .eq("book_version_id", body.bookVersionId)
      .single();

    if (versionErr || !version) {
      return json({ ok: false, error: { code: "not_found", message: "Book version not found" }, httpStatus: 404, requestId }, 200);
    }

    // Verify overlay exists if provided
    if (body.overlayId) {
      const { data: overlay, error: overlayErr } = await adminSupabase
        .from("book_overlays")
        .select("id")
        .eq("id", body.overlayId)
        .eq("book_id", body.bookId)
        .eq("book_version_id", body.bookVersionId)
        .single();

      if (overlayErr || !overlay) {
        return json({ ok: false, error: { code: "not_found", message: "Overlay not found or does not match book/version" }, httpStatus: 404, requestId }, 200);
      }
    }

    // Create run (control plane record)
    const runInsert: Record<string, unknown> = {
      organization_id: orgId,
      book_id: body.bookId,
      book_version_id: body.bookVersionId,
      overlay_id: body.overlayId ?? null,
      target: body.target,
      status: "queued",
      // In agent-token mode, do NOT write created_by to avoid FK issues (worker/user id may be synthetic).
      created_by: auth.type === "agent" ? null : (auth.userId ?? null),
    };
    if (body.renderProvider) runInsert.render_provider = body.renderProvider;

    const { data: run, error: runErr } = await adminSupabase
      .from("book_runs")
      .insert(runInsert)
      .select("id")
      .single();

    if (runErr || !run?.id) {
      console.error("[book-enqueue-render] Failed to create run:", runErr);
      return json({ ok: false, error: { code: "db_error", message: runErr?.message || "Failed to create run" }, httpStatus: 500, requestId }, 200);
    }

    // For chapter target, create the chapter row (book target can be expanded later by the worker)
    if (body.target === "chapter") {
      const { error: chErr } = await adminSupabase
        .from("book_run_chapters")
        .insert({
          run_id: run.id,
          chapter_index: body.chapterIndex,
          status: "queued",
        });
      if (chErr) {
        console.error("[book-enqueue-render] Failed to create book_run_chapters row:", chErr);
        return json({ ok: false, error: { code: "db_error", message: chErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    // Create render job (queue entry)
    const jobInsert: Record<string, unknown> = {
      organization_id: orgId,
      run_id: run.id,
      book_id: body.bookId,
      book_version_id: body.bookVersionId,
      overlay_id: body.overlayId ?? null,
      target: body.target,
      chapter_index: body.target === "chapter" ? body.chapterIndex : null,
      status: "pending",
      payload: {
        ...(body.allowMissingImages === true ? { allowMissingImages: true } : {}),
      },
    };
    if (body.renderProvider) jobInsert.render_provider = body.renderProvider;

    const { data: job, error: jobErr } = await adminSupabase
      .from("book_render_jobs")
      .insert(jobInsert)
      .select("id")
      .single();

    if (jobErr || !job?.id) {
      console.error("[book-enqueue-render] Failed to insert job:", jobErr);
      return json({ ok: false, error: { code: "db_error", message: jobErr?.message || "Failed to enqueue job" }, httpStatus: 500, requestId }, 200);
    }

    console.log(`[book-enqueue-render] Run ${run.id} / job ${job.id} queued for ${body.target} (${requestId})`);

    return json({
      ok: true,
      runId: run.id,
      jobId: job.id,
      bookId: body.bookId,
      bookVersionId: body.bookVersionId,
      target: body.target,
      chapterIndex: body.target === "chapter" ? body.chapterIndex : null,
      status: "queued",
      message: "Render run queued for processing",
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-enqueue-render] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});

