/**
 * book-library-upsert-index (HYBRID AUTH)
 *
 * Updates (or creates) the shared image library index for a book:
 *   books bucket: library/{bookId}/images-index.json
 *
 * The worker uses this index to resolve canonical image src values to Storage object paths.
 *
 * Request (POST):
 * {
 *   bookId: string,
 *   mappings: Array<{ canonicalSrc: string, storagePath: string }>
 * }
 *
 * Response:
 * { ok: true, updated: number }
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

type Mapping = { canonicalSrc: string; storagePath: string };
interface Body {
  bookId: string;
  mappings: Mapping[];
}

function basenameLike(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : s;
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
    await requireOrgEditor(auth, orgId);

    let body: Body;
    try {
      body = await req.json() as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!body?.bookId || typeof body.bookId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!Array.isArray(body.mappings) || body.mappings.length === 0) {
      return json({ ok: false, error: { code: "invalid_request", message: "mappings is required" }, httpStatus: 400, requestId }, 200);
    }

    // Verify book belongs to org
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id, organization_id")
      .eq("id", body.bookId)
      .single();

    if (bookErr || !book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
    }
    if ((book as any).organization_id !== orgId) {
      return json({ ok: false, error: { code: "forbidden", message: "Book belongs to a different organization" }, httpStatus: 403, requestId }, 200);
    }

    const indexPath = `library/${body.bookId}/images-index.json`;

    let idx: any = null;
    const { data: blob, error: dlErr } = await adminSupabase.storage.from("books").download(indexPath);
    if (dlErr || !blob) {
      // Treat missing/failed downloads as "index does not exist yet" and proceed to create it.
      // Storage error reporting from Supabase can sometimes be an empty JSON "{}" message even on 404.
      idx = { bookSlug: body.bookId, updatedAt: new Date().toISOString(), srcMap: {} };
    } else {
      try {
        const text = await blob.text();
        idx = text ? JSON.parse(text) : null;
      } catch {
        idx = null;
      }
      if (!idx || typeof idx !== "object") idx = { bookSlug: body.bookId, updatedAt: new Date().toISOString(), srcMap: {} };
      if (!idx.srcMap || typeof idx.srcMap !== "object") idx.srcMap = {};
    }

    let updated = 0;
    for (const m of body.mappings) {
      if (!m || typeof m !== "object") continue;
      const canonicalSrc = typeof m.canonicalSrc === "string" ? m.canonicalSrc.trim() : "";
      const storagePath = typeof m.storagePath === "string" ? m.storagePath.trim() : "";
      if (!canonicalSrc || !storagePath) continue;
      (idx.srcMap as Record<string, string>)[canonicalSrc] = storagePath;
      updated += 1;

      // Convenience: map basename too if absent (helps canonical src variants)
      const base = basenameLike(canonicalSrc);
      if (base && !(base in (idx.srcMap as Record<string, string>))) {
        (idx.srcMap as Record<string, string>)[base] = storagePath;
      }
    }

    idx.updatedAt = new Date().toISOString();
    idx.bookSlug = idx.bookSlug || body.bookId;

    const blobToUpload = new Blob([JSON.stringify(idx, null, 2)], { type: "application/json" });
    const { error: upErr } = await adminSupabase.storage.from("books").upload(indexPath, blobToUpload, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "no-cache",
    });
    if (upErr) {
      const meta = JSON.stringify({
        message: (upErr as any)?.message ?? "",
        error: (upErr as any)?.error ?? "",
        statusCode: (upErr as any)?.statusCode ?? (upErr as any)?.status ?? null,
      });
      const msg = upErr.message && upErr.message !== "{}" ? upErr.message : meta;
      return json({ ok: false, error: { code: "storage_error", message: msg || "Storage upload failed" }, httpStatus: 500, requestId }, 200);
    }

    return json({ ok: true, updated, indexPath, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isForbidden = String(message || "").toLowerCase().includes("forbidden");
    return json({ ok: false, error: { code: isForbidden ? "forbidden" : "internal_error", message }, httpStatus: isForbidden ? 403 : 500, requestId }, 200);
  }
});


