import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { cn } from "@/lib/utils";
import { ActionCornerButtons } from "@/components/admin/wysiwyg/ActionCornerButtons";
import { applyRewritesOverlay, renderBookHtml, sanitizeInlineBookHtml } from "@/lib/books/bookRendererCore.js";

type OverlayJsonV1 = {
  paragraphs: Array<{ paragraph_id: string; rewritten: string }>;
};

type CanonicalImage = {
  src: string;
  alt?: string | null;
  caption?: string | null;
  figureNumber?: string | null;
};

type CanonicalParagraph = {
  id: string;
  basis: string;
  chapterIndex: number;
  chapterTitle: string;
  sectionTitle: string;
  microTitle?: string | null;
  images: CanonicalImage[];
};

type BookVersionInputUrlsResponse =
  | {
      ok: true;
      bookId: string;
      bookVersionId: string;
      overlayId: string | null;
      urls: {
        canonical: { path: string; signedUrl: string } | null;
        overlay: { path: string; signedUrl: string } | null;
        figures: { path: string; signedUrl: string } | null;
        designTokens: { path: string; signedUrl: string } | null;
        assetsZip: { path: string; signedUrl: string } | null;
        // Skeleton-first URLs (when authoringMode='skeleton')
        skeleton?: { path: string; signedUrl: string } | null;
        compiledCanonical?: { path: string; signedUrl: string } | null;
      };
      // Skeleton-first metadata
      authoringMode?: "legacy" | "skeleton";
      skeletonSchemaVersion?: string | null;
      promptPackId?: string | null;
      promptPackVersion?: number | null;
      imageSrcMap?: Record<string, string> | null;
      missingImageSrcs?: string[] | null;
      chapterOpeners?: Record<string, string> | null;
    }
  | { ok: false; error: any; httpStatus?: number };

type BookLibraryImageUrlResponse =
  | {
      ok: true;
      bookId: string;
      urls: Record<string, { storagePath: string; signedUrl: string }>;
      missing: string[];
      expiresIn: number;
    }
  | { ok: false; error: any; httpStatus?: number };

const COVER_CANONICAL_SRC = "__book_cover__";

type PreviewToParentMessage =
  | { type: "bookPreview.selectParagraph"; paragraphId: string }
  | { type: "bookPreview.ready" };

type ParentToPreviewMessage =
  | { type: "bookPreview.setSelectedParagraph"; paragraphId: string | null }
  | { type: "bookPreview.scrollToId"; id: string };

function injectPreviewBridge(html: string): string {
  // Add a tiny selection/highlight bridge without changing book HTML/CSS structure.
  const style = `
<style>
  .book-preview-selected {
    outline: 2px solid rgba(245, 158, 11, 0.9);
    outline-offset: 2px;
    background: rgba(245, 158, 11, 0.08);
  }
</style>
  `.trim();

  const script = `
<script>
(function(){
  function closestParagraphEl(node){
    var el = node;
    while (el && el !== document.documentElement) {
      if (el.dataset && el.dataset.paragraphId) return el;
      el = el.parentElement;
    }
    return null;
  }

  function clearSelected(){
    var prev = document.querySelectorAll('.book-preview-selected');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('book-preview-selected');
  }

  function selectParagraphById(pid){
    clearSelected();
    if (!pid) return;
    // Avoid dynamic selector escaping issues by scanning annotated nodes (fast enough for chapter scopes).
    var els = document.querySelectorAll('[data-paragraph-id]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el && el.dataset && el.dataset.paragraphId === pid) {
        el.classList.add('book-preview-selected');
        break;
      }
    }
  }

  document.addEventListener('click', function(ev){
    var target = ev && ev.target ? ev.target : null;
    var el = closestParagraphEl(target);
    if (!el) return;
    var pid = el.dataset.paragraphId;
    if (!pid) return;
    try { window.parent.postMessage({ type: 'bookPreview.selectParagraph', paragraphId: pid }, '*'); } catch (e) {}
  }, true);

  window.addEventListener('message', function(ev){
    var data = ev && ev.data ? ev.data : null;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'bookPreview.setSelectedParagraph') {
      selectParagraphById(data.paragraphId || '');
      return;
    }
    if (data.type === 'bookPreview.scrollToId' && data.id) {
      var el = document.getElementById(String(data.id));
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  });

  try { window.parent.postMessage({ type: 'bookPreview.ready' }, '*'); } catch (e) {}
})();
</script>
  `.trim();

  let out = String(html || "");
  if (out.includes("</head>")) out = out.replace("</head>", `${style}\n</head>`);
  if (out.includes("</body>")) out = out.replace("</body>", `${script}\n</body>`);
  return out;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function describeUiError(e: unknown): string {
  // Prefer real Error messages, but also surface structured ApiError-ish metadata when present.
  if (e instanceof Error) {
    const anyE = e as any;
    const code = typeof anyE?.code === "string" ? anyE.code : "";
    const status = typeof anyE?.status === "number" ? anyE.status : null;
    const requestId = typeof anyE?.requestId === "string" ? anyE.requestId : "";
    const parts = [];
    if (code) parts.push(code);
    if (typeof status === "number") parts.push(String(status));
    if (requestId) parts.push(`req ${requestId.slice(0, 8)}`);
    const suffix = parts.length ? ` (${parts.join(" · ")})` : "";
    return `${e.message || "Unknown error"}${suffix}`;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

function stripHtml(s: string): string {
  return String(s || "").replace(/<[^>]*>/g, "");
}

function collectCanonicalParagraphsForChapter(canonical: any, onlyChapterIndex: number): CanonicalParagraph[] {
  const out: CanonicalParagraph[] = [];
  const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
  const chapter = chapters?.[onlyChapterIndex];
  if (!chapter) return out;

  const chapterTitle =
    (typeof chapter?.title === "string" && chapter.title) ||
    (typeof chapter?.meta?.title === "string" && chapter.meta.title) ||
    `Chapter ${onlyChapterIndex + 1}`;

  const sections = Array.isArray(chapter?.sections) ? chapter.sections : [];

  const walkBlocks = (blocks: any, ctx: { sectionTitle: string; microTitle?: string | null }) => {
    if (!blocks) return;
    if (Array.isArray(blocks)) {
      for (const b of blocks) walkBlocks(b, ctx);
      return;
    }
    if (typeof blocks !== "object") return;

    const t = typeof blocks.type === "string" ? blocks.type : "";
    if (t === "paragraph") {
      const id = typeof blocks.id === "string" ? blocks.id : "";
      const basis = typeof blocks.basis === "string" ? blocks.basis : "";
      const images: CanonicalImage[] = Array.isArray(blocks.images)
        ? blocks.images
            .map((img: any) => {
              const src = typeof img?.src === "string" ? img.src.trim() : "";
              if (!src) return null;
              return {
                src,
                alt: typeof img?.alt === "string" ? img.alt : null,
                caption: typeof img?.caption === "string" ? img.caption : null,
                figureNumber: typeof img?.figureNumber === "string" ? img.figureNumber : null,
              } as CanonicalImage;
            })
            .filter(Boolean)
        : [];

      if (id && basis) {
        out.push({
          id,
          basis,
          chapterIndex: onlyChapterIndex,
          chapterTitle,
          sectionTitle: ctx.sectionTitle,
          microTitle: ctx.microTitle ?? null,
          images,
        });
      }
      return;
    }

    if (t === "subparagraph") {
      const title = typeof blocks.title === "string" ? blocks.title : null;
      walkBlocks(blocks.content, { ...ctx, microTitle: title });
      return;
    }

    // Fallback: descend into likely content fields
    if (Array.isArray((blocks as any).content)) walkBlocks((blocks as any).content, ctx);
    if (Array.isArray((blocks as any).blocks)) walkBlocks((blocks as any).blocks, ctx);
    if (Array.isArray((blocks as any).items)) walkBlocks((blocks as any).items, ctx);
  };

  if (sections.length > 0) {
    for (const s of sections) {
      const sectionTitle =
        (typeof s?.title === "string" && s.title) ||
        (typeof s?.meta?.title === "string" && s.meta.title) ||
        "Section";
      walkBlocks(s?.content ?? s?.blocks ?? s?.items, { sectionTitle, microTitle: null });
    }
  } else {
    walkBlocks(chapter?.content ?? chapter?.blocks ?? chapter?.items, { sectionTitle: "Chapter", microTitle: null });
  }

  return out;
}

function splitIntoPages<T>(items: T[], perPage: number): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, Math.floor(perPage));
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n));
  }
  return out;
}

