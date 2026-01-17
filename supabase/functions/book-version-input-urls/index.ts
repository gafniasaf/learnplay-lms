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
   * If true, include signed URLs for matter-pack + generated index/glossary artifacts
   * (stored under books/{bookId}/{bookVersionId}/matter/*).
   *
   * NOTE: These are optional at the edge layer (may be null if absent). The worker
   * is responsible for failing loudly when a render requires them.
   */
  includeMatter?: boolean;
  /**
   * If true, return persisted semantic figure placements (when present) from book_versions.figure_placements.
   * This allows the worker (and Book Studio) to avoid filename-based figure->chapter inference.
   */
  includeFigurePlacements?: boolean;
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
  /**
   * If true, attempt to resolve (and sign) chapter opener images from the shared
   * image library index so the worker can render the correct opener per chapter.
   *
   * NOTE: This is especially important for canonicals that store openers in
   * non-rendered fields (e.g. chapter-level `images`) or use conventional src
   * keys like `Book_chapter_opener.jpg`.
   */
  includeChapterOpeners?: boolean;
  /**
   * If true, and the canonical appears to be "text-only" (very few embedded
   * image references), try to auto-attach per-chapter figures from the shared
   * image library by inferring chapter/figure numbers from filenames.
   *
   * This is a best-effort bridge for older exports where figures were not
   * embedded into the canonical JSON.
   */
  autoAttachLibraryImages?: boolean;
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

function stripHashPrefix(raw: string): string {
  // Many uploaded image names are prefixed like: "1b8d11d9d526__Image 2.7 ....png"
  return String(raw || "").replace(/^[0-9a-f]{8,}__+/i, "");
}
function stripExtension(raw: string): string {
  return String(raw || "").replace(/\.[a-z0-9]{2,6}$/i, "");
}
function normalizeLabel(raw: string): string {
  return stripExtension(stripHashPrefix(String(raw || "")))
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function isLikelyLogoName(raw: string): boolean {
  const s = normalizeLabel(raw).toLowerCase();
  if (!s) return true;
  if (s.includes("ec logo")) return true;
  if (s.includes("ec_logo")) return true;
  if (s === "mbologo" || s.includes("mbo logo") || s.includes("mbo_logo")) return true;
  return false;
}
function isLikelyChapterOpenerName(raw: string): boolean {
  const s = normalizeLabel(raw);
  const lower = s.toLowerCase();
  if (lower.includes("chapteropener")) return true;
  if (lower.includes("book_chapter_opener")) return true;
  if (/\b0deel\s*\d{1,3}\b/i.test(s)) return true;
  // E.g. "11. Zorg bieden" (full-page chapter opener images)
  if (/^[0-9]{1,3}\s*\.\s+\S+/.test(s)) return true;
  return false;
}
function inferOpenerChapterNumber(raw: string): number | null {
  const s = normalizeLabel(raw);
  const m1 = s.match(/\bChapterOpener\s*([0-9]{1,3})\b/i);
  if (m1?.[1]) {
    const n = Number(m1[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m2 = s.match(/\b0Deel\s*([0-9]{1,3})\b/i);
  if (m2?.[1]) {
    const n = Number(m2[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m3 = s.match(/^([0-9]{1,3})\s*\.\s+\S+/);
  if (m3?.[1]) {
    const n = Number(m3[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
function inferFigureNumber(raw: string): string | null {
  const s = normalizeLabel(raw);
  // Strong signal: "Image 2.7 ..." / "Afbeelding 4.13 ..."
  const m1 = s.match(/\b(?:Image|Afbeelding)\s*([0-9]{1,3})\s*[._]\s*([0-9]{1,3})(?:\s*-\s*([0-9]+))?/i);
  if (m1?.[1] && m1?.[2]) {
    const a = Number(m1[1]);
    const b = Number(m1[2]);
    const c = m1[3] ? Number(m1[3]) : null;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return `${a}.${b}${c !== null && Number.isFinite(c) ? `-${c}` : ""}`;
  }
  // Fallback: any "12.34" style token in the filename
  const m2 = s.match(/\b([0-9]{1,3})\s*[._]\s*([0-9]{1,3})(?:\s*-\s*([0-9]+))?\b/);
  if (m2?.[1] && m2?.[2]) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    const c = m2[3] ? Number(m2[3]) : null;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return `${a}.${b}${c !== null && Number.isFinite(c) ? `-${c}` : ""}`;
  }
  return null;
}
function inferChapterNumberFromFigureNumber(fig: string | null): number | null {
  if (!fig) return null;
  const major = String(fig).split(".")[0] || "";
  const n = Number(major);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function deriveCaption(rawName: string, figNum: string | null): string {
  const s = normalizeLabel(rawName);
  if (!s) return "";
  let out = s;
  if (figNum) {
    const safe = figNum.replace(/\./g, "\\.");
    out = out.replace(new RegExp(`\\b(?:Image|Afbeelding)\\s*${safe}\\b`, "i"), "");
  }
  out = out.replace(/^[\s\-:]+/, "").trim();
  return out;
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
    const includeMatter = body.includeMatter === true;
    const includeFigurePlacements = body.includeFigurePlacements === true;
    const includeChapterOpeners = body.includeChapterOpeners === true;
    const autoAttachLibraryImages = body.autoAttachLibraryImages === true;

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

    // Fetch version paths (including skeleton-first columns)
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("canonical_path, figures_path, design_tokens_path, figure_placements, figure_placements_updated_at, skeleton_path, compiled_canonical_path, authoring_mode, skeleton_schema_version, prompt_pack_id, prompt_pack_version")
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

    // Skeleton-first: sign skeleton and compiled canonical URLs when present
    const skeleton = await signedOptional((version as any).skeleton_path ?? null);
    const compiledCanonical = await signedOptional((version as any).compiled_canonical_path ?? null);
    const authoringMode = (version as any).authoring_mode ?? "legacy";
    const skeletonSchemaVersion = (version as any).skeleton_schema_version ?? null;
    const promptPackId = (version as any).prompt_pack_id ?? null;
    const promptPackVersion = (version as any).prompt_pack_version ?? null;

    // Matter pack + generated artifacts (optional)
    const matterBase = `books/${body.bookId}/${body.bookVersionId}/matter`;
    const matterPack = includeMatter ? await signedOptional(`${matterBase}/matter-pack.json`) : null;
    const indexGenerated = includeMatter ? await signedOptional(`${matterBase}/index.generated.json`) : null;
    const glossaryGenerated = includeMatter ? await signedOptional(`${matterBase}/glossary.generated.json`) : null;

    // Optional: resolve canonical image src -> signed URL (avoid requiring assets.zip for large books).
    let imageSrcMap: Record<string, string> | null = null;
    let missingImageSrcs: string[] | null = null;
    const wantsImageMap = body.target === "chapter" || body.target === "book";
    const imageMapChapterIndex = typeof body.chapterIndex === "number" && Number.isFinite(body.chapterIndex)
      ? Math.floor(body.chapterIndex)
      : null;

    // Extra outputs for the worker:
    // - chapterOpeners: chapterIndex -> canonical src key (resolved via imageSrcMap)
    // - autoChapterFigures: chapterIndex -> list of figure descriptors to inject when canonicals lack embedded figures
    // - figurePlacements: persisted semantic placements (src -> paragraph_id/chapter_index) when present and requested
    let chapterOpeners: Record<number, string> | null = null;
    let autoChapterFigures: Record<number, Array<{ src: string; alt?: string; caption?: string; figureNumber?: string }>> | null = null;
    let figurePlacements: any = null;

    if (wantsImageMap) {
      // 1) Download canonical JSON to discover referenced images (scoped by target/chapterIndex).
      // Skeleton-first: prefer compiled canonical when present so image signing reflects the skeleton source of truth.
      const canonicalPathForDiscovery =
        authoringMode === "skeleton" && typeof (version as any).compiled_canonical_path === "string" && (version as any).compiled_canonical_path.trim()
          ? (version as any).compiled_canonical_path.trim()
          : version.canonical_path;

      const { data: canonBlob, error: canonDlErr } = await adminSupabase.storage
        .from("books")
        .download(canonicalPathForDiscovery);

      if (!canonDlErr && canonBlob) {
        let canonicalJson: any = null;
        try {
          const text = await canonBlob.text();
          canonicalJson = text ? JSON.parse(text) : null;
        } catch {
          canonicalJson = null;
        }
        if (!canonicalJson || typeof canonicalJson !== "object") {
          return json({
            ok: false,
            error: { code: "invalid_canonical", message: "BLOCKED: canonical.json could not be parsed" },
            httpStatus: 409,
            requestId,
          }, 200);
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

        // Load the shared image library index if:
        // - canonical references local images, OR
        // - caller requests chapter openers, OR
        // - caller requests auto-attach of figures for text-only canonicals.
        const wantsLibraryIndex = needed.length > 0 || includeChapterOpeners || autoAttachLibraryImages;
        const libraryIndexPath = `library/${body.bookId}/images-index.json`;
        let idxBlob: Blob | null = null;
        let idxErr: any = null;
        let idxJson: any = null;
        let idxSrcMap: Record<string, string> = {};

        if (wantsLibraryIndex) {
          const dl = await adminSupabase.storage.from("books").download(libraryIndexPath);
          idxBlob = dl.data ?? null;
          idxErr = dl.error ?? null;
          if (idxErr || !idxBlob) {
            // If no assets.zip and we need library-based resolution, fail loudly unless allowMissingImages=true.
            if (!assetsZip) {
              if (!allowMissingImages) {
                return json({
                  ok: false,
                  error: {
                    code: "missing_image_library",
                    message:
                      `BLOCKED: Image library index is missing at ${libraryIndexPath}. ` +
                      `Upload it (script: scripts/books/upload-book-image-library.py) or provide assets.zip for this bookVersion.`,
                  },
                  httpStatus: 409,
                  requestId,
                }, 200);
              }
            }
          } else {
            try {
              const text = await idxBlob.text();
              idxJson = text ? JSON.parse(text) : null;
            } catch {
              idxJson = null;
            }
            idxSrcMap =
              (idxJson && typeof idxJson === "object" && (idxJson.srcMap || idxJson.src_map) && typeof (idxJson.srcMap || idxJson.src_map) === "object")
                ? (idxJson.srcMap || idxJson.src_map)
                : {};
          }
        }

        // Derive chapter openers + (optional) auto figures from the library index.
        // IMPORTANT: We only ever choose images from THIS book's library index.
        const chaptersAll = Array.isArray(canonicalJson?.chapters) ? canonicalJson.chapters : [];
        const selectedChapterIndices =
          body.target === "chapter" && imageMapChapterIndex !== null
            ? [imageMapChapterIndex]
            : chaptersAll.map((_: unknown, i: number) => i);

        const extraNeeded = new Set<string>();

        // Optional: include persisted semantic placements.
        // When present, this becomes the source of truth for which figures belong in which chapter.
        if (includeFigurePlacements && version && typeof (version as any).figure_placements === "object" && (version as any).figure_placements) {
          const raw = (version as any).figure_placements;
          const placementsObj = raw?.placements;
          if (placementsObj && typeof placementsObj === "object") {
            // Filter returned placements by target scope to keep payloads small.
            const filtered: Record<string, any> = {};
            for (const [src, meta] of Object.entries(placementsObj as Record<string, any>)) {
              const s = typeof src === "string" ? src.trim() : "";
              if (!s) continue;
              // Filter by requested scope to avoid signing the full library on chapter renders.
              if (body.target === "chapter" && imageMapChapterIndex !== null) {
                const chIdx = typeof (meta as any)?.chapter_index === "number" ? (meta as any).chapter_index : null;
                if (chIdx !== imageMapChapterIndex) continue;
              }
              extraNeeded.add(s);
              filtered[s] = meta;
            }

            figurePlacements = {
              ...raw,
              placements: filtered,
              // Keep the original updatedAt if present; do not rewrite semantics here.
              scope: body.target === "chapter" && imageMapChapterIndex !== null
                ? { target: "chapter", chapterIndex: imageMapChapterIndex }
                : { target: "book" },
            };
          } else {
            // Keep null when shape is invalid.
            figurePlacements = null;
          }
        }

        if (includeChapterOpeners && idxJson && typeof idxJson === "object") {
          const originals = Array.isArray(idxJson.entries)
            ? idxJson.entries
              .map((e: any) => (e && typeof e.originalName === "string" ? e.originalName.trim() : ""))
              .filter((s: string) => !!s)
            : Object.keys(idxSrcMap).filter((k) => typeof k === "string" && !k.includes("/") && !!k.trim());

          let genericOpener: string | null = null;
          const byChapter = new Map<number, string[]>();
          for (const name of originals) {
            const clean = normalizeLabel(name);
            const lower = clean.toLowerCase();
            if (lower.includes("book_chapter_opener") && !genericOpener) {
              genericOpener = name;
            }
            if (!isLikelyChapterOpenerName(name)) continue;
            const chNum = inferOpenerChapterNumber(name);
            if (!chNum) continue;
            const list = byChapter.get(chNum) || [];
            list.push(name);
            byChapter.set(chNum, list);
          }

          const pickBest = (candidates: string[]): string => {
            const scored = candidates
              .map((n) => {
                const c = normalizeLabel(n).toLowerCase();
                const rank = c.includes("chapteropener") ? 3 : (/\b0deel\s*\d+\b/i.test(c) ? 2 : (/^[0-9]{1,3}\s*\.\s+/.test(c) ? 1 : 0));
                return { n, rank, len: c.length };
              })
              .sort((a, b) => (b.rank - a.rank) || (a.len - b.len) || a.n.localeCompare(b.n));
            return scored[0]?.n || candidates[0]!;
          };

          chapterOpeners = {};
          for (const idx of selectedChapterIndices) {
            const rawNum = String(chaptersAll?.[idx]?.number || "").trim();
            const n = rawNum && /^\d+$/.test(rawNum) ? Number(rawNum) : null;
            const candidates = n !== null ? (byChapter.get(n) || []) : [];
            const chosen = candidates.length ? pickBest(candidates) : (genericOpener || null);
            if (chosen) {
              chapterOpeners[idx] = chosen;
              extraNeeded.add(chosen);
            }
          }
        }

        if (autoAttachLibraryImages && idxJson && typeof idxJson === "object") {
          // Heuristic guard: only run when the canonical is near-empty of embedded images.
          // (Avoid duplicating figures for image-rich canonicals.)
          const canonicalImageCount = needed.length;
          if (canonicalImageCount <= 3) {
            const originals = Array.isArray(idxJson.entries)
              ? idxJson.entries
                .map((e: any) => (e && typeof e.originalName === "string" ? e.originalName.trim() : ""))
                .filter((s: string) => !!s)
              : Object.keys(idxSrcMap).filter((k) => typeof k === "string" && !k.includes("/") && !!k.trim());

            const byChapter = new Map<number, Array<{ src: string; alt?: string; caption?: string; figureNumber?: string }>>();
            for (const name of originals) {
              if (isLikelyLogoName(name)) continue;
              if (isLikelyChapterOpenerName(name)) continue;
              const figNum = inferFigureNumber(name);
              const chNum = inferChapterNumberFromFigureNumber(figNum);
              if (!figNum || !chNum) continue;
              const caption = deriveCaption(name, figNum);
              const alt = caption || (figNum ? `Afbeelding ${figNum}` : "");
              const list = byChapter.get(chNum) || [];
              list.push({ src: name, figureNumber: figNum, caption, alt });
              byChapter.set(chNum, list);
            }

            autoChapterFigures = {};
            for (const idx of selectedChapterIndices) {
              const rawNum = String(chaptersAll?.[idx]?.number || "").trim();
              const n = rawNum && /^\d+$/.test(rawNum) ? Number(rawNum) : null;
              if (n === null) continue;
              const figs = byChapter.get(n) || [];
              if (!figs.length) continue;
              // Deterministic order: by figureNumber then caption
              figs.sort((a, b) => {
                const an = String(a.figureNumber || "");
                const bn = String(b.figureNumber || "");
                if (an !== bn) return an.localeCompare(bn, "en", { numeric: true });
                return String(a.caption || "").localeCompare(String(b.caption || ""));
              });
              autoChapterFigures[idx] = figs;
              for (const f of figs) {
                if (f?.src) extraNeeded.add(f.src);
              }
            }
          }
        }

        const neededAll = Array.from(new Set([...needed, ...Array.from(extraNeeded)]));

        if (neededAll.length) {
          // 2) Load image library index (generated by scripts/books/upload-book-image-library.py)
          const { data: idxBlob2, error: idxErr2 } = wantsLibraryIndex
            ? { data: idxBlob, error: idxErr }
            : await adminSupabase.storage.from("books").download(libraryIndexPath);

          if (idxErr2 || !idxBlob2) {
            // If no assets.zip and canonical needs local images, fail loudly.
            if (!assetsZip) {
              if (!allowMissingImages) {
                return json({
                  ok: false,
                  error: {
                    code: "missing_image_library",
                    message:
                      `BLOCKED: Canonical references ${needed.length} image(s) (plus library-derived openers/figures) but no assets.zip was found and ` +
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
              for (const rawSrc of neededAll) {
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
            // idxJson/idxSrcMap were parsed above when wantsLibraryIndex=true, but keep a fallback for safety.
            if (!idxJson || typeof idxJson !== "object" || !idxSrcMap || typeof idxSrcMap !== "object") {
              try {
                const text = await idxBlob2.text();
                idxJson = text ? JSON.parse(text) : null;
              } catch {
                idxJson = null;
              }
              idxSrcMap =
                (idxJson && typeof idxJson === "object" && (idxJson.srcMap || idxJson.src_map) && typeof (idxJson.srcMap || idxJson.src_map) === "object")
                  ? (idxJson.srcMap || idxJson.src_map)
                  : {};
            }

            // Map canonical src -> storage path
            const neededPaths = new Map<string, string>(); // canonicalSrc -> storagePath
            const stemMap: Record<string, string> = {};
            for (const [k, v] of Object.entries(idxSrcMap)) {
              if (typeof v !== "string" || !v.trim()) continue;
              const stem = normalizeStemKey(k);
              if (!stem) continue;
              if (stemMap[stem] === undefined) stemMap[stem] = v;
            }
            for (const rawSrc of neededAll) {
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
        // Skeleton-first: when authoringMode='skeleton', these contain the primary source of truth
        skeleton,
        compiledCanonical,
        // Matter pack + generated artifacts (optional)
        matterPack,
        indexGenerated,
        glossaryGenerated,
      },
      // Skeleton-first metadata
      authoringMode,
      skeletonSchemaVersion,
      promptPackId,
      promptPackVersion,
      // Optional resolved image map for renderers/workers:
      // canonical img.src (as stored) -> signed URL to the uploaded library image.
      imageSrcMap,
      // Optional persisted placements (when requested).
      figurePlacements,
      // Optional chapter opener mapping (chapterIndex -> canonical src key).
      // Workers can pass this into the renderer to ensure openers are from the correct book library.
      chapterOpeners,
      // Optional inferred per-chapter figures (chapterIndex -> array of figure descriptors).
      // When present, workers may inject these as figure blocks for "text-only" canonicals.
      autoChapterFigures,
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


