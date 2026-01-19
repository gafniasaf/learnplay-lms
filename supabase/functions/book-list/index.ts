/**
 * book-list: List books, versions, runs, jobs, and artifacts for the authenticated organization.
 * 
 * Expects: GET with optional query params:
 * - scope: "books" | "versions" | "overlays" | "runs" | "run-chapters" | "jobs" | "artifacts" | "links" (default: "books")
 * - bookId: string (required for versions, overlays, runs, links)
 * - bookVersionId: string (required for overlays; optional for runs, links)
 * - runId: string (required for run-chapters, jobs, artifacts)
 * - limit: number (default: 50)
 * - offset: number (default: 0)
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

  if (req.method !== "GET") {
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

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "books";
    const bookId = url.searchParams.get("bookId");
    const bookVersionId = url.searchParams.get("bookVersionId");
    const runId = url.searchParams.get("runId");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const includeTest = url.searchParams.get("includeTest") === "1" || url.searchParams.get("includeE2E") === "1";

    if (scope === "books") {
      let q = adminSupabase
        .from("books")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId);

      // Hide test artifacts from admin menus (E2E / integration runs should not pollute real UX).
      // Allow explicit override for tests via ?includeTest=1.
      if (!includeTest) {
        q = q.not("id", "ilike", "e2e-%").not("id", "ilike", "it-%");
      }

      const { data, error, count } = await q
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, books: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    if (scope === "versions") {
      if (!bookId) {
        return json({ ok: false, error: { code: "invalid_request", message: "bookId is required for versions scope" }, httpStatus: 400, requestId }, 200);
      }

      // Verify book belongs to org
      const { data: book } = await adminSupabase
        .from("books")
        .select("id")
        .eq("id", bookId)
        .eq("organization_id", orgId)
        .single();

      if (!book) {
        return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
      }

      const { data, error, count } = await adminSupabase
        .from("book_versions")
        .select("*", { count: "exact" })
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, bookId, versions: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    if (scope === "overlays") {
      if (!bookId || !bookVersionId) {
        return json({ ok: false, error: { code: "invalid_request", message: "bookId and bookVersionId are required for overlays scope" }, httpStatus: 400, requestId }, 200);
      }

      // Verify book belongs to org
      const { data: book } = await adminSupabase
        .from("books")
        .select("id")
        .eq("id", bookId)
        .eq("organization_id", orgId)
        .single();

      if (!book) {
        return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
      }

      const { data, error, count } = await adminSupabase
        .from("book_overlays")
        .select("*", { count: "exact" })
        .eq("book_id", bookId)
        .eq("book_version_id", bookVersionId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, bookId, bookVersionId, overlays: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    if (scope === "runs") {
      if (!bookId) {
        return json({ ok: false, error: { code: "invalid_request", message: "bookId is required for runs scope" }, httpStatus: 400, requestId }, 200);
      }

      // Verify book belongs to org
      const { data: book } = await adminSupabase
        .from("books")
        .select("id")
        .eq("id", bookId)
        .eq("organization_id", orgId)
        .single();

      if (!book) {
        return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
      }

      let query = adminSupabase
        .from("book_runs")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId)
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (bookVersionId) {
        query = query.eq("book_version_id", bookVersionId);
      }

      const { data, error, count } = await query;

      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, bookId, bookVersionId, runs: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    if (scope === "run-chapters") {
      if (!runId) {
        return json({ ok: false, error: { code: "invalid_request", message: "runId is required for run-chapters scope" }, httpStatus: 400, requestId }, 200);
      }

      // Verify run belongs to org (and optionally matches bookId)
      const { data: run, error: runErr } = await adminSupabase
        .from("book_runs")
        .select("id, book_id")
        .eq("id", runId)
        .eq("organization_id", orgId)
        .single();

      if (runErr || !run) {
        return json({ ok: false, error: { code: "not_found", message: "Run not found" }, httpStatus: 404, requestId }, 200);
      }
      if (bookId && run.book_id !== bookId) {
        return json({ ok: false, error: { code: "invalid_request", message: "runId does not match bookId" }, httpStatus: 400, requestId }, 200);
      }

      const { data, error, count } = await adminSupabase
        .from("book_run_chapters")
        .select("*", { count: "exact" })
        .eq("run_id", runId)
        .order("chapter_index", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, runId, bookId: run.book_id, chapters: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    if (scope === "jobs") {
      if (!runId) {
        return json({ ok: false, error: { code: "invalid_request", message: "runId is required for jobs scope" }, httpStatus: 400, requestId }, 200);
      }

      // Verify run belongs to org (and optionally matches bookId)
      const { data: run, error: runErr } = await adminSupabase
        .from("book_runs")
        .select("id, book_id")
        .eq("id", runId)
        .eq("organization_id", orgId)
        .single();

      if (runErr || !run) {
        return json({ ok: false, error: { code: "not_found", message: "Run not found" }, httpStatus: 404, requestId }, 200);
      }
      if (bookId && run.book_id !== bookId) {
        return json({ ok: false, error: { code: "invalid_request", message: "runId does not match bookId" }, httpStatus: 400, requestId }, 200);
      }

      const { data, error, count } = await adminSupabase
        .from("book_render_jobs")
        .select("*", { count: "exact" })
        .eq("run_id", runId)
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, runId, bookId: run.book_id, jobs: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    if (scope === "artifacts") {
      if (!runId) {
        return json({ ok: false, error: { code: "invalid_request", message: "runId is required for artifacts scope" }, httpStatus: 400, requestId }, 200);
      }

      // Verify run belongs to org (and optionally matches bookId)
      const { data: run, error: runErr } = await adminSupabase
        .from("book_runs")
        .select("id, book_id")
        .eq("id", runId)
        .eq("organization_id", orgId)
        .single();

      if (runErr || !run) {
        return json({ ok: false, error: { code: "not_found", message: "Run not found" }, httpStatus: 404, requestId }, 200);
      }
      if (bookId && run.book_id !== bookId) {
        return json({ ok: false, error: { code: "invalid_request", message: "runId does not match bookId" }, httpStatus: 400, requestId }, 200);
      }

      const { data, error, count } = await adminSupabase
        .from("book_artifacts")
        .select("*", { count: "exact" })
        .eq("run_id", runId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, runId, bookId: run.book_id, artifacts: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    if (scope === "links") {
      if (!bookId) {
        return json({ ok: false, error: { code: "invalid_request", message: "bookId is required for links scope" }, httpStatus: 400, requestId }, 200);
      }

      // Verify book belongs to org
      const { data: book } = await adminSupabase
        .from("books")
        .select("id")
        .eq("id", bookId)
        .eq("organization_id", orgId)
        .single();

      if (!book) {
        return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
      }

      let q = adminSupabase
        .from("book_elearning_links")
        .select("*", { count: "exact" })
        .eq("organization_id", orgId)
        .eq("book_id", bookId)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (bookVersionId) {
        q = q.eq("book_version_id", bookVersionId);
      }

      const { data, error, count } = await q;
      if (error) {
        return json({ ok: false, error: { code: "db_error", message: error.message }, httpStatus: 500, requestId }, 200);
      }

      return json({ ok: true, scope, bookId, bookVersionId: bookVersionId || null, links: data || [], total: count || 0, limit, offset, requestId }, 200);
    }

    return json({ ok: false, error: { code: "invalid_request", message: `Unknown scope: ${scope}` }, httpStatus: 400, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-list] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});