function extractBookCssVarsFromDesignTokens(tokens: any): Record<string, string> {
  if (!tokens || typeof tokens !== "object") return {};

  // Preferred: tokens.cssVars / css_vars / vars already in CSS var format.
  const candidate = (tokens as any).cssVars || (tokens as any).css_vars || (tokens as any).vars;
  if (candidate && typeof candidate === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(candidate as Record<string, unknown>)) {
      if (!k.startsWith("--")) continue;
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
      if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
    }
    return out;
  }

  // Fallback: attempt to interpret common page/margin shapes if present.
  const out: Record<string, string> = {};
  const page = (tokens as any).page || (tokens as any).pageSize || (tokens as any).paper;
  const mm = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? `${n}mm` : "");
  if (page && typeof page === "object") {
    const w = mm((page as any).widthMm ?? (page as any).width_mm ?? (page as any).width);
    const h = mm((page as any).heightMm ?? (page as any).height_mm ?? (page as any).height);
    if (w) out["--page-width"] = w;
    if (h) out["--page-height"] = h;
  }
  const margins = (tokens as any).margins || (tokens as any).margin;
  if (margins && typeof margins === "object") {
    const top = mm((margins as any).topMm ?? (margins as any).top_mm ?? (margins as any).top);
    const bottom = mm((margins as any).bottomMm ?? (margins as any).bottom_mm ?? (margins as any).bottom);
    const inner = mm((margins as any).innerMm ?? (margins as any).inner_mm ?? (margins as any).inner);
    const outer = mm((margins as any).outerMm ?? (margins as any).outer_mm ?? (margins as any).outer);
    if (top) out["--margin-top"] = top;
    if (bottom) out["--margin-bottom"] = bottom;
    if (inner) out["--margin-inner"] = inner;
    if (outer) out["--margin-outer"] = outer;
  }
  return out;
}

function BookInlineEditable({
  html,
  onChangeHtml,
  className,
  dataCtaId,
  ariaLabel,
}: {
  html: string;
  onChangeHtml: (nextHtml: string) => void;
  className?: string;
  dataCtaId: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focused) return;
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [html, focused]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    onChangeHtml(el.innerHTML);
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={cn(className)}
      onInput={emit}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const el = ref.current;
        if (!el) return;
        const cleaned = sanitizeInlineBookHtml(el.innerHTML || "");
        if (cleaned !== el.innerHTML) el.innerHTML = cleaned;
        onChangeHtml(cleaned);
      }}
      data-cta-id={dataCtaId}
      data-action="edit"
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
    />
  );
}

