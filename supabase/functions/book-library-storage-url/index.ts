/**
 * book-library-storage-url (HYBRID AUTH)
 *
 * Issues a signed URL for a specific storagePath in the shared book image library:
 *   books bucket: library/{bookId}/images/{fileName}
 *
 * This supports the Book Studio "image version history" UI where admins can preview
 * historical storage_path values before re-linking them.
 *
 * Request (POST):
 * { bookId: string, storagePath: string, expiresIn?: number }
 *
 * Response:
 * { ok: true, bookId: string, storagePath: string, signedUrl: string, expiresIn: number }
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
  storagePath: string;
  expiresIn?: number;
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

function isSafeLibraryImagePath(storagePath: string, bookId: string): boolean {
  const p = String(storagePath || "").trim();
  if (!p) return false;
  if (p.startsWith("/") || p.includes("\\") || p.includes("..")) return false;
  if (/^https?:\/\//i.test(p) || /^data:/i.test(p) || /^file:\/\//i.test(p)) return false;
  const prefix = `library/${bookId}/images/`;
  return p.startsWith(prefix);
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
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
    if (!bookId) {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!storagePath) {
      return json({ ok: false, error: { code: "invalid_request", message: "storagePath is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!isSafeLibraryImagePath(storagePath, bookId)) {
      return json({
        ok: false,
        error: { code: "invalid_request", message: `storagePath must start with "library/${bookId}/images/"` },
        httpStatus: 400,
        requestId,
      }, 200);
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

    const { data: signed, error: signErr } = await adminSupabase.storage.from("books").createSignedUrl(storagePath, expiresIn);
    if (signErr || !signed?.signedUrl) {
      return json({ ok: false, error: { code: "storage_error", message: signErr?.message || "Failed to sign URL" }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      bookId,
      storagePath,
      signedUrl: signed.signedUrl,
      expiresIn,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isForbidden = String(message || "").toLowerCase().includes("forbidden");
    return json(
      { ok: false, error: { code: isForbidden ? "forbidden" : "internal_error", message }, httpStatus: isForbidden ? 403 : 500, requestId },
      200,
    );
  }
});


