/**
 * book-save-overlay (HYBRID AUTH)
 *
 * Saves rewrites.json for an overlay, and records paragraph basis hashes for conflict detection.
 *
 * Request (POST):
 * {
 *   overlayId: string,
 *   rewrites: {
 *     paragraphs: Array<{ paragraph_id: string, rewritten: string }>
 *   }
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

interface RewriteEntry {
  paragraph_id: string;
  rewritten: string;
}

interface Body {
  overlayId: string;
  rewrites: { paragraphs: RewriteEntry[] };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function downloadJson(bucket: string, objectPath: string): Promise<any> {
  const { data: file, error } = await adminSupabase.storage.from(bucket).download(objectPath);
  if (error || !file) throw new Error(error?.message || `Failed to download ${bucket}/${objectPath}`);
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${bucket}/${objectPath}`);
  }
}

function collectParagraphBasis(root: any): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const id = node.id;
    const basis = node.basis;
    if (typeof id === "string" && typeof basis === "string") {
      map.set(id, basis);
    }
    Object.values(node).forEach(walk);
  };
  walk(root);
  return map;
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

    if (!body?.overlayId || typeof body.overlayId !== "string") {
      return json({ ok: false, error: { code: "invalid_request", message: "overlayId is required" }, httpStatus: 400, requestId }, 200);
    }

    const paragraphs = Array.isArray(body?.rewrites?.paragraphs) ? body.rewrites.paragraphs : null;
    if (!paragraphs) {
      return json({ ok: false, error: { code: "invalid_request", message: "rewrites.paragraphs is required" }, httpStatus: 400, requestId }, 200);
    }

    // Load overlay metadata
    const { data: overlay, error: overlayErr } = await adminSupabase
      .from("book_overlays")
      .select("id, book_id, book_version_id, overlay_path, label")
      .eq("id", body.overlayId)
      .single();

    if (overlayErr || !overlay) {
      return json({ ok: false, error: { code: "not_found", message: "Overlay not found" }, httpStatus: 404, requestId }, 200);
    }

    // Verify org boundary via books
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id, organization_id")
      .eq("id", overlay.book_id)
      .single();

    if (bookErr || !book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
    }
    if (book.organization_id !== orgId) {
      return json({ ok: false, error: { code: "forbidden", message: "Overlay belongs to a different organization" }, httpStatus: 403, requestId }, 200);
    }

    // Load canonical JSON to compute basis hashes
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("canonical_path")
      .eq("book_id", overlay.book_id)
      .eq("book_version_id", overlay.book_version_id)
      .single();

    if (versionErr || !version?.canonical_path) {
      return json({ ok: false, error: { code: "not_found", message: "Book version canonical not found" }, httpStatus: 404, requestId }, 200);
    }

    const canonical = await downloadJson("books", version.canonical_path);
    const basisMap = collectParagraphBasis(canonical);

    const missing: string[] = [];
    const deduped: RewriteEntry[] = [];
    const seen = new Set<string>();
    for (const p of paragraphs) {
      const pid = p?.paragraph_id;
      const rewritten = p?.rewritten;
      if (typeof pid !== "string" || typeof rewritten !== "string") continue;
      if (seen.has(pid)) continue;
      seen.add(pid);
      if (!basisMap.has(pid)) {
        missing.push(pid);
        continue;
      }
      deduped.push({ paragraph_id: pid, rewritten });
    }

    if (missing.length > 0) {
      return json({
        ok: false,
        error: { code: "invalid_request", message: "Some paragraph_id values do not exist in canonical JSON", missing },
        httpStatus: 400,
        requestId,
      }, 200);
    }

    // Compute hashes
    const ids = deduped.map((d) => d.paragraph_id);
    const hashes = new Map<string, string>();
    for (const id of ids) {
      const basis = basisMap.get(id) || "";
      hashes.set(id, await sha256Hex(basis));
    }

    // Conflict detection: if basis_hash_at_edit exists and differs, fail loud.
    const { data: existing, error: exErr } = await adminSupabase
      .from("book_overlay_paragraphs")
      .select("paragraph_id, basis_hash_at_edit")
      .eq("overlay_id", overlay.id)
      .in("paragraph_id", ids);

    if (exErr) {
      return json({ ok: false, error: { code: "db_error", message: exErr.message }, httpStatus: 500, requestId }, 200);
    }

    const conflicts: Array<{ paragraph_id: string; expected_hash: string; stored_hash: string }> = [];
    for (const row of (existing || []) as any[]) {
      const pid = String(row.paragraph_id);
      const stored = String(row.basis_hash_at_edit || "");
      const expected = hashes.get(pid);
      if (expected && stored && stored !== expected) {
        conflicts.push({ paragraph_id: pid, expected_hash: expected, stored_hash: stored });
      }
    }
    if (conflicts.length > 0) {
      return json({
        ok: false,
        error: { code: "conflict", message: "Canonical text changed since overlay was created (rebase required)", conflicts },
        httpStatus: 409,
        requestId,
      }, 200);
    }

    // Upsert paragraph hash metadata
    const metaRows = ids.map((pid) => ({
      overlay_id: overlay.id,
      paragraph_id: pid,
      basis_hash_at_edit: hashes.get(pid) || "",
    }));

    if (metaRows.length > 0) {
      const { error: upMetaErr } = await adminSupabase
        .from("book_overlay_paragraphs")
        .upsert(metaRows, { onConflict: "overlay_id,paragraph_id" });
      if (upMetaErr) {
        return json({ ok: false, error: { code: "db_error", message: upMetaErr.message }, httpStatus: 500, requestId }, 200);
      }
    }

    // Upload rewrites JSON (source of truth for the worker)
    const rewritesJson = { paragraphs: deduped };
    const blob = new Blob([JSON.stringify(rewritesJson, null, 2)], { type: "application/json" });
    const { error: upErr } = await adminSupabase.storage
      .from("books")
      .upload(overlay.overlay_path, blob, { upsert: true, contentType: "application/json" });

    if (upErr) {
      return json({ ok: false, error: { code: "storage_error", message: upErr.message }, httpStatus: 500, requestId }, 200);
    }

    // Touch overlay row to bump updated_at (for downstream staleness checks)
    const { error: touchErr } = await adminSupabase
      .from("book_overlays")
      .update({ label: (overlay as any).label ?? null })
      .eq("id", overlay.id);
    if (touchErr) {
      return json({ ok: false, error: { code: "db_error", message: touchErr.message }, httpStatus: 500, requestId }, 200);
    }

    // Mark dependent e-learning outputs stale (best-effort, but must not silently fail)
    const { error: staleErr } = await adminSupabase
      .from("book_elearning_links")
      .update({ stale: true, stale_reason: "overlay_updated" })
      .eq("overlay_id", overlay.id)
      .eq("stale", false);
    if (staleErr) {
      return json({ ok: false, error: { code: "db_error", message: staleErr.message }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      overlayId: overlay.id,
      bookId: overlay.book_id,
      bookVersionId: overlay.book_version_id,
      overlayPath: overlay.overlay_path,
      savedParagraphs: deduped.length,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-save-overlay] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


