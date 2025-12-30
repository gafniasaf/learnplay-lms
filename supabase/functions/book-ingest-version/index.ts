/**
 * book-ingest-version: Ingest canonical JSON and create a book version.
 * 
 * Expects: POST with body:
 * {
 *   bookId: string (e.g., "anatomy-n3"),
 *   title?: string,
 *   level: "n3" | "n4",
 *   source?: string (e.g., "IDML_EXPORT"),
 *   canonical: object | string (the CanonicalBook JSON),
 *   figures?: object | string (the figures mapping),
 *   designTokens?: object | string (design tokens),
 *   schemaVersion?: string (default: "1.0")
 * }
 * 
 * The canonical JSON is hashed to produce a deterministic book_version_id.
 * Files are uploaded to Storage at: books/{bookId}/{book_version_id}/canonical.json, figures.json, design_tokens.json
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

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface IngestBody {
  bookId: string;
  title?: string;
  level: "n3" | "n4";
  source?: string;
  canonical: object | string;
  figures?: object | string;
  designTokens?: object | string;
  schemaVersion?: string;
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(String(s || ""));
}
function isDataUrl(s: string): boolean {
  return /^data:/i.test(String(s || ""));
}
function isFileUrl(s: string): boolean {
  return /^file:\/\//i.test(String(s || ""));
}
function basenameLike(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : s;
}
function collectImageSrcs(node: unknown, out: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const v of node) collectImageSrcs(v, out);
    return;
  }
  if (typeof node !== "object") return;
  const anyNode = node as Record<string, unknown>;

  const opener = anyNode.openerImage ?? anyNode.opener_image;
  if (typeof opener === "string" && opener.trim()) out.add(opener.trim());

  const imgs = anyNode.images;
  if (Array.isArray(imgs)) {
    for (const img of imgs) {
      if (!img || typeof img !== "object") continue;
      const src = (img as any)?.src;
      if (typeof src === "string" && src.trim()) out.add(src.trim());
    }
  }

  for (const v of Object.values(anyNode)) collectImageSrcs(v, out);
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

    let body: IngestBody;
    try {
      body = await req.json() as IngestBody;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!body?.bookId || typeof body.bookId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!body?.level || !["n3", "n4"].includes(body.level)) {
      return json({ ok: false, error: { code: "invalid_request", message: "level is required (n3 or n4)" }, httpStatus: 400, requestId }, 200);
    }
    if (!body?.canonical) {
      return json({ ok: false, error: { code: "invalid_request", message: "canonical JSON is required" }, httpStatus: 400, requestId }, 200);
    }

    const canonicalStr = typeof body.canonical === "string" ? body.canonical : JSON.stringify(body.canonical);
    const figuresStr = body.figures ? (typeof body.figures === "string" ? body.figures : JSON.stringify(body.figures)) : null;
    const designTokensStr = body.designTokens ? (typeof body.designTokens === "string" ? body.designTokens : JSON.stringify(body.designTokens)) : null;

    // Compute book_version_id from canonical + figures + designTokens hashes
    const canonicalHash = await sha256Hex(canonicalStr);
    const figuresHash = figuresStr ? await sha256Hex(figuresStr) : "";
    const tokensHash = designTokensStr ? await sha256Hex(designTokensStr) : "";
    const combinedHash = await sha256Hex(`${canonicalHash}:${figuresHash}:${tokensHash}`);
    const bookVersionId = combinedHash; // Full deterministic version hash (avoid collisions)

    const basePath = `${body.bookId}/${bookVersionId}`;
    const schemaVersion = body.schemaVersion || "1.0";

    // Ensure book exists (upsert)
    const { error: bookErr } = await adminSupabase
      .from("books")
      .upsert({
        id: body.bookId,
        organization_id: orgId,
        title: body.title || body.bookId,
        level: body.level,
        source: body.source || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (bookErr) {
      console.error("[book-ingest-version] Failed to upsert book:", bookErr);
      return json({ ok: false, error: { code: "db_error", message: bookErr.message }, httpStatus: 500, requestId }, 200);
    }

    // Check if version already exists
    const { data: existingVersion } = await adminSupabase
      .from("book_versions")
      .select("id, book_version_id")
      .eq("book_id", body.bookId)
      .eq("book_version_id", bookVersionId)
      .single();

    if (existingVersion) {
      // Version already exists, return idempotent response
      console.log(`[book-ingest-version] Version ${bookVersionId} already exists for book ${body.bookId} (${requestId})`);
      return json({
        ok: true,
        bookId: body.bookId,
        bookVersionId,
        versionRowId: existingVersion.id,
        status: "exists",
        message: "Version already ingested (idempotent)",
        requestId,
      }, 200);
    }

    // Upload canonical.json
    const canonicalPath = `${basePath}/canonical.json`;
    const { error: canonicalUpErr } = await adminSupabase.storage
      .from("books")
      .upload(canonicalPath, new Blob([canonicalStr], { type: "application/json" }), { upsert: true, contentType: "application/json" });

    if (canonicalUpErr) {
      console.error("[book-ingest-version] Failed to upload canonical.json:", canonicalUpErr);
      return json({ ok: false, error: { code: "storage_error", message: canonicalUpErr.message }, httpStatus: 500, requestId }, 200);
    }

    // Upload figures.json if provided
    let figuresPath: string | null = null;
    if (figuresStr) {
      figuresPath = `${basePath}/figures.json`;
      const { error: figuresUpErr } = await adminSupabase.storage
        .from("books")
        .upload(figuresPath, new Blob([figuresStr], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      if (figuresUpErr) {
        console.error("[book-ingest-version] Failed to upload figures.json:", figuresUpErr);
        return json({ ok: false, error: { code: "storage_error", message: figuresUpErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    // If no figures were provided, but the canonical references local image src values,
    // point figures_path at the uploaded image library index (library/{bookId}/images-index.json).
    if (!figuresPath) {
      let canonJson: any = null;
      try {
        canonJson = canonicalStr ? JSON.parse(canonicalStr) : null;
      } catch {
        canonJson = null;
      }

      const srcs = new Set<string>();
      collectImageSrcs(canonJson, srcs);
      const needed = Array.from(srcs)
        .map((s) => String(s || "").trim())
        .filter((s) => !!s)
        .filter((s) => !isHttpUrl(s) && !isDataUrl(s) && !isFileUrl(s));

      if (needed.length) {
        const libraryIndexPath = `library/${body.bookId}/images-index.json`;
        // Existence check via signed URL (do not print it).
        const { data: idxSigned, error: idxSignErr } = await adminSupabase.storage
          .from("books")
          .createSignedUrl(libraryIndexPath, 60);

        if (idxSignErr || !idxSigned?.signedUrl) {
          return json({
            ok: false,
            error: {
              code: "missing_image_library",
              message:
                `BLOCKED: Canonical references ${needed.length} image(s) but no figures mapping was provided and ` +
                `the image library index is missing at ${libraryIndexPath}. ` +
                `Upload it (script: scripts/books/upload-book-image-library.py) or pass figures.json with srcMap.`,
            },
            httpStatus: 409,
            requestId,
          }, 200);
        }

        figuresPath = libraryIndexPath;
      }
    }

    // Upload design_tokens.json if provided
    let designTokensPath: string | null = null;
    if (designTokensStr) {
      designTokensPath = `${basePath}/design_tokens.json`;
      const { error: tokensUpErr } = await adminSupabase.storage
        .from("books")
        .upload(designTokensPath, new Blob([designTokensStr], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      if (tokensUpErr) {
        console.error("[book-ingest-version] Failed to upload design_tokens.json:", tokensUpErr);
        return json({ ok: false, error: { code: "storage_error", message: tokensUpErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    // Create book_versions row
    const { data: versionRow, error: versionErr } = await adminSupabase
      .from("book_versions")
      .insert({
        book_id: body.bookId,
        book_version_id: bookVersionId,
        schema_version: schemaVersion,
        source: body.source || null,
        exported_at: new Date().toISOString(),
        canonical_path: canonicalPath,
        figures_path: figuresPath,
        design_tokens_path: designTokensPath,
        status: "active",
      })
      .select("id")
      .single();

    if (versionErr || !versionRow) {
      console.error("[book-ingest-version] Failed to insert book_versions row:", versionErr);
      return json({ ok: false, error: { code: "db_error", message: versionErr?.message || "Failed to insert version" }, httpStatus: 500, requestId }, 200);
    }

    console.log(`[book-ingest-version] Ingested version ${bookVersionId} for book ${body.bookId} (${requestId})`);

    return json({
      ok: true,
      bookId: body.bookId,
      bookVersionId,
      versionRowId: versionRow.id,
      canonicalPath,
      figuresPath,
      designTokensPath,
      status: "ingested",
      message: "Book version ingested successfully",
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-ingest-version] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});

