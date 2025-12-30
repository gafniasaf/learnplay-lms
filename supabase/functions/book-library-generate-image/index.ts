/**
 * book-library-generate-image (HYBRID AUTH)
 *
 * Generates an image via the configured media provider and stores it in the Books image library:
 *   books bucket: library/{bookId}/images/{fileName}
 *
 * Also upserts the mapping in:
 *   library/{bookId}/images-index.json
 *
 * Request (POST):
 * {
 *   bookId: string,
 *   canonicalSrc: string,
 *   prompt: string,
 *   providerId?: string,
 *   options?: Record<string, unknown>
 * }
 *
 * Response:
 * { ok: true, storagePath: string, signedUrl: string, fileName: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import { getDefaultProvider, getProvider, UpstreamProviderError } from "../_shared/media-providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Body = {
  bookId: string;
  canonicalSrc: string;
  prompt: string;
  providerId?: string;
  options?: Record<string, unknown>;
};

function basenameLike(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : s;
}

function toSafeFileName(raw: string, fallbackExt: string): string {
  const base = basenameLike(raw);
  const parsed = base.match(/^(.+?)(\.[a-zA-Z0-9]+)$/);
  const name = parsed ? parsed[1] : base;
  const ext = (parsed ? parsed[2] : fallbackExt).toLowerCase();
  const safeName = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return `${safeName || "image"}${ext.startsWith(".") ? ext : `.${ext}`}`;
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

function isObjectNotFoundErrorMessage(msg: string): boolean {
  const m = String(msg || "").toLowerCase();
  return m.includes("not found") || m.includes("object not found");
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
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method Not Allowed" }, requestId }, 200);
  }

  try {
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, requestId }, 200);
    }

    const orgId = requireOrganizationId(auth);
    await requireOrgEditor(auth, orgId);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, requestId }, 200);
    }

    const bookId = typeof body?.bookId === "string" ? body.bookId.trim() : "";
    const canonicalSrc = typeof body?.canonicalSrc === "string" ? body.canonicalSrc.trim() : "";
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!bookId) return json({ ok: false, error: { code: "invalid_request", message: "bookId is required" }, requestId }, 200);
    if (!canonicalSrc) return json({ ok: false, error: { code: "invalid_request", message: "canonicalSrc is required" }, requestId }, 200);
    if (!prompt) return json({ ok: false, error: { code: "invalid_request", message: "prompt is required" }, requestId }, 200);

    // Verify book belongs to org
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id, organization_id")
      .eq("id", bookId)
      .single();

    if (bookErr || !book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, requestId }, 200);
    }
    if ((book as any).organization_id !== orgId) {
      return json({ ok: false, error: { code: "forbidden", message: "Book belongs to a different organization" }, requestId }, 200);
    }

    const provider =
      (typeof body.providerId === "string" && body.providerId.trim() ? getProvider(body.providerId.trim()) : null) ||
      getDefaultProvider("image");

    if (!provider || !provider.enabled) {
      return json({ ok: false, error: { code: "provider_unavailable", message: "No enabled provider for image generation" }, requestId }, 200);
    }

    const result = await provider.generate({
      mediaType: "image",
      prompt,
      options: body.options ?? {},
    });

    // Fetch image bytes
    const imgResp = await fetch(result.url);
    if (!imgResp.ok) {
      return json(
        {
          ok: false,
          error: { code: "upstream_fetch_failed", message: `Failed to fetch generated image: ${imgResp.status} ${imgResp.statusText}` },
          requestId,
        },
        200,
      );
    }

    const contentType = imgResp.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await imgResp.arrayBuffer());
    const fallbackExt =
      contentType.includes("webp") ? ".webp" :
      contentType.includes("png") ? ".png" :
      contentType.includes("jpeg") || contentType.includes("jpg") ? ".jpg" :
      ".png";

    const fileName = toSafeFileName(canonicalSrc, fallbackExt);
    const storagePath = `library/${bookId}/images/${fileName}`;

    // Upload to private books bucket
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: contentType });
    const { error: upErr } = await adminSupabase.storage.from("books").upload(storagePath, blob, {
      upsert: true,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    });
    if (upErr) {
      return json({ ok: false, error: { code: "storage_error", message: upErr.message }, requestId }, 200);
    }

    // Upsert mapping in images-index.json
    const indexPath = `library/${bookId}/images-index.json`;
    let idx: any = null;
    const { data: idxBlob, error: dlErr } = await adminSupabase.storage.from("books").download(indexPath);
    if (dlErr || !idxBlob) {
      const msg = dlErr?.message || "";
      if (!isObjectNotFoundErrorMessage(msg)) {
        return json({ ok: false, error: { code: "storage_error", message: msg || "Failed to read images index" }, requestId }, 200);
      }
      idx = { bookSlug: bookId, updatedAt: new Date().toISOString(), srcMap: {} };
    } else {
      try {
        const text = await idxBlob.text();
        idx = text ? JSON.parse(text) : null;
      } catch {
        idx = null;
      }
      if (!idx || typeof idx !== "object") idx = { bookSlug: bookId, updatedAt: new Date().toISOString(), srcMap: {} };
      if (!idx.srcMap || typeof idx.srcMap !== "object") idx.srcMap = {};
    }
    (idx.srcMap as Record<string, string>)[canonicalSrc] = storagePath;
    const base = basenameLike(canonicalSrc);
    if (base && !(base in (idx.srcMap as Record<string, string>))) (idx.srcMap as Record<string, string>)[base] = storagePath;
    idx.updatedAt = new Date().toISOString();

    const idxUpload = new Blob([JSON.stringify(idx, null, 2)], { type: "application/json" });
    const { error: idxUpErr } = await adminSupabase.storage.from("books").upload(indexPath, idxUpload, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "no-cache",
    });
    if (idxUpErr) {
      return json({ ok: false, error: { code: "storage_error", message: idxUpErr.message }, requestId }, 200);
    }

    // Signed URL for preview
    const { data: signed, error: signErr } = await adminSupabase.storage.from("books").createSignedUrl(storagePath, 3600);
    if (signErr || !signed?.signedUrl) {
      return json({ ok: false, error: { code: "storage_error", message: signErr?.message || "Failed to sign URL" }, requestId }, 200);
    }

    return json({
      ok: true,
      bookId,
      canonicalSrc,
      storagePath,
      fileName,
      signedUrl: signed.signedUrl,
      provider: provider.id,
      requestId,
    }, 200);
  } catch (e) {
    if (e instanceof UpstreamProviderError) {
      const code = e.retryable ? "upstream_unavailable" : "upstream_error";
      return json(
        {
          ok: false,
          error: { code, message: e.message, provider: e.providerId, retryable: e.retryable, upstreamStatus: e.status || undefined },
          requestId,
        },
        200,
      );
    }

    const msg = e instanceof Error ? e.message : String(e);
    const isForbidden = String(msg || "").toLowerCase().includes("forbidden");
    return json({ ok: false, error: { code: isForbidden ? "forbidden" : "internal_error", message: msg }, requestId }, 200);
  }
});


