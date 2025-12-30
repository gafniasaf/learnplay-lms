/**
 * book-library-upload-url (HYBRID AUTH)
 *
 * Issues a signed upload URL for uploading a single missing book image into the shared library location:
 *   books bucket: library/{bookId}/images/{fileName}
 *
 * This is intended to support the "missing image placeholders" workflow:
 * - Worker renders placeholders + a report listing canonicalSrc values.
 * - Admin UI calls this to upload the missing image, then updates images-index.json mapping.
 *
 * Request (POST):
 * { bookId: string, canonicalSrc: string, fileName?: string }
 *
 * Response:
 * { ok: true, signedUrl: string, path: string, fileName: string }
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
  canonicalSrc: string;
  fileName?: string;
}

function basenameLike(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : s;
}

function toSafeFileName(raw: string): string {
  const base = basenameLike(raw);
  const parsed = base.match(/^(.+?)(\.[a-zA-Z0-9]+)$/);
  const name = parsed ? parsed[1] : base;
  const ext = parsed ? parsed[2] : "";
  const safeName = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const safeExt = ext.toLowerCase();
  return `${safeName || "image"}${safeExt}`;
}

function isSafeFileName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return /^[a-zA-Z0-9._-]+$/.test(name);
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
    if (!body?.canonicalSrc || typeof body.canonicalSrc !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "canonicalSrc is required" }, httpStatus: 400, requestId }, 200);
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

    const fileNameRaw = (typeof body.fileName === "string" && body.fileName.trim())
      ? body.fileName.trim()
      : toSafeFileName(body.canonicalSrc);
    const fileName = toSafeFileName(fileNameRaw);
    if (!isSafeFileName(fileName)) {
      return json({ ok: false, error: { code: "invalid_request", message: "Derived fileName was not safe" }, httpStatus: 400, requestId }, 200);
    }

    const objectPath = `library/${body.bookId}/images/${fileName}`;
    const { data, error } = await adminSupabase.storage.from("books").createSignedUploadUrl(objectPath);
    if (error || !data?.signedUrl || !data?.path) {
      console.error("[book-library-upload-url] createSignedUploadUrl error:", error);
      return json({ ok: false, error: { code: "storage_error", message: error?.message || "Failed to create signed upload URL" }, httpStatus: 500, requestId }, 200);
    }

    return json({ ok: true, signedUrl: data.signedUrl, path: data.path, fileName, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isForbidden = String(message || "").toLowerCase().includes("forbidden");
    return json({ ok: false, error: { code: isForbidden ? "forbidden" : "internal_error", message }, httpStatus: isForbidden ? 403 : 500, requestId }, 200);
  }
});