export default function BookStudioChapterEditor() {
  const { bookId, chapterIndex } = useParams<{ bookId: string; chapterIndex: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mcp = useMCP();
  const { toast } = useToast();
  const { user, role, loading: authLoading } = useAuth();

  const devAgent = isDevAgentMode();
  const devOverrideRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const isAdmin =
    devAgent ||
    role === "admin" ||
    devOverrideRole === "admin" ||
    user?.app_metadata?.role === "admin" ||
    user?.user_metadata?.role === "admin";

  const chapterIdx = useMemo(() => {
    const n = Number(chapterIndex);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }, [chapterIndex]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusyIds, setAiBusyIds] = useState<Set<string>>(new Set());
  const [imageBusySrcs, setImageBusySrcs] = useState<Set<string>>(new Set());

  const [zoom, setZoom] = useState<number>(100);
  const [viewMode, setViewMode] = useState<"edit" | "proof">("edit");
  const [proofPdfUrl, setProofPdfUrl] = useState<string>("");
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string>("");
  const [proofRunId, setProofRunId] = useState<string>("");
  const proofPollTokenRef = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [selectedParagraphId, setSelectedParagraphId] = useState<string>("");
  const [inspectorHtml, setInspectorHtml] = useState<string>("");
  const [inspectorFocused, setInspectorFocused] = useState(false);
  const [bookVersionId, setBookVersionId] = useState<string>(safeStr(searchParams.get("bookVersionId")));
  const [overlayId, setOverlayId] = useState<string>(safeStr(searchParams.get("overlayId")));

  const [canonical, setCanonical] = useState<any>(null);
  const [designTokens, setDesignTokens] = useState<any>(null);
  const [imageSrcMap, setImageSrcMap] = useState<Record<string, string> | null>(null);
  const [missingImageSrcs, setMissingImageSrcs] = useState<string[] | null>(null);
  const [chapterOpeners, setChapterOpeners] = useState<Record<string, string> | null>(null);

  // Skeleton-first state
  const [skeleton, setSkeleton] = useState<any>(null);
  const [authoringMode, setAuthoringMode] = useState<"legacy" | "skeleton">("legacy");
  const [draftSkeleton, setDraftSkeleton] = useState<any>(null);
  const [skeletonDirty, setSkeletonDirty] = useState(false);

  // Per-stage model selection (for skeleton-first pipeline)
  const [skeletonModel, setSkeletonModel] = useState<string>("gpt-4o-mini");
  const [validateModel, setValidateModel] = useState<string>("gpt-4o-mini");
  const [writeModel, setWriteModel] = useState<string>("claude-sonnet-4-5-20250929");
  const [passesModel, setPassesModel] = useState<string>("claude-sonnet-4-5-20250929");
  const [userInstructions, setUserInstructions] = useState<string>("");

  // loadedRewrites/draftRewrites store ONLY non-empty rewrites.
  const [loadedRewrites, setLoadedRewrites] = useState<Record<string, string>>({});
  const [draftRewrites, setDraftRewrites] = useState<Record<string, string>>({});
  const [previewRewrites, setPreviewRewrites] = useState<Record<string, string>>({});

  const [paragraphs, setParagraphs] = useState<CanonicalParagraph[]>([]);
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const dirtyCount = useMemo(() => {
    const ids = new Set<string>([...Object.keys(loadedRewrites), ...Object.keys(draftRewrites)]);
    let n = 0;
    for (const id of ids) {
      const a = (loadedRewrites[id] || "").trim();
      const b = (draftRewrites[id] || "").trim();
      if (a !== b) n += 1;
    }
    return n;
  }, [loadedRewrites, draftRewrites]);

  // Keep URL query params in sync
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (bookVersionId) next.set("bookVersionId", bookVersionId);
    else next.delete("bookVersionId");
    if (overlayId) next.set("overlayId", overlayId);
    else next.delete("overlayId");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookVersionId, overlayId]);

  const resolveBookVersionAndOverlay = useCallback(async () => {
    if (!bookId) throw new Error("Missing bookId");
    if (chapterIdx === null) throw new Error("Invalid chapterIndex");

    // Always validate query-param selections against the current DB state.
    // This avoids stale deep-links after resets/purges (common in admin workflows).
    const v = await mcp.callGet("lms.bookList", { scope: "versions", bookId, limit: "200", offset: "0" });
    if (!(v as any)?.ok) throw new Error((v as any)?.error?.message || "Failed to load versions");
    const versions = Array.isArray((v as any)?.versions) ? ((v as any).versions as any[]) : [];
    const pickFirstVersionId = () => safeStr(versions?.[0]?.book_version_id);

    let resolvedBookVersionId = safeStr(bookVersionId).trim();
    if (!resolvedBookVersionId) {
      resolvedBookVersionId = pickFirstVersionId();
      if (!resolvedBookVersionId) throw new Error("No versions found for book");
      setBookVersionId(resolvedBookVersionId);
    } else {
      const exists = versions.some((row) => safeStr(row?.book_version_id) === resolvedBookVersionId);
      if (!exists) {
        // Stale URL: reset to newest.
        resolvedBookVersionId = pickFirstVersionId();
        if (!resolvedBookVersionId) throw new Error("No versions found for book");
        setBookVersionId(resolvedBookVersionId);
        // Overlays are version-scoped; clear any stale overlay param too.
        if (overlayId) setOverlayId("");
      }
    }

    let resolvedOverlayId = overlayId;

    // Fetch overlays and validate the requested one (if any).
    const list = await mcp.callGet("lms.bookList", {
      scope: "overlays",
      bookId,
      bookVersionId: resolvedBookVersionId,
      limit: "200",
      offset: "0",
    });
    if (!(list as any)?.ok) throw new Error((list as any)?.error?.message || "Failed to load overlays");
    const overlays = Array.isArray((list as any)?.overlays) ? ((list as any).overlays as any[]) : [];

    if (resolvedOverlayId) {
      const exists = overlays.some((o) => safeStr(o?.id) === safeStr(resolvedOverlayId));
      if (!exists) {
        // Stale URL: clear and continue (we'll pick/create below).
        resolvedOverlayId = "";
        setOverlayId("");
      }
    }

    if (!resolvedOverlayId) {
      const preferred = overlays.find((o) => String(o?.label || "").trim().toLowerCase() === "book studio") || overlays[0] || null;
      if (preferred?.id) {
        resolvedOverlayId = String(preferred.id);
        setOverlayId(resolvedOverlayId);
      } else {
        const created = await mcp.call("lms.bookCreateOverlay", { bookId, bookVersionId: resolvedBookVersionId, label: "Book Studio" });
        if (!(created as any)?.ok) throw new Error((created as any)?.error?.message || "Create overlay failed");
        resolvedOverlayId = safeStr((created as any)?.overlayId);
        if (!resolvedOverlayId) throw new Error("Create overlay returned no overlayId");
        setOverlayId(resolvedOverlayId);
      }
    }

    return { bookVersionId: resolvedBookVersionId, overlayId: resolvedOverlayId, chapterIndex: chapterIdx };
  }, [bookId, chapterIdx, bookVersionId, overlayId, mcp]);

  const load = useCallback(async () => {
    if (!bookId) return;
    if (chapterIdx === null) return;

    setLoading(true);
    try {
      const resolved = await resolveBookVersionAndOverlay();
      const res = (await mcp.call("lms.bookVersionInputUrls", {
        bookId,
        bookVersionId: resolved.bookVersionId,
        overlayId: resolved.overlayId,
        target: "chapter",
        chapterIndex: resolved.chapterIndex,
        allowMissingImages: true,
        expiresIn: 3600,
        includeChapterOpeners: true,
      })) as BookVersionInputUrlsResponse;
      if (res.ok !== true) throw new Error((res as any)?.error?.message || "Failed to fetch signed URLs");

      const resAuthoringMode = (res as any)?.authoringMode || "legacy";
      const canonicalUrl =
        resAuthoringMode === "skeleton" && res.urls.compiledCanonical?.signedUrl
          ? res.urls.compiledCanonical.signedUrl
          : res.urls.canonical?.signedUrl;
      const overlayUrl = res.urls.overlay?.signedUrl;
      if (!canonicalUrl) throw new Error("Missing canonical signed URL");
      if (!overlayUrl) throw new Error("Missing overlay signed URL");

      const [canonicalJson, overlayJson, tokensJson, coverRes] = await Promise.all([
        fetch(canonicalUrl).then(async (r) => {
          if (!r.ok) throw new Error(`Canonical download failed (${r.status})`);
          return await r.json();
        }),
        fetch(overlayUrl).then(async (r) => {
          if (!r.ok) throw new Error(`Overlay download failed (${r.status})`);
          return await r.json();
        }),
        res.urls.designTokens?.signedUrl
          ? fetch(res.urls.designTokens.signedUrl).then(async (r) => {
              if (!r.ok) throw new Error(`design_tokens.json download failed (${r.status})`);
              return await r.json();
            })
          : Promise.resolve(null),
        mcp.call("lms.bookLibraryImageUrl", {
          bookId,
          canonicalSrcs: [COVER_CANONICAL_SRC],
          expiresIn: 3600,
        }) as Promise<BookLibraryImageUrlResponse>,
      ]);

      const chapterParas = collectCanonicalParagraphsForChapter(canonicalJson, chapterIdx);
      const overlay = (overlayJson || { paragraphs: [] }) as OverlayJsonV1;

      const loaded: Record<string, string> = {};
      for (const p of overlay.paragraphs || []) {
        const pid = typeof p?.paragraph_id === "string" ? p.paragraph_id : "";
        const rewritten = typeof p?.rewritten === "string" ? sanitizeInlineBookHtml(p.rewritten) : "";
        if (pid && rewritten.trim()) loaded[pid] = rewritten;
      }

      setCanonical(canonicalJson);
      setDesignTokens(tokensJson);

      // Skeleton-first: load skeleton when available
      setAuthoringMode(resAuthoringMode);
      if (resAuthoringMode === "skeleton" && res.urls.skeleton?.signedUrl) {
        try {
          const skeletonJson = await fetch(res.urls.skeleton.signedUrl).then(async (r) => {
            if (!r.ok) throw new Error(`Skeleton download failed (${r.status})`);
            return await r.json();
          });
          setSkeleton(skeletonJson);
          setDraftSkeleton(skeletonJson);
          setSkeletonDirty(false);
          console.log("[BookStudioChapterEditor] Loaded skeleton (skeleton-first mode)");
        } catch (skErr) {
          console.warn("[BookStudioChapterEditor] Failed to load skeleton:", skErr);
          setSkeleton(null);
          setDraftSkeleton(null);
        }
      } else {
        setSkeleton(null);
        setDraftSkeleton(null);
      }

      // Merge the chapter-scoped imageSrcMap with cover (book-scoped via library index).
      const baseMap = ((res as any)?.imageSrcMap || null) as Record<string, string> | null;
      const merged: Record<string, string> = { ...(baseMap || {}) };
      if (coverRes && typeof coverRes === "object" && (coverRes as any).ok === true) {
        const coverUrl = safeStr((coverRes as any)?.urls?.[COVER_CANONICAL_SRC]?.signedUrl);
        if (coverUrl) merged[COVER_CANONICAL_SRC] = coverUrl;
      } else if (coverRes && typeof coverRes === "object" && (coverRes as any).ok === false) {
        // Non-blocking: cover preview is optional for chapter editing, but surface the failure.
        const msg = safeStr((coverRes as any)?.error?.message) || "Cover lookup failed";
        toast({ title: "Cover unavailable", description: msg, variant: "destructive" });
      }
      setImageSrcMap(Object.keys(merged).length > 0 ? merged : null);
      setMissingImageSrcs(Array.isArray((res as any)?.missingImageSrcs) ? ((res as any).missingImageSrcs as string[]) : null);
      setChapterOpeners(
        (res as any)?.chapterOpeners && typeof (res as any).chapterOpeners === "object" ? ((res as any).chapterOpeners as Record<string, string>) : null
      );
      setParagraphs(chapterParas);
      setLoadedRewrites(loaded);
      setDraftRewrites(loaded);
      setPreviewRewrites(loaded);
    } catch (e) {
      toast({
        title: "Failed to load chapter",
        description: describeUiError(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, chapterIdx, resolveBookVersionAndOverlay, mcp, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void load();
  }, [authLoading, isAdmin, navigate, load]);

  // Listen for selection events from the preview iframe.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const frameWin = iframeRef.current?.contentWindow;
      if (!frameWin) return;
      if (e.source !== frameWin) return;
      const data = e.data as PreviewToParentMessage;
      if (!data || typeof data !== "object") return;
      if (data.type === "bookPreview.selectParagraph" && typeof (data as any).paragraphId === "string") {
        setSelectedParagraphId(String((data as any).paragraphId));
        return;
      }
      if (data.type === "bookPreview.ready") {
        setPreviewReady(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const postToPreview = useCallback((msg: ParentToPreviewMessage) => {
    const frameWin = iframeRef.current?.contentWindow;
    if (!frameWin) return;
    try {
      frameWin.postMessage(msg, "*");
    } catch {
      // ignore
    }
  }, []);

  const chapterTitle = useMemo(() => {
    if (chapterIdx === null) return "";
    const ch = Array.isArray(canonical?.chapters) ? canonical.chapters[chapterIdx] : null;
    return (
      (typeof ch?.title === "string" && ch.title) ||
      (typeof ch?.meta?.title === "string" && ch.meta.title) ||
      `Chapter ${chapterIdx + 1}`
    );
  }, [canonical, chapterIdx]);

  const navEntries = useMemo(() => {
    if (chapterIdx === null) return [] as Array<{ label: string; anchorId: string }>;
    const ch = Array.isArray(canonical?.chapters) ? canonical.chapters[chapterIdx] : null;
    const sections = Array.isArray((ch as any)?.sections) ? ((ch as any).sections as any[]) : [];
    const out: Array<{ label: string; anchorId: string }> = [];

    // Chapter start (title/opener)
    out.push({ label: "Chapter opener", anchorId: `ch-${chapterIdx + 1}` });

    // Section anchors match bookRendererCore: secId = section.id OR `${chapterIdx+1}.${sectionIndex+1}`
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const rawTitle = typeof s?.title === "string" ? s.title : (typeof s?.meta?.title === "string" ? s.meta.title : "");
      const secId = typeof s?.id === "string" && s.id.trim() ? s.id.trim() : `${chapterIdx + 1}.${i + 1}`;
      const label = rawTitle && rawTitle.trim() ? rawTitle.trim() : `Section ${secId} (missing title)`;
      out.push({ label, anchorId: `sec-${secId}` });
    }

    return out;
  }, [canonical, chapterIdx]);

  const selectedParagraph = useMemo(() => {
    if (!selectedParagraphId) return null;
    return paragraphs.find((p) => p.id === selectedParagraphId) || null;
  }, [paragraphs, selectedParagraphId]);

  // Keep inspector text in sync when selection changes or when draft updates externally (AI / discard),
  // but never clobber while the user is actively editing the textarea.
  useEffect(() => {
    if (inspectorFocused) return;
    if (!selectedParagraphId) {
      setInspectorHtml("");
      return;
    }
    const p = paragraphs.find((x) => x.id === selectedParagraphId);
    if (!p) {
      setInspectorHtml("");
      return;
    }
    const basisHtml = sanitizeInlineBookHtml(p.basis);
    const draft = draftRewrites[p.id];
    const display = typeof draft === "string" && draft.trim() ? draft : basisHtml;
    setInspectorHtml(display);
  }, [selectedParagraphId, inspectorFocused, paragraphs, draftRewrites]);

  // Debounced commit: sanitize the inspector HTML and write to draftRewrites.
  useEffect(() => {
    if (!selectedParagraphId) return;
    const p = paragraphs.find((x) => x.id === selectedParagraphId);
    if (!p) return;

    const handle = window.setTimeout(() => {
      const basisHtml = sanitizeInlineBookHtml(p.basis);
      const cleaned = sanitizeInlineBookHtml(inspectorHtml || "");
      setDraftRewrites((prev) => {
        const prevVal = typeof prev[p.id] === "string" ? prev[p.id] : "";
        const shouldRemove = !cleaned.trim() || cleaned.trim() === basisHtml.trim();
        if (shouldRemove) {
          if (!prevVal) return prev;
          const next = { ...prev };
          delete next[p.id];
          return next;
        }
        if (prevVal.trim() === cleaned.trim()) return prev;
        return { ...prev, [p.id]: cleaned };
      });
    }, 350);

    return () => window.clearTimeout(handle);
  }, [inspectorHtml, selectedParagraphId, paragraphs]);

  const chapterOpenerSrc = useMemo(() => {
    if (chapterIdx === null) return "";
    const ch = Array.isArray(canonical?.chapters) ? canonical.chapters[chapterIdx] : null;
    const opener = (ch as any)?.openerImage ?? (ch as any)?.opener_image;
    return typeof opener === "string" ? opener.trim() : "";
  }, [canonical, chapterIdx]);

  const openerUrl = useMemo(() => {
    if (!chapterOpenerSrc) return "";
    return imageSrcMap?.[chapterOpenerSrc] || "";
  }, [chapterOpenerSrc, imageSrcMap]);

  const coverUrl = useMemo(() => {
    return imageSrcMap?.[COVER_CANONICAL_SRC] || "";
  }, [imageSrcMap]);

  // Debounce preview rendering so typing in the inspector doesn't regenerate the full HTML on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setPreviewRewrites(draftRewrites), 250);
    return () => window.clearTimeout(t);
  }, [draftRewrites]);

  const previewSrcDoc = useMemo(() => {
    if (!canonical || chapterIdx === null) {
      return "<!doctype html><html><head><meta charset=\"utf-8\"/></head><body style=\"font-family:system-ui;padding:16px;\">Loading…</body></html>";
    }

    const overlayForPreview: OverlayJsonV1 = {
      paragraphs: Object.entries(previewRewrites)
        .map(([paragraph_id, rewritten]) => ({ paragraph_id, rewritten }))
        .filter((p) => typeof p.paragraph_id === "string" && typeof p.rewritten === "string" && p.rewritten.trim().length > 0),
    };

    const canonicalWithOverlay = applyRewritesOverlay(canonical, overlayForPreview);
    const html = renderBookHtml(canonicalWithOverlay, {
      target: "chapter",
      chapterIndex: chapterIdx,
      figures: { srcMap: imageSrcMap || {} },
      designTokens,
      chapterOpeners: chapterOpeners || undefined,
      placeholdersOnly: false,
      coverUrl: coverUrl || null,
    });

    return injectPreviewBridge(html);
  }, [canonical, chapterIdx, previewRewrites, imageSrcMap, designTokens, chapterOpeners, coverUrl]);

  // Reset readiness whenever the preview doc changes.
  useEffect(() => {
    setPreviewReady(false);
  }, [previewSrcDoc]);

  // Keep the iframe highlight in sync with selected paragraph.
  useEffect(() => {
    if (!previewReady) return;
    postToPreview({ type: "bookPreview.setSelectedParagraph", paragraphId: selectedParagraphId || null });
  }, [previewReady, selectedParagraphId, postToPreview, previewSrcDoc]);

  const bookCssVars = useMemo(() => {
    // Baseline defaults (match book-worker/lib/bookRenderer.js)
    const base: Record<string, string> = {
      "--page-width": "195mm",
      "--page-height": "265mm",
      "--margin-top": "20mm",
      "--margin-bottom": "20mm",
      "--margin-inner": "15mm",
      "--margin-outer": "15mm",
      "--body-size": "12pt",
      "--body-leading": "1.25",
      "--h1": "35pt",
      "--h2": "18pt",
      "--h3": "14pt",
      "--body-columns": "2",
      "--col-gap": "9mm",
      "--rule": "#c9c9c9",
      "--muted": "#555",
      "--text": "#111",
    };
    const fromTokens = extractBookCssVarsFromDesignTokens(designTokens);
    return { ...base, ...fromTokens } as Record<string, string>;
  }, [designTokens]);

  const sections = useMemo(() => {
    const set = new Set<string>();
    for (const p of paragraphs) set.add(p.sectionTitle || "Section");
    return Array.from(set);
  }, [paragraphs]);

  const sectionToParagraphs = useMemo(() => {
    const map = new Map<string, CanonicalParagraph[]>();
    for (const p of paragraphs) {
      const key = p.sectionTitle || "Section";
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [paragraphs]);

  const pages = useMemo(() => {
    // Chapter-focused: opener page + section pages. We chunk paragraphs to keep pages roughly page-sized.
    const out: Array<{ id: string; title: string; paragraphs: CanonicalParagraph[]; kind: "cover" | "opener" | "section" }> = [];
    out.push({ id: "page-cover", title: "Cover", paragraphs: [], kind: "cover" });
    out.push({ id: "page-opener", title: chapterTitle || "Chapter", paragraphs: [], kind: "opener" });
    for (const s of sections) {
      const ps = sectionToParagraphs.get(s) || [];
      const chunks = splitIntoPages(ps, 3);
      chunks.forEach((chunk, idx) => {
        out.push({ id: `page-${s}-${idx}`, title: s, paragraphs: chunk, kind: "section" });
      });
    }
    return out;
  }, [chapterTitle, sections, sectionToParagraphs]);

  const goBack = useCallback(() => {
    if (!bookId) return;
    const qs = new URLSearchParams();
    if (bookVersionId) qs.set("bookVersionId", bookVersionId);
    if (overlayId) qs.set("overlayId", overlayId);
    navigate(`/admin/book-studio/${encodeURIComponent(bookId)}${qs.toString() ? `?${qs.toString()}` : ""}`);
  }, [bookId, bookVersionId, overlayId, navigate]);

  const openVersions = useCallback(() => {
    if (!bookId) return;
    const qs = new URLSearchParams();
    if (bookVersionId) qs.set("bookVersionId", bookVersionId);
    if (overlayId) qs.set("overlayId", overlayId);
    navigate(`/admin/book-studio/${encodeURIComponent(bookId)}/versions${qs.toString() ? `?${qs.toString()}` : ""}`);
  }, [bookId, bookVersionId, overlayId, navigate]);

  const enqueueRenderChapter = useCallback(async () => {
    if (!bookId || chapterIdx === null || !bookVersionId) return;
    const resolvedOverlayId = overlayId || (await resolveBookVersionAndOverlay()).overlayId;
    if (!resolvedOverlayId) return;
    try {
      const res = await mcp.call("lms.bookEnqueueRender", {
        bookId,
        bookVersionId,
        overlayId: resolvedOverlayId,
        target: "chapter",
        chapterIndex: chapterIdx,
        renderProvider: "prince_local",
        allowMissingImages: true,
      });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to enqueue render");
      const runId = safeStr((res as any)?.runId);
      toast({ title: "Queued", description: viewMode === "proof" ? "Chapter render queued. Waiting for PDF…" : "Chapter render queued. Opening run…" });
      if (runId) {
        if (viewMode === "proof") {
          setProofRunId(runId);
          setProofPdfUrl("");
          setProofError("");
          setProofLoading(true);
          return;
        }
        navigate(`/admin/books/${encodeURIComponent(bookId)}/runs/${encodeURIComponent(runId)}`);
      }
    } catch (e) {
      toast({
        title: "Render failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [bookId, bookVersionId, overlayId, chapterIdx, mcp, toast, navigate, resolveBookVersionAndOverlay, viewMode]);

  const tryGetPdfUrlForRun = useCallback(
    async (runId: string): Promise<string | null> => {
      if (!bookId || chapterIdx === null) return null;
      const list = await mcp.callGet("lms.bookList", { scope: "artifacts", runId, bookId, limit: "500", offset: "0" }) as any;
      if (!list || list.ok !== true) return null;
      const artifacts: any[] = Array.isArray(list.artifacts) ? list.artifacts : [];
      const pdf = artifacts.find((a) => a && a.kind === "pdf" && typeof a.chapter_index === "number" && a.chapter_index === chapterIdx) || null;
      const artifactId = typeof pdf?.id === "string" ? pdf.id : "";
      if (!artifactId) return null;
      const urlRes = await mcp.call("lms.bookArtifactUrl", { artifactId });
      if (!(urlRes as any)?.ok) return null;
      const signedUrl = safeStr((urlRes as any)?.signedUrl);
      return signedUrl || null;
    },
    [bookId, chapterIdx, mcp]
  );

  const loadLatestProofPdf = useCallback(async () => {
    if (!bookId || !bookVersionId || chapterIdx === null) return;
    setProofLoading(true);
    setProofError("");
    try {
      const runsRes = await mcp.callGet("lms.bookList", {
        scope: "runs",
        bookId,
        bookVersionId,
        limit: "200",
        offset: "0",
      }) as any;
      if (!runsRes || runsRes.ok !== true) throw new Error(runsRes?.error?.message || "Failed to load runs");
      const runs: any[] = Array.isArray(runsRes.runs) ? runsRes.runs : [];

      const candidates = runs.filter((r) => {
        if (!r || r.target !== "chapter") return false;
        if (r.status !== "done" && r.status !== "completed") return false;
        // Prefer matching overlay when present
        if (overlayId && typeof r.overlay_id === "string") return r.overlay_id === overlayId;
        if (overlayId && !r.overlay_id) return false;
        return true;
      });

      for (const r of candidates) {
        const rid = typeof r?.id === "string" ? r.id : "";
        if (!rid) continue;
        const url = await tryGetPdfUrlForRun(rid);
        if (url) {
          setProofPdfUrl(url);
          setProofRunId(rid);
          setProofLoading(false);
          return;
        }
      }

      setProofPdfUrl("");
      setProofError("No completed PDF found yet for this chapter. Render a PDF, then refresh Proof.");
    } catch (e) {
      setProofPdfUrl("");
      setProofError(e instanceof Error ? e.message : "Failed to load proof PDF");
    } finally {
      setProofLoading(false);
    }
  }, [bookId, bookVersionId, chapterIdx, overlayId, mcp, tryGetPdfUrlForRun]);

  // If we're in Proof mode and we just enqueued a run, poll that run for a PDF artifact (bounded).
  useEffect(() => {
    if (viewMode !== "proof") return;
    if (!proofRunId) return;
    if (!bookId || chapterIdx === null) return;

    let cancelled = false;
    const token = (proofPollTokenRef.current += 1);

    (async () => {
      setProofLoading(true);
      setProofError("");
      for (let attempt = 0; attempt < 60; attempt++) {
        if (cancelled) return;
        if (proofPollTokenRef.current !== token) return;
        const url = await tryGetPdfUrlForRun(proofRunId);
        if (url) {
          setProofPdfUrl(url);
          setProofLoading(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (cancelled) return;
      setProofLoading(false);
      setProofError("PDF not ready yet. Open the run page to inspect progress, or refresh Proof.");
    })().catch(() => {
      if (cancelled) return;
      setProofLoading(false);
      setProofError("Proof polling failed.");
    });

    return () => {
      cancelled = true;
    };
  }, [viewMode, proofRunId, bookId, chapterIdx, tryGetPdfUrlForRun]);

  // When entering Proof mode without a known run, try to load the latest completed PDF.
  useEffect(() => {
    if (viewMode !== "proof") return;
    if (proofRunId) return;
    void loadLatestProofPdf();
  }, [viewMode, proofRunId, loadLatestProofPdf]);

  const setRewrite = useCallback(
    (paragraphId: string, nextHtml: string) => {
      const cleaned = sanitizeInlineBookHtml(nextHtml || "");
      setDraftRewrites((prev) => {
        const next = { ...prev };
        if (cleaned.trim()) next[paragraphId] = cleaned;
        else delete next[paragraphId];
        return next;
      });
    },
    []
  );

  const aiRewriteParagraph = useCallback(
    async (paragraphId: string, basisHtml: string) => {
      setAiBusyIds((prev) => new Set(prev).add(paragraphId));
      try {
        // ai-rewrite-text contract only supports { segmentType: stem|option|reference } and enum styleHints.
        // For book paragraphs we use "reference" and pass instructions via context.userPrompt.
        const currentHtml =
          (draftRewrites[paragraphId] || "").trim() ? draftRewrites[paragraphId] : sanitizeInlineBookHtml(basisHtml);

        const result = await mcp.rewriteText({
          segmentType: "reference",
          // Pass HTML so the Edge Function preserves HTML in the output (it explicitly supports this).
          currentText: currentHtml,
          styleHints: ["simplify", "more_casual"],
          context: {
            userPrompt:
              "Rewrite this paragraph for an MBO student (N3 level). Keep meaning; do not add facts. Return inline HTML suitable for book text (no markdown). Allowed tags: <strong>, <em>, <sup>, <sub>, <span>, <br/>.",
          },
          candidateCount: 1,
        });
        const next = result?.candidates?.[0]?.text;
        if (!next || typeof next !== "string") throw new Error("AI rewrite returned empty");
        setRewrite(paragraphId, next);
        toast({ title: "AI rewrite applied" });
      } catch (e) {
        toast({
          title: "AI rewrite failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setAiBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(paragraphId);
          return next;
        });
      }
    },
    [draftRewrites, mcp, setRewrite, toast]
  );

  const revertParagraph = useCallback(
    (paragraphId: string) => {
      setDraftRewrites((prev) => {
        const next = { ...prev };
        const baseline = loadedRewrites[paragraphId];
        if (baseline && baseline.trim()) next[paragraphId] = baseline;
        else delete next[paragraphId];
        return next;
      });
    },
    [loadedRewrites]
  );

  const saveOverlay = useCallback(async () => {
    if (!overlayId) return;
    setSaving(true);
    try {
      const payload = Object.entries(draftRewrites)
        .map(([paragraph_id, rewritten]) => ({ paragraph_id, rewritten }))
        .filter((p) => typeof p.paragraph_id === "string" && typeof p.rewritten === "string" && p.rewritten.trim().length > 0);

      const res = await mcp.call("lms.bookSaveOverlay", { overlayId, rewrites: { paragraphs: payload } });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Save failed");

      toast({ title: "Saved", description: "Overlay saved." });
      setLoadedRewrites(draftRewrites);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [overlayId, draftRewrites, mcp, toast]);

  // Skeleton-first: save skeleton to server
  const saveSkeleton = useCallback(async () => {
    if (!bookId || !bookVersionId || !draftSkeleton) return;
    setSaving(true);
    try {
      const res = await mcp.call("lms.bookVersionSaveSkeleton", {
        bookId,
        bookVersionId,
        skeleton: draftSkeleton,
        note: `Book Studio edit at ${new Date().toISOString()}`,
        compileCanonical: true,
      });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Save failed");

      toast({ title: "Saved", description: "Skeleton saved and compiled." });
      setSkeleton(draftSkeleton);
      setSkeletonDirty(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [bookId, bookVersionId, draftSkeleton, mcp, toast]);

  // Unified save: use skeleton or overlay based on authoring mode
  const saveChanges = useCallback(async () => {
    if (authoringMode === "skeleton") {
      await saveSkeleton();
    } else {
      await saveOverlay();
    }
  }, [authoringMode, saveSkeleton, saveOverlay]);

  const discardChanges = useCallback(async () => {
    await load();
    toast({ title: "Discarded", description: "Reloaded chapter from server." });
  }, [load, toast]);

  const uploadImageForSrc = useCallback(
    async (canonicalSrc: string, file: File | null) => {
      if (!file || !bookId) return;
      setImageBusySrcs((prev) => new Set(prev).add(canonicalSrc));
      try {
        const res = await mcp.call("lms.bookLibraryUploadUrl", { bookId, canonicalSrc, fileName: file.name });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to get upload URL");

        const signedUploadUrl = safeStr((res as any)?.signedUrl);
        const storagePath = safeStr((res as any)?.path);
        if (!signedUploadUrl || !storagePath) throw new Error("Missing signedUrl/path");

        const up = await fetch(signedUploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!up.ok) {
          const t = await up.text().catch(() => "");
          throw new Error(`Upload failed (${up.status}): ${t.slice(0, 200)}`);
        }

        const link = await mcp.call("lms.bookLibraryUpsertIndex", { bookId, mappings: [{ canonicalSrc, storagePath, action: "upsert" }] });
        if (!(link as any)?.ok) throw new Error((link as any)?.error?.message || "Failed to link image");

        const signed = await mcp.call("lms.bookLibraryStorageUrl", { bookId, storagePath, expiresIn: 3600 });
        if (!(signed as any)?.ok) throw new Error((signed as any)?.error?.message || "Failed to sign image URL");
        const signedUrl = safeStr((signed as any)?.signedUrl);
        if (!signedUrl) throw new Error("Missing signedUrl");

        setImageSrcMap((prev) => ({ ...(prev || {}), [canonicalSrc]: signedUrl }));
        setMissingImageSrcs((prev) => (Array.isArray(prev) ? prev.filter((s) => s !== canonicalSrc) : prev));

        toast({ title: "Uploaded", description: "Image uploaded + linked." });
      } catch (e) {
        toast({
          title: "Upload failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setImageBusySrcs((prev) => {
          const next = new Set(prev);
          next.delete(canonicalSrc);
          return next;
        });
      }
    },
    [bookId, mcp, toast]
  );

  const aiGenerateImageForSrc = useCallback(
    async (canonicalSrc: string, promptOverride?: string) => {
      if (!bookId) return;
      const prompt =
        typeof promptOverride === "string"
          ? promptOverride
          : window.prompt(`AI image prompt for:\n${canonicalSrc}\n\nDescribe the image to generate:`);
      if (!prompt || !prompt.trim()) return;

      setImageBusySrcs((prev) => new Set(prev).add(canonicalSrc));
      try {
        const res = await mcp.call("lms.bookLibraryGenerateImage", { bookId, canonicalSrc, prompt: prompt.trim() });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "AI generation failed");
        const signedUrl = safeStr((res as any)?.signedUrl);
        if (!signedUrl) throw new Error("Missing signedUrl");

        setImageSrcMap((prev) => ({ ...(prev || {}), [canonicalSrc]: signedUrl }));
        setMissingImageSrcs((prev) => (Array.isArray(prev) ? prev.filter((s) => s !== canonicalSrc) : prev));

        toast({ title: "Generated", description: "AI image generated + linked." });
      } catch (e) {
        toast({
          title: "AI image failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setImageBusySrcs((prev) => {
          const next = new Set(prev);
          next.delete(canonicalSrc);
          return next;
        });
      }
    },
    [bookId, mcp, toast]
  );

  const scrollToPage = useCallback((pageId: string) => {
    const el = document.getElementById(pageId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (authLoading || (!isAdmin && !devAgent)) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="w-full">
      <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-3">
        {/* Header */} 
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{chapterTitle || "Chapter"}</div>
            <div className="text-[11px] text-muted-foreground truncate font-mono">
              {bookId} • chapterIndex={chapterIdx ?? "?"} • bookVersionId={bookVersionId || "—"} • overlayId={overlayId || "—"}
              {dirtyCount > 0 ? ` • ${dirtyCount} unsaved` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goBack}
              data-cta-id="cta-bookstudio-back-to-book"
              data-action="navigate"
            >
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openVersions}
              data-cta-id="cta-bookstudio-book-versions"
              data-action="navigate"
            >
              Versions
            </Button>
            <Button
              size="sm"
              variant={viewMode === "edit" ? "default" : "outline"}
              onClick={() => setViewMode("edit")}
              data-cta-id="cta-bookstudio-view-edit"
              data-action="action"
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant={viewMode === "proof" ? "default" : "outline"}
              onClick={() => {
                setViewMode("proof");
              }}
              data-cta-id="cta-bookstudio-view-proof"
              data-action="action"
            >
              Proof
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void enqueueRenderChapter()}
              data-cta-id="cta-bookstudio-book-render"
              data-action="action"
            >
              Render PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void discardChanges()}
              disabled={loading}
              data-cta-id="cta-bookstudio-chapter-discard"
              data-action="action"
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => void saveChanges()}
              disabled={saving || (authoringMode === "skeleton" ? !draftSkeleton : !overlayId)}
              data-cta-id="cta-bookstudio-chapter-save"
              data-action="action"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {/* Warnings */}
        {!loading && !designTokens && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="font-medium text-amber-600">Design tokens missing</div>
            <div className="text-xs text-muted-foreground mt-1">
              This book version does not include <span className="font-mono">design_tokens.json</span>. Preview CSS may differ from the PDF.
            </div>
          </div>
        )}

        {missingImageSrcs && missingImageSrcs.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="font-medium text-amber-600">Missing images in this chapter</div>
            <div className="text-xs text-muted-foreground mt-1">
              {missingImageSrcs.slice(0, 8).join(", ")}
              {missingImageSrcs.length > 8 ? " …" : ""}
            </div>
          </div>
        )}

        {/* Skeleton-first: Authoring mode indicator + model selection */}
        {authoringMode === "skeleton" && (
          <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-blue-600 border-blue-500">Skeleton-first</Badge>
              <span className="text-xs text-muted-foreground">Editing skeleton directly. Changes compile to canonical on save.</span>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">AI Model Configuration</summary>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Skeleton Gen</label>
                  <select
                    value={skeletonModel}
                    onChange={(e) => setSkeletonModel(e.target.value)}
                    className="w-full text-xs border rounded px-2 py-1 bg-background"
                    data-cta-id="cta-bookstudio-model-skeleton"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="o1">o1</option>
                    <option value="claude-sonnet-4-5-20250929">claude-sonnet-4.5</option>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4.5</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Validation</label>
                  <select
                    value={validateModel}
                    onChange={(e) => setValidateModel(e.target.value)}
                    className="w-full text-xs border rounded px-2 py-1 bg-background"
                    data-cta-id="cta-bookstudio-model-validate"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="o1">o1</option>
                    <option value="claude-sonnet-4-5-20250929">claude-sonnet-4.5</option>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4.5</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Pass 1 Write</label>
                  <select
                    value={writeModel}
                    onChange={(e) => setWriteModel(e.target.value)}
                    className="w-full text-xs border rounded px-2 py-1 bg-background"
                    data-cta-id="cta-bookstudio-model-write"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="o1">o1</option>
                    <option value="claude-sonnet-4-5-20250929">claude-sonnet-4.5</option>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4.5</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Additional Passes</label>
                  <select
                    value={passesModel}
                    onChange={(e) => setPassesModel(e.target.value)}
                    className="w-full text-xs border rounded px-2 py-1 bg-background"
                    data-cta-id="cta-bookstudio-model-passes"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="o1">o1</option>
                    <option value="claude-sonnet-4-5-20250929">claude-sonnet-4.5</option>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4.5</option>
                  </select>
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-[10px] text-muted-foreground mb-1">User Instructions (appended to prompts)</label>
                <textarea
                  value={userInstructions}
                  onChange={(e) => setUserInstructions(e.target.value)}
                  placeholder="Optional: Add specific instructions for AI rewrites…"
                  className="w-full text-xs border rounded px-2 py-1 bg-background resize-none h-16"
                  data-cta-id="cta-bookstudio-user-instructions"
                />
              </div>
            </details>
          </div>
        )}

        <div className="flex gap-0">
          {/* Sidebar */}
          <aside className="w-56 bg-background border-r p-2 overflow-y-auto flex-shrink-0 h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between px-2 py-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pages</div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-muted-foreground">Zoom</div>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={25}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-28"
                  data-cta-id="cta-bookstudio-wysiwyg-zoom"
                  data-action="action"
                />
                <div className="text-[10px] text-muted-foreground w-10 text-right">{zoom}%</div>
              </div>
            </div>
            <div className="space-y-1">
              {navEntries.map((p, idx) => (
                <button
                  key={p.anchorId}
                  type="button"
                  onClick={() => postToPreview({ type: "bookPreview.scrollToId", id: p.anchorId })}
                  className={cn(
                    "w-full text-left text-[11px] font-medium p-2.5 rounded-md cursor-pointer transition-colors",
                    "text-muted-foreground hover:bg-muted/60"
                  )}
                  data-cta-id={`cta-bookstudio-wysiwyg-nav-${idx}`}
                  data-action="navigate"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <main className="flex-1 min-w-0">
            <div className="play-root w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 p-2 sm:p-3 md:p-4 rounded-xl h-[calc(100vh-180px)] overflow-auto">
              {viewMode ? (
                <div className="w-full h-full flex flex-col items-center gap-3">
                  <div className="w-full max-w-[1100px] flex-1 overflow-hidden rounded-xl border bg-background shadow-sm">
                    {viewMode === "edit" ? (
                      <iframe
                        ref={iframeRef}
                        title="Book preview"
                        sandbox="allow-same-origin allow-scripts"
                        srcDoc={previewSrcDoc}
                        onLoad={() => setPreviewReady(true)}
                        className="w-full h-full bg-white"
                        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
                        data-cta-id="cta-bookstudio-preview-iframe"
                        data-action="noop"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/20">
                          <div className="text-xs text-muted-foreground truncate">
                            {proofLoading ? "Waiting for PDF…" : proofPdfUrl ? "PDF ready" : "No PDF yet"}
                            {proofError ? ` — ${proofError}` : ""}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void loadLatestProofPdf()}
                              disabled={proofLoading}
                              data-cta-id="cta-bookstudio-proof-refresh"
                              data-action="action"
                            >
                              Refresh
                            </Button>
                            {proofPdfUrl ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(proofPdfUrl, "_blank", "noopener,noreferrer")}
                                data-cta-id="cta-bookstudio-proof-open"
                                data-action="action"
                              >
                                Open
                              </Button>
                            ) : null}
                            {proofRunId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/admin/books/${encodeURIComponent(bookId || "")}/runs/${encodeURIComponent(proofRunId)}`)}
                                data-cta-id="cta-bookstudio-proof-open-run"
                                data-action="navigate"
                              >
                                Run
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex-1">
                          {proofPdfUrl ? (
                            <iframe
                              title="PDF proof"
                              src={proofPdfUrl}
                              className="w-full h-full"
                              data-cta-id="cta-bookstudio-proof-iframe"
                              data-action="noop"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                              {proofLoading ? "Rendering/signing…" : "Render a PDF to verify pixel-perfect output."}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-5xl mx-auto h-full">
                <style>
                  {`
                    .book-canvas {
                      /* Defaults can be overridden by design_tokens.json via inline CSS vars. */
                      font-family: "Source Sans 3", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
                      color: var(--text);
                    }
                    .book-page {
                      width: var(--page-width);
                      height: var(--page-height);
                      background: #ffffff;
                      position: relative;
                      border: 1px solid rgba(15, 23, 42, 0.12);
                      box-shadow: 0 18px 40px rgba(2,6,23,0.18);
                    }
                    .book-page.page-left .book-page-inner {
                      padding: var(--margin-top) var(--margin-inner) var(--margin-bottom) var(--margin-outer);
                    }
                    .book-page.page-right .book-page-inner {
                      padding: var(--margin-top) var(--margin-outer) var(--margin-bottom) var(--margin-inner);
                    }
                    .book-page.cover .book-page-inner,
                    .book-page.opener .book-page-inner {
                      padding: 0;
                    }
                    .book-cover-img,
                    .book-opener-img {
                      width: 100%;
                      height: 100%;
                      object-fit: cover;
                      display: block;
                    }
                    .chapter-title-overlay {
                      position: absolute;
                      top: 0;
                      left: 0;
                      right: 0;
                      padding: var(--margin-top) var(--margin-outer) 0 var(--margin-inner);
                      z-index: 2;
                    }
                    .chapter-number {
                      font-size: 9pt;
                      letter-spacing: 0.14em;
                      text-transform: uppercase;
                      color: var(--muted);
                      margin-bottom: 2mm;
                    }
                    .chapter-title {
                      font-size: var(--h1);
                      font-weight: 700;
                      line-height: 1.05;
                      margin: 0;
                      padding-bottom: 2mm;
                      border-bottom: 2pt solid rgba(15, 23, 42, 0.28);
                      color: #0f172a;
                    }
                    .section-title {
                      font-family: inherit;
                      font-size: var(--h2);
                      font-weight: 700;
                      color: #0f172a;
                      margin: 0 0 5mm 0;
                      padding-bottom: 1.2mm;
                      border-bottom: 0.5pt solid var(--rule);
                    }
                    .chapter-body {
                      column-count: var(--body-columns);
                      column-gap: var(--col-gap);
                      column-fill: auto;
                    }
                    .para-block {
                      break-inside: avoid;
                      page-break-inside: avoid;
                      margin: 0 0 4mm 0;
                      position: relative;
                    }
                    .para-editable {
                      font-size: var(--body-size);
                      line-height: calc(var(--body-leading) * 1);
                      outline: none;
                    }
                    .para-editable .box-lead {
                      font-weight: 700;
                    }
                  `}
                </style>

                <div className="book-canvas flex flex-col items-center gap-10 py-2" style={bookCssVars as any}>
                  {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

                  {!loading &&
                    pages.map((pg, pageIdx) => (
                      <div
                        key={pg.id}
                        id={pg.id}
                        style={{
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: "top center",
                        }}
                        className={cn(
                          "book-page rounded-sm",
                          pageIdx % 2 === 0 ? "page-right" : "page-left",
                          pg.kind === "cover" ? "cover" : pg.kind === "opener" ? "opener" : "section"
                        )}
                        data-cta-id={`cta-bookstudio-wysiwyg-page-${pageIdx}`}
                        data-action="noop"
                      >
                        <div className="book-page-inner w-full h-full">
                          {pg.kind === "cover" ? (
                            <div className="space-y-6">
                              <div className="relative w-full h-full bg-slate-50 overflow-hidden">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  ref={(el) => {
                                    uploadInputRefs.current[COVER_CANONICAL_SRC] = el;
                                  }}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0] || null;
                                    void uploadImageForSrc(COVER_CANONICAL_SRC, f);
                                    e.currentTarget.value = "";
                                  }}
                                />

                                {coverUrl ? (
                                  <img
                                    src={coverUrl}
                                    alt="Book cover"
                                    className="book-cover-img"
                                    data-cta-id="cta-bookstudio-cover-preview"
                                    data-action="noop"
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                                    <div className="text-lg">No cover uploaded yet</div>
                                    <div className="text-xs">Upload a cover image or generate one with AI.</div>
                                  </div>
                                )}

                                <ActionCornerButtons
                                  className="bottom-3 right-3"
                                  actions={[
                                    {
                                      ctaId: "cta-bookstudio-cover-upload",
                                      title: "Upload cover",
                                      icon: "🖼️",
                                      onClick: () => uploadInputRefs.current[COVER_CANONICAL_SRC]?.click(),
                                      disabled: imageBusySrcs.has(COVER_CANONICAL_SRC),
                                    },
                                    {
                                      ctaId: "cta-bookstudio-cover-ai",
                                      title: "AI generate cover",
                                      icon: "🎨",
                                      onClick: () => {
                                        const prompt = window.prompt("AI cover prompt:\nDescribe the book cover you want:");
                                        if (!prompt || !prompt.trim()) return;
                                        void aiGenerateImageForSrc(COVER_CANONICAL_SRC, prompt.trim());
                                      },
                                      disabled: imageBusySrcs.has(COVER_CANONICAL_SRC),
                                    },
                                  ]}
                                />
                              </div>
                            </div>
                          ) : pg.kind === "opener" ? (
                            <div className="w-full h-full relative bg-slate-50 overflow-hidden">
                              {openerUrl ? (
                                <img src={openerUrl} alt="" className="book-opener-img" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
                                  No opener image resolved
                                </div>
                              )}
                              <div className="chapter-title-overlay" data-cta-id="cta-bookstudio-chapter-title" data-action="noop">
                                <div className="chapter-number">Hoofdstuk {chapterIdx === null ? "?" : chapterIdx + 1}</div>
                                <div className="chapter-title">{chapterTitle || "Chapter"}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between gap-3">
                                <h2 className="section-title">{pg.title}</h2>
                                <Badge variant="outline" className="text-xs">{pageIdx + 1}</Badge>
                              </div>

                              <div className="chapter-body">
                                {pg.paragraphs.map((p, idx) => {
                                  const basisHtml = sanitizeInlineBookHtml(p.basis);
                                  const baseline = loadedRewrites[p.id] || "";
                                  const current = draftRewrites[p.id] || "";
                                  const isDirty = baseline.trim() !== current.trim();
                                  const displayHtml = (draftRewrites[p.id] || "").trim() ? draftRewrites[p.id] : basisHtml;

                                  const busyAi = aiBusyIds.has(p.id);

                                  return (
                                    <div
                                      key={p.id}
                                      className={cn("para-block", isDirty ? "bg-amber-50/60" : "")}
                                      data-cta-id={`cta-bookstudio-wysiwyg-paragraph-${p.id}`}
                                      data-action="noop"
                                    >
                                      <div className="text-[10px] font-mono text-slate-500 mb-2">
                                        {p.id}
                                        {p.microTitle ? ` • ${p.microTitle}` : ""}
                                      </div>

                                      <BookInlineEditable
                                        html={displayHtml}
                                        onChangeHtml={(next) => {
                                          const cleaned = sanitizeInlineBookHtml(next);
                                          // If user ends up matching basis, treat as no rewrite.
                                          if (!cleaned.trim() || cleaned.trim() === basisHtml.trim()) {
                                            setDraftRewrites((prev) => {
                                              const n = { ...prev };
                                              delete n[p.id];
                                              return n;
                                            });
                                            return;
                                          }
                                          setRewrite(p.id, cleaned);
                                        }}
                                        className="para-editable"
                                        dataCtaId={`cta-bookstudio-para-edit-${idx}`}
                                        ariaLabel={`Edit paragraph ${p.id}`}
                                      />

                                      <ActionCornerButtons
                                        actions={[
                                          {
                                            ctaId: `cta-bookstudio-para-ai-rewrite-${idx}`,
                                            title: "AI rewrite",
                                            icon: "✨",
                                            onClick: () => void aiRewriteParagraph(p.id, p.basis),
                                            disabled: busyAi,
                                          },
                                          {
                                            ctaId: `cta-bookstudio-para-revert-${idx}`,
                                            title: "Revert",
                                            icon: "↩️",
                                            onClick: () => revertParagraph(p.id),
                                          },
                                        ]}
                                      />

                                      {p.images.length > 0 && (
                                        <div className="mt-4 space-y-3">
                                          {p.images.map((img, imgIdx) => {
                                            const url = imageSrcMap?.[img.src] || "";
                                            const isMissing = !!missingImageSrcs?.includes(img.src) || !url;
                                            const busyImg = imageBusySrcs.has(img.src);
                                            return (
                                              <div key={`${img.src}-${imgIdx}`} className="rounded-md border border-slate-200 overflow-hidden relative">
                                                <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  ref={(el) => {
                                                    uploadInputRefs.current[img.src] = el;
                                                  }}
                                                  onChange={(e) => {
                                                    const f = e.target.files?.[0] || null;
                                                    void uploadImageForSrc(img.src, f);
                                                    e.currentTarget.value = "";
                                                  }}
                                                />
                                                <div className="bg-slate-50">
                                                  {url ? (
                                                    <img src={url} alt={img.alt || ""} className="w-full max-h-80 object-contain" />
                                                  ) : (
                                                    <div className="h-44 flex items-center justify-center text-xs text-slate-500">
                                                      Missing image: <span className="ml-1 font-mono">{img.src}</span>
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="px-3 py-2 text-xs text-slate-600 flex items-center justify-between gap-2">
                                                  <div className="min-w-0 truncate">
                                                    <span className="font-semibold text-slate-700">{img.figureNumber ? `Figure ${img.figureNumber}` : "Figure"}</span>
                                                    {img.caption ? ` — ${img.caption}` : ""}
                                                  </div>
                                                  {isMissing && <Badge variant="destructive" className="text-[10px]">MISSING</Badge>}
                                                </div>

                                                <ActionCornerButtons
                                                  className="bottom-2 right-2"
                                                  actions={[
                                                    {
                                                      ctaId: `cta-bookstudio-para-image-upload-${idx}-${imgIdx}`,
                                                      title: "Upload/replace image",
                                                      icon: "🖼️",
                                                      onClick: () => uploadInputRefs.current[img.src]?.click(),
                                                      disabled: busyImg,
                                                    },
                                                    {
                                                      ctaId: `cta-bookstudio-para-image-ai-${idx}-${imgIdx}`,
                                                      title: "AI generate image",
                                                      icon: "🎨",
                                                      onClick: () => void aiGenerateImageForSrc(img.src),
                                                      disabled: busyImg,
                                                    },
                                                  ]}
                                                />
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {pg.paragraphs.length === 0 && (
                                  <div className="text-sm text-slate-500">No paragraphs in this section chunk.</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              )}
            </div>
          </main>

          {/* Inspector (selection-based editing) */}
          <aside className="w-64 bg-background border-l p-3 overflow-y-auto flex-shrink-0 h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Inspector</div>
              {selectedParagraphId ? (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  onClick={() => setSelectedParagraphId("")}
                  data-cta-id="cta-bookstudio-inspector-clear-selection"
                  data-action="action"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {!selectedParagraph ? (
              <div className="text-xs text-muted-foreground">
                Select a paragraph in the preview to edit its overlay text.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] font-mono text-muted-foreground break-all">
                  {selectedParagraph.id}
                </div>

                <div className="text-xs">
                  <div className="font-medium">{selectedParagraph.sectionTitle || "Section"}</div>
                  {selectedParagraph.microTitle ? (
                    <div className="text-[11px] text-muted-foreground">{selectedParagraph.microTitle}</div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold">Basis (read-only)</div>
                  <div className="rounded-md border bg-muted/20 p-2 text-[11px] leading-relaxed whitespace-pre-wrap">
                    {stripHtml(selectedParagraph.basis)}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold">Rewrite (HTML)</div>
                    <Badge variant="outline" className="text-[10px]">
                      {draftRewrites[selectedParagraph.id] ? "override" : "using basis"}
                    </Badge>
                  </div>
                  <textarea
                    value={inspectorHtml}
                    onChange={(e) => setInspectorHtml(e.target.value)}
                    onFocus={() => setInspectorFocused(true)}
                    onBlur={() => setInspectorFocused(false)}
                    rows={10}
                    className="w-full rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed"
                    data-cta-id="cta-bookstudio-inspector-html"
                    data-action="edit"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInspectorFocused(false);
                        void aiRewriteParagraph(selectedParagraph.id, selectedParagraph.basis);
                      }}
                      disabled={aiBusyIds.has(selectedParagraph.id)}
                      data-cta-id="cta-bookstudio-inspector-ai-rewrite"
                      data-action="action"
                    >
                      {aiBusyIds.has(selectedParagraph.id) ? "Rewriting…" : "AI rewrite"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInspectorFocused(false);
                        revertParagraph(selectedParagraph.id);
                      }}
                      data-cta-id="cta-bookstudio-inspector-revert"
                      data-action="action"
                    >
                      Revert
                    </Button>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Allowed inline HTML: <span className="font-mono">&lt;strong&gt;</span>, <span className="font-mono">&lt;em&gt;</span>,{" "}
                    <span className="font-mono">&lt;sup&gt;</span>, <span className="font-mono">&lt;sub&gt;</span>,{" "}
                    <span className="font-mono">&lt;span&gt;</span>, <span className="font-mono">&lt;br/&gt;</span>.
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}


