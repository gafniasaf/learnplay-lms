/**
 * book-version-save-skeleton (HYBRID AUTH)
 *
 * Validates a skeleton, uploads it to Storage, updates book_versions.skeleton_path,
 * and creates an immutable snapshot in book_skeleton_versions.
 *
 * Body:
 * - bookId: string
 * - bookVersionId: string
 * - skeleton: object (skeleton JSON matching skeleton_v1 schema)
 * - note?: string (optional commit message for the version)
 * - compileCanonical?: boolean (if true, also compile + upload compiled canonical)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import type { AuthContext } from "../_shared/auth.ts";
import { compileSkeletonToCanonical, validateBookSkeleton } from "../_shared/bookSkeletonCore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      }),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method not allowed" }, httpStatus: 405, requestId }, 200);
  }

  try {
    let auth: AuthContext;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, httpStatus: 401, requestId }, 200);
    }

    let orgId: string;
    try {
      orgId = requireOrganizationId(auth);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Missing organization_id";
      return json({ ok: false, error: { code: "missing_org", message }, httpStatus: 401, requestId }, 200);
    }

    let bodyRaw: unknown;
    try {
      bodyRaw = await req.json();
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!isPlainObject(bodyRaw)) {
      return json({ ok: false, error: { code: "invalid_request", message: "Body must be a JSON object" }, httpStatus: 400, requestId }, 200);
    }

    const bookId = safeString(bodyRaw.bookId).trim();
    const bookVersionId = safeString(bodyRaw.bookVersionId).trim();
    const skeletonRaw = bodyRaw.skeleton;
    const noteRaw = bodyRaw.note;
    const compileCanonical = bodyRaw.compileCanonical === true;

    if (!bookId) {
      return json({ ok: false, error: { code: "invalid_input", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!bookVersionId) {
      return json({ ok: false, error: { code: "invalid_input", message: "bookVersionId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!isPlainObject(skeletonRaw)) {
      return json({ ok: false, error: { code: "invalid_input", message: "skeleton object is required" }, httpStatus: 400, requestId }, 200);
    }

    // Verify book belongs to org
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id")
      .eq("id", bookId)
      .eq("organization_id", orgId)
      .single();

    if (bookErr || !book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
    }

    // Verify version exists
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("book_version_id")
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId)
      .single();

    if (versionErr || !version) {
      return json({ ok: false, error: { code: "not_found", message: "Book version not found" }, httpStatus: 404, requestId }, 200);
    }

    // Validate skeleton shape
    const validation = validateBookSkeleton(skeletonRaw);
    if (!validation.ok) {
      return json({
        ok: false,
        error: {
          code: "skeleton_validation_failed",
          message: `Skeleton validation failed with ${validation.issues.length} issue(s)`,
          issues: validation.issues,
        },
        httpStatus: 400,
        requestId,
      }, 200);
    }

    // Ensure meta matches route-level identifiers (prevents cross-book mixing)
    const sk = validation.skeleton;
    if (sk.meta.bookId !== bookId) {
      return json({
        ok: false,
        error: { code: "meta_mismatch", message: `skeleton.meta.bookId (${sk.meta.bookId}) must match bookId (${bookId})` },
        httpStatus: 400,
        requestId,
      }, 200);
    }
    if (sk.meta.bookVersionId !== bookVersionId) {
      return json({
        ok: false,
        error: { code: "meta_mismatch", message: `skeleton.meta.bookVersionId (${sk.meta.bookVersionId}) must match bookVersionId (${bookVersionId})` },
        httpStatus: 400,
        requestId,
      }, 200);
    }

    const note = typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, 500) : null;

    // Prepare JSON payloads (stable formatting)
    const skeletonText = JSON.stringify(sk, null, 2);
    const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
    const snapshotPath = `books/${bookId}/${bookVersionId}/skeleton-versions/${crypto.randomUUID()}.json`;

    let compiledCanonicalPath: string | null = null;
    let compiledText: string | null = null;
    if (compileCanonical) {
      const compiled = compileSkeletonToCanonical(sk);
      compiledText = JSON.stringify(compiled, null, 2);
      compiledCanonicalPath = `books/${bookId}/${bookVersionId}/compiled_canonical.json`;
    }

    // 1) Upload immutable snapshot (append-only history)
    const { error: snapshotUploadErr } = await adminSupabase.storage
      .from("books")
      .upload(snapshotPath, new Blob([skeletonText], { type: "application/json" }), {
        upsert: false,
        contentType: "application/json",
      });

    if (snapshotUploadErr) {
      console.error(`[book-version-save-skeleton] Snapshot upload failed (${requestId}):`, snapshotUploadErr);
      return json({ ok: false, error: { code: "snapshot_upload_failed", message: snapshotUploadErr.message }, httpStatus: 500, requestId }, 200);
    }

    // 2) Upload skeleton (mutable "latest" pointer)
    const { error: skUploadErr } = await adminSupabase.storage
      .from("books")
      .upload(skeletonPath, new Blob([skeletonText], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });

    if (skUploadErr) {
      console.error(`[book-version-save-skeleton] Skeleton upload failed (${requestId}):`, skUploadErr);
      return json({ ok: false, error: { code: "upload_failed", message: skUploadErr.message }, httpStatus: 500, requestId }, 200);
    }

    // 3) Optional: upload compiled canonical (deterministic)
    if (compileCanonical && compiledCanonicalPath && compiledText) {
      const { error: compileUploadErr } = await adminSupabase.storage
        .from("books")
        .upload(compiledCanonicalPath, new Blob([compiledText], { type: "application/json" }), {
          upsert: true,
          contentType: "application/json",
        });

      if (compileUploadErr) {
        console.error(`[book-version-save-skeleton] Compiled canonical upload failed (${requestId}):`, compileUploadErr);
        return json(
          { ok: false, error: { code: "compiled_upload_failed", message: compileUploadErr.message }, httpStatus: 500, requestId },
          200,
        );
      }
    }

    // 4) Insert immutable history row (fail loudly)
    const { error: versionInsertErr } = await adminSupabase
      .from("book_skeleton_versions")
      .insert({
        book_id: bookId,
        book_version_id: bookVersionId,
        snapshot_path: snapshotPath,
        created_by: auth.userId ?? null,
        note,
      });

    if (versionInsertErr) {
      console.error(`[book-version-save-skeleton] History insert failed (${requestId}):`, versionInsertErr);
      return json({ ok: false, error: { code: "history_insert_failed", message: versionInsertErr.message }, httpStatus: 500, requestId }, 200);
    }

    // 5) Update book_versions pointers + metadata (fail loudly)
    const update: Record<string, unknown> = {
      skeleton_path: skeletonPath,
      authoring_mode: "skeleton",
      skeleton_schema_version: sk.meta.schemaVersion,
    };
    if (compiledCanonicalPath) update.compiled_canonical_path = compiledCanonicalPath;

    // Persist prompt pack metadata when present in skeleton meta.
    if (typeof sk.meta.promptPackId === "string" && sk.meta.promptPackId.trim()) {
      update.prompt_pack_id = sk.meta.promptPackId.trim();
    }
    if (typeof sk.meta.promptPackVersion === "number" && Number.isFinite(sk.meta.promptPackVersion)) {
      update.prompt_pack_version = Math.floor(sk.meta.promptPackVersion);
    }

    const { error: updateErr } = await adminSupabase
      .from("book_versions")
      .update(update)
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId);

    if (updateErr) {
      console.error(`[book-version-save-skeleton] Version update failed (${requestId}):`, updateErr);
      return json({ ok: false, error: { code: "update_failed", message: updateErr.message }, httpStatus: 500, requestId }, 200);
    }

    return json(
      {
        ok: true,
        bookId,
        bookVersionId,
        skeletonPath,
        snapshotPath,
        compiledCanonicalPath,
        requestId,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-version-save-skeleton] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


