/**
 * book-version-input-urls (HYBRID AUTH)
 *
 * Returns signed download URLs for canonical inputs in the `books` bucket:
 * - canonical.json
 * - figures.json (optional)
 * - design_tokens.json (optional)
 * - overlay.json (optional, via overlayId)
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
  overlayId?: string;
  expiresIn?: number;
  /**
   * If true, do NOT hard-fail when image mappings/assets are missing.
   * Instead, return partial imageSrcMap and report missingImageSrcs so the worker can
   * render draft PDFs with visible placeholders.
   */
  allowMissingImages?: boolean;
  /**
   * Optional hint for resolving image src references into signed URLs.
   * The worker should pass this so the edge function can scope image signing
   * to the requested render target (chapter/book) and avoid returning huge maps.
   */
  target?: "book" | "chapter";
  chapterIndex?: number;
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

function normalizeStemKey(raw: string): string {
  const base = basenameLike(raw);
  if (!base) return "";
  const noExt = base.replace(/\.[a-z0-9]+$/i, "");
  let s = noExt.toLowerCase();
  // Normalize common chapter/image numbering patterns
  s = s.replace(/ch0+(\d+)/g, "ch$1");
  s = s.replace(/img0+(\d+)/g, "img$1");
  // Collapse to safe key
  s = s.replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return s;
}

