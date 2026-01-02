/**
 * book-version-save-figure-placements (HYBRID AUTH)
 *
 * Persists LLM-derived figure placements onto the immutable book_version row so
 * later renders do not rely on filename-based heuristics.
 *
 * Request (POST):
 * {
 *   bookId: string,
 *   bookVersionId: string,
 *   figurePlacements: {
 *     schemaVersion: string,
 *     generatedAt: string,
 *     provider?: string,
 *     model?: string,
 *     placements: Record<string, { paragraph_id: string, chapter_index: number, confidence?: number, uncertain?: boolean }>
 *   }
 * }
 *
 * Response:
 * { ok: true, bookId, bookVersionId, updatedAt }
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

interface PlacementRow {
  paragraph_id: string;
  chapter_index: number;
  confidence?: number;
  uncertain?: boolean;
}
interface FigurePlacementsPayload {
  schemaVersion: string;
  generatedAt: string;
  provider?: string;
  model?: string;
  placements: Record<string, PlacementRow>;
}
interface Body {
  bookId: string;
  bookVersionId: string;
  figurePlacements: FigurePlacementsPayload;
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

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
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

    const bookId = typeof body?.bookId === "string" ? body.bookId.trim() : "";
    const bookVersionId = typeof body?.bookVersionId === "string" ? body.bookVersionId.trim() : "";
    const fp = body?.figurePlacements as unknown;

    if (!bookId) {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!bookVersionId) {
      return json({ ok: false, error: { code: "invalid_request", message: "bookVersionId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!isPlainObject(fp)) {
      return json({ ok: false, error: { code: "invalid_request", message: "figurePlacements must be an object" }, httpStatus: 400, requestId }, 200);
    }
    const schemaVersion = typeof fp.schemaVersion === "string" ? fp.schemaVersion.trim() : "";
    const generatedAt = typeof fp.generatedAt === "string" ? fp.generatedAt.trim() : "";
    if (!schemaVersion) {
      return json({ ok: false, error: { code: "invalid_request", message: "figurePlacements.schemaVersion is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!generatedAt) {
      return json({ ok: false, error: { code: "invalid_request", message: "figurePlacements.generatedAt is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!isPlainObject(fp.placements)) {
      return json({ ok: false, error: { code: "invalid_request", message: "figurePlacements.placements must be an object" }, httpStatus: 400, requestId }, 200);
    }

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

    // Verify book version exists
    const { data: version, error: verErr } = await adminSupabase
      .from("book_versions")
      .select("id")
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId)
      .single();

    if (verErr || !version) {
      return json({ ok: false, error: { code: "not_found", message: "Book version not found" }, httpStatus: 404, requestId }, 200);
    }

    const now = new Date().toISOString();
    const { error: updErr } = await adminSupabase
      .from("book_versions")
      .update({
        figure_placements: fp as any,
        figure_placements_updated_at: now,
      })
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId);

    if (updErr) {
      return json({ ok: false, error: { code: "db_error", message: updErr.message }, httpStatus: 500, requestId }, 200);
    }

    return json({ ok: true, bookId, bookVersionId, updatedAt: now, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isForbidden = String(message || "").toLowerCase().includes("forbidden");
    return json(
      { ok: false, error: { code: isForbidden ? "forbidden" : "internal_error", message }, httpStatus: isForbidden ? 403 : 500, requestId },
      200,
    );
  }
});


