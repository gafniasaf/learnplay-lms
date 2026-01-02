/**
 * book-library-image-url (HYBRID AUTH)
 *
 * Resolves canonical image src keys to signed URLs using the shared book image library index:
 *   books bucket: library/{bookId}/images-index.json  (maps canonicalSrc -> storagePath)
 *
 * This is used by Book Studio / WYSIWYG to display cover + images without requiring a render worker.
 *
 * Request (POST):
 * { bookId: string, canonicalSrcs: string[], expiresIn?: number }
 *
 * Response (200 always, envelope):
 * {
 *   ok: true,
 *   bookId: string,
 *   urls: Record<string, { storagePath: string, signedUrl: string }>,
 *   missing: string[],
 *   expiresIn: number,
 *   requestId: string
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
  canonicalSrcs: string[];
  expiresIn?: number;
}

function basenameLike(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : s;
}

function isObjectNotFoundErrorMessage(msg: string): boolean {
  const m = String(msg || "").toLowerCase();
  return m.includes("not found") || m.includes("object not found");
}

function isSafeLibraryImagePath(storagePath: string, bookId: string): boolean {
  const p = String(storagePath || "").trim();
  if (!p) return false;
  if (p.startsWith("/") || p.includes("\\") || p.includes("..")) return false;
  if (/^https?:\/\//i.test(p) || /^data:/i.test(p) || /^file:\/\//i.test(p)) return false;
  const prefix = `library/${bookId}/images/`;
  return p.startsWith(prefix);
}

async function requireOrgEditor(auth: { type: "agent" | "user"; userId?: string }, orgId: string) {
  if (auth.type === "agent") return;
  const userId = auth.userId;
  if (!userId) throw new Error("Unauthorized: missing userId");

  const { data, error } = await adminSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .in("role", ["org_admin", "editor"])
    .limit(1);

  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Forbidden: editor role required");
  }
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
    await requireOrgEditor(auth as any, orgId);

    let body: Body;
    try {
      body = await req.json() as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    const bookId = typeof body?.bookId === "string" ? body.bookId.trim() : "";
    const canonicalSrcsRaw = Array.isArray(body?.canonicalSrcs) ? body.canonicalSrcs : [];
    const canonicalSrcs = canonicalSrcsRaw
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => !!s)
      .slice(0, 200);

    if (!bookId) {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (canonicalSrcs.length === 0) {
      return json(
        { ok: false, error: { code: "invalid_request", message: "canonicalSrcs is required" }, httpStatus: 400, requestId },
        200,
      );
    }

    const expiresIn = typeof body.expiresIn === "number" && body.expiresIn > 0 ? Math.min(body.expiresIn, 86400) : 3600;

    // Verify book belongs to org
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id, organization_id")
      .eq("id", bookId)
      .single();

    if (bookErr || !book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
    }
    if ((book as any).organization_id !== orgId) {
      return json({ ok: false, error: { code: "forbidden", message: "Book belongs to a different organization" }, httpStatus: 403, requestId }, 200);
    }

    // Load library index (best-effort; missing index just means all are missing)
    const indexPath = `library/${bookId}/images-index.json`;
    let idxSrcMap: Record<string, string> = {};
    const { data: blob, error: dlErr } = await adminSupabase.storage.from("books").download(indexPath);
    if (dlErr || !blob) {
      const msg = dlErr?.message || "";
      if (!isObjectNotFoundErrorMessage(msg)) {
        return json({ ok: false, error: { code: "storage_error", message: msg || "Failed to download image index" }, httpStatus: 500, requestId }, 200);
      }
    } else {
      try {
        const text = await blob.text();
        const idx = text ? JSON.parse(text) : null;
        const maybe = idx && typeof idx === "object" ? ((idx as any).srcMap ?? (idx as any).src_map) : null;
        if (maybe && typeof maybe === "object") idxSrcMap = maybe as Record<string, string>;
      } catch {
        idxSrcMap = {};
      }
    }

    const urls: Record<string, { storagePath: string; signedUrl: string }> = {};
    const missing: string[] = [];

    for (const canonicalSrc of canonicalSrcs) {
      const storagePathRaw =
        (typeof idxSrcMap[canonicalSrc] === "string" && idxSrcMap[canonicalSrc].trim())
          ? idxSrcMap[canonicalSrc].trim()
          : "";

      // Support basename lookups too (index writer stores them, but be defensive)
      const base = basenameLike(canonicalSrc);
      const storagePath =
        storagePathRaw ||
        (base && typeof idxSrcMap[base] === "string" && idxSrcMap[base].trim() ? idxSrcMap[base].trim() : "");

      if (!storagePath) {
        missing.push(canonicalSrc);
        continue;
      }
      if (!isSafeLibraryImagePath(storagePath, bookId)) {
        // Treat unsafe paths as missing to avoid signing unexpected objects
        missing.push(canonicalSrc);
        continue;
      }

      const { data: signed, error: signErr } = await adminSupabase.storage.from("books").createSignedUrl(storagePath, expiresIn);
      if (signErr || !signed?.signedUrl) {
        return json(
          {
            ok: false,
            error: { code: "storage_error", message: signErr?.message || "Failed to sign URL" },
            httpStatus: 500,
            requestId,
          },
          200,
        );
      }
      urls[canonicalSrc] = { storagePath, signedUrl: signed.signedUrl };
    }

    return json({ ok: true, bookId, urls, missing, expiresIn, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isForbidden = String(message || "").toLowerCase().includes("forbidden");
    return json(
      { ok: false, error: { code: isForbidden ? "forbidden" : "internal_error", message }, httpStatus: isForbidden ? 403 : 500, requestId },
      200,
    );
  }
});