function collectImageSrcs(node: unknown, out: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const v of node) collectImageSrcs(v, out);
    return;
  }
  if (typeof node !== "object") return;

  const anyNode = node as Record<string, unknown>;

  // Common canonical fields for openers
  const opener = anyNode.openerImage ?? anyNode.opener_image;
  if (typeof opener === "string" && opener.trim()) out.add(opener.trim());

  // Canonical paragraph images: { images: [{ src, ... }] }
  const imgs = anyNode.images;
  if (Array.isArray(imgs)) {
    for (const img of imgs) {
      if (!img || typeof img !== "object") continue;
      const src = (img as any)?.src;
      if (typeof src === "string" && src.trim()) out.add(src.trim());
    }
  }

  for (const v of Object.values(anyNode)) {
    collectImageSrcs(v, out);
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

    const expiresIn = typeof body.expiresIn === "number" && body.expiresIn > 0 ? Math.min(body.expiresIn, 60 * 60 * 24) : 3600;
    const allowMissingImages = body.allowMissingImages === true;

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

    // Fetch version paths
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("canonical_path, figures_path, design_tokens_path")
      .eq("book_id", body.bookId)
      .eq("book_version_id", body.bookVersionId)
      .single();

    if (versionErr || !version) {
      return json({ ok: false, error: { code: "not_found", message: "Book version not found" }, httpStatus: 404, requestId }, 200);
    }

    async function signed(path: string | null): Promise<{ path: string; signedUrl: string } | null> {
      if (!path) return null;
      const { data, error } = await adminSupabase.storage.from("books").createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message || `Failed to sign URL for ${path}`);
      }
      return { path, signedUrl: data.signedUrl };
    }

    async function signedOptional(path: string | null): Promise<{ path: string; signedUrl: string } | null> {
      if (!path) return null;
      const { data, error } = await adminSupabase.storage.from("books").createSignedUrl(path, expiresIn);
      if (error || !data?.signedUrl) {
        const msg = error?.message || "";
        // Optional inputs should not hard-fail when the object is simply absent.
        // Missing required assets are enforced later by the worker validation gate.
        if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("object not found")) return null;
        throw new Error(msg || `Failed to sign URL for ${path}`);
      }
      return { path, signedUrl: data.signedUrl };
    }

    const canonical = await signed(version.canonical_path);
    const figures = await signed(version.figures_path ?? null);
    const designTokens = await signed(version.design_tokens_path ?? null);
    const basePath = typeof version.canonical_path === "string"
      ? version.canonical_path.replace(/\/canonical\.json$/, "")
      : "";
    const assetsZip = await signedOptional(basePath ? `${basePath}/assets.zip` : null);

    // Optional: resolve canonical image src -> signed URL (avoid requiring assets.zip for large books).
    let imageSrcMap: Record<string, string> | null = null;
    let missingImageSrcs: string[] | null = null;
    const wantsImageMap = body.target === "chapter" || body.target === "book";
    const imageMapChapterIndex = typeof body.chapterIndex === "number" && Number.isFinite(body.chapterIndex)
      ? Math.floor(body.chapterIndex)
      : null;

    if (wantsImageMap) {
      // 1) Download canonical JSON to discover referenced images (scoped by target/chapterIndex).
      const { data: canonBlob, error: canonDlErr } = await adminSupabase.storage
        .from("books")
        .download(version.canonical_path);

      if (!canonDlErr && canonBlob) {
        let canonicalJson: any = null;
        try {
          const text = await canonBlob.text();
          canonicalJson = text ? JSON.parse(text) : null;
        } catch {
          canonicalJson = null;
        }

        // Collect referenced image src strings
        const srcs = new Set<string>();
        const scope =
          body.target === "chapter" && imageMapChapterIndex !== null
            ? (canonicalJson?.chapters?.[imageMapChapterIndex] ?? null)
            : canonicalJson;

        collectImageSrcs(scope, srcs);

        const unresolvedNeeded: string[] = [];
        const needed = Array.from(srcs)
          .map((s) => String(s || "").trim())
          .filter((s) => !!s)
          .filter((s) => !isHttpUrl(s) && !isDataUrl(s) && !isFileUrl(s));

        if (needed.length) {
          // 2) Load image library index (generated by scripts/books/upload-book-image-library.py)
          const libraryIndexPath = `library/${body.bookId}/images-index.json`;
          const { data: idxBlob, error: idxErr } = await adminSupabase.storage
            .from("books")
            .download(libraryIndexPath);

          if (idxErr || !idxBlob) {
            // If no assets.zip and canonical needs local images, fail loudly.
            if (!assetsZip) {
              if (!allowMissingImages) {
                return json({
                  ok: false,
                  error: {
                    code: "missing_image_library",
                    message:
                      `BLOCKED: Canonical references ${needed.length} image(s) but no assets.zip was found and ` +
                      `the image library index is missing at ${libraryIndexPath}. ` +
                      `Upload it (script: scripts/books/upload-book-image-library.py) or provide figures.json srcMap.`,
                  },
                  httpStatus: 409,
                  requestId,
                }, 200);
              }

              // allowMissingImages=true: try the conventional upload location
              // library/{bookId}/images/{basename} so users can fix missing images without index updates.
              imageSrcMap = imageSrcMap || {};
              const stillMissing: string[] = [];
              for (const rawSrc of needed) {
                const base = basenameLike(rawSrc);
                if (!base) {
                  stillMissing.push(rawSrc);
                  continue;
                }
                const guessPath = `library/${body.bookId}/images/${base}`;
                const { data, error } = await adminSupabase.storage.from("books").createSignedUrl(guessPath, expiresIn);
                if (error || !data?.signedUrl) {
                  stillMissing.push(rawSrc);
                  continue;
                }
                imageSrcMap[rawSrc] = data.signedUrl;
              }
              missingImageSrcs = stillMissing.length ? stillMissing : null;
            }
          } else {
            let idxJson: any = null;
            try {
              const text = await idxBlob.text();
              idxJson = text ? JSON.parse(text) : null;
            } catch {
              idxJson = null;
            }

            const idxSrcMap: Record<string, string> =
              (idxJson && typeof idxJson === "object" && (idxJson.srcMap || idxJson.src_map) && typeof (idxJson.srcMap || idxJson.src_map) === "object")
                ? (idxJson.srcMap || idxJson.src_map)
                : {};

            // Map canonical src -> storage path
            const neededPaths = new Map<string, string>(); // canonicalSrc -> storagePath
            const stemMap: Record<string, string> = {};
            for (const [k, v] of Object.entries(idxSrcMap)) {
              if (typeof v !== "string" || !v.trim()) continue;
              const stem = normalizeStemKey(k);
              if (!stem) continue;
              if (stemMap[stem] === undefined) stemMap[stem] = v;
            }
            for (const rawSrc of needed) {
              const direct = typeof idxSrcMap[rawSrc] === "string" ? idxSrcMap[rawSrc] : null;
              const byBase = (() => {
                const b = basenameLike(rawSrc);
                return b && typeof idxSrcMap[b] === "string" ? idxSrcMap[b] : null;
              })();
              const byStem = (() => {
                const stem = normalizeStemKey(rawSrc);
                return stem && typeof stemMap[stem] === "string" ? stemMap[stem] : null;
              })();
              const storagePath = (direct || byBase || byStem || "").trim();
              if (!storagePath) {
                unresolvedNeeded.push(rawSrc);
                continue;
              }
              neededPaths.set(rawSrc, storagePath);
            }

            if (unresolvedNeeded.length && !assetsZip) {
              if (!allowMissingImages) {
                return json({
                  ok: false,
                  error: {
                    code: "missing_image_mappings",
                    message:
                      `BLOCKED: Missing image mappings for ${unresolvedNeeded.length} canonical src value(s). ` +
                      `Either upload assets.zip for this bookVersion or ensure library index includes these images. ` +
                      `Missing (first 20): ${unresolvedNeeded.slice(0, 20).join(", ")}${unresolvedNeeded.length > 20 ? ", ..." : ""}`,
                  },
                  httpStatus: 409,
                  requestId,
                }, 200);
              }
            }

            imageSrcMap = imageSrcMap || {};

            // 3) Create signed URLs for needed storage paths (skip values that are already URLs).
            const uniquePaths = Array.from(new Set(Array.from(neededPaths.values()).filter((p) => !!p && !isHttpUrl(p) && !isDataUrl(p) && !isFileUrl(p))));
            const pathToSigned = new Map<string, string>();

            const bucket = adminSupabase.storage.from("books") as any;
            if (uniquePaths.length) {
              if (typeof bucket.createSignedUrls === "function") {
                const { data, error } = await bucket.createSignedUrls(uniquePaths, expiresIn);
                if (error || !Array.isArray(data)) {
                  throw new Error(error?.message || "Failed to create signed URLs for images");
                }
                for (const row of data) {
                  const p = typeof row?.path === "string" ? row.path : "";
                  const u = typeof row?.signedUrl === "string" ? row.signedUrl : "";
                  if (p && u) pathToSigned.set(p, u);
                }
              } else {
                for (const p of uniquePaths) {
                  const { data, error } = await adminSupabase.storage.from("books").createSignedUrl(p, expiresIn);
                  if (error || !data?.signedUrl) {
                    throw new Error(error?.message || `Failed to sign URL for ${p}`);
                  }
                  pathToSigned.set(p, data.signedUrl);
                }
              }
            }

            for (const [rawSrc, storagePath] of neededPaths.entries()) {
              if (isHttpUrl(storagePath) || isDataUrl(storagePath) || isFileUrl(storagePath)) {
                imageSrcMap[rawSrc] = storagePath;
                continue;
              }
              const signedUrl = pathToSigned.get(storagePath);
              if (signedUrl) imageSrcMap[rawSrc] = signedUrl;
            }
          }

          // 4) Last-chance: if still unresolved, try signing the conventional library path:
          // library/{bookId}/images/{basename}. This supports the "upload missing file by name" workflow
          // without requiring index updates.
          if (unresolvedNeeded.length) {
            imageSrcMap = imageSrcMap || {};
            const stillMissing: string[] = [];
            for (const rawSrc of unresolvedNeeded) {
              const base = basenameLike(rawSrc);
              if (!base) {
                stillMissing.push(rawSrc);
                continue;
              }
              const guessPath = `library/${body.bookId}/images/${base}`;
              const { data, error } = await adminSupabase.storage.from("books").createSignedUrl(guessPath, expiresIn);
              if (error || !data?.signedUrl) {
                stillMissing.push(rawSrc);
                continue;
              }
              imageSrcMap[rawSrc] = data.signedUrl;
            }
            missingImageSrcs = stillMissing.length ? stillMissing : null;
          }
        }
      }
    }

    let overlay: { path: string; signedUrl: string } | null = null;
    if (body.overlayId) {
      const { data: ov, error: ovErr } = await adminSupabase
        .from("book_overlays")
        .select("overlay_path")
        .eq("id", body.overlayId)
        .eq("book_id", body.bookId)
        .eq("book_version_id", body.bookVersionId)
        .single();
      if (ovErr || !ov) {
        return json({ ok: false, error: { code: "not_found", message: "Overlay not found" }, httpStatus: 404, requestId }, 200);
      }
      overlay = await signed(ov.overlay_path);
    }

    return json({
      ok: true,
      bookId: body.bookId,
      bookVersionId: body.bookVersionId,
      overlayId: body.overlayId ?? null,
      expiresIn,
      urls: {
        canonical,
        figures,
        designTokens,
        assetsZip,
        overlay,
      },
      // Optional resolved image map for renderers/workers:
      // canonical img.src (as stored) -> signed URL to the uploaded library image.
      imageSrcMap,
      // If allowMissingImages=true, this can be populated so the worker can render placeholders + a report.
      missingImageSrcs,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-version-input-urls] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


