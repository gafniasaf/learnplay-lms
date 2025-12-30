/**
 * book-create-overlay (HYBRID AUTH)
 *
 * Creates a new overlay for a given book version:
 * - Inserts a row in public.book_overlays
 * - Uploads an initial rewrites.json to the private `books` bucket
 *
 * Request (POST):
 * { bookId: string, bookVersionId: string, label?: string }
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
  label?: string;
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

    if (!body?.bookId || typeof body.bookId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!body?.bookVersionId || typeof body.bookVersionId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "bookVersionId is required" }, httpStatus: 400, requestId }, 200);
    }

    // Verify book belongs to org
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id")
      .eq("id", body.bookId)
      .eq("organization_id", orgId)
      .single();

    if (bookErr || !book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
    }

    // Verify version exists
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("id")
      .eq("book_id", body.bookId)
      .eq("book_version_id", body.bookVersionId)
      .single();

    if (versionErr || !version) {
      return json({ ok: false, error: { code: "not_found", message: "Book version not found" }, httpStatus: 404, requestId }, 200);
    }

    const overlayId = crypto.randomUUID();
    const overlayPath = `${body.bookId}/${body.bookVersionId}/overlays/${overlayId}.json`;

    const { error: insErr } = await adminSupabase
      .from("book_overlays")
      .insert({
        id: overlayId,
        book_id: body.bookId,
        book_version_id: body.bookVersionId,
        overlay_path: overlayPath,
        label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
        created_by: auth.type === "agent" ? null : (auth.userId ?? null),
      });

    if (insErr) {
      console.error("[book-create-overlay] Failed to insert overlay row:", insErr);
      return json({ ok: false, error: { code: "db_error", message: insErr.message }, httpStatus: 500, requestId }, 200);
    }

    const initial = { paragraphs: [] };
    const blob = new Blob([JSON.stringify(initial, null, 2)], { type: "application/json" });
    const { error: upErr } = await adminSupabase.storage
      .from("books")
      .upload(overlayPath, blob, { upsert: true, contentType: "application/json" });

    if (upErr) {
      // Roll back row to avoid dangling overlays.
      await adminSupabase.from("book_overlays").delete().eq("id", overlayId);
      console.error("[book-create-overlay] Failed to upload overlay JSON:", upErr);
      return json({ ok: false, error: { code: "storage_error", message: upErr.message }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      overlayId,
      bookId: body.bookId,
      bookVersionId: body.bookVersionId,
      overlayPath,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-create-overlay] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


