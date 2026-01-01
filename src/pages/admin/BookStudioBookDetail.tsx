import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { cn } from "@/lib/utils";

type BookRow = {
  id: string;
  organization_id: string;
  title: string;
  level: string;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BookVersionRow = {
  id: string;
  book_id: string;
  book_version_id: string;
  schema_version: string;
  source?: string | null;
  exported_at?: string | null;
  canonical_path: string;
  figures_path?: string | null;
  design_tokens_path?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type BookOverlayRow = {
  id: string;
  book_id: string;
  book_version_id: string;
  overlay_path: string;
  label?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BookListResponse =
  | { ok: true; scope: string; books: BookRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

type VersionsListResponse =
  | { ok: true; scope: string; bookId: string; versions: BookVersionRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

type OverlaysListResponse =
  | { ok: true; scope: string; overlays: BookOverlayRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

type SignedUrlsResponse = {
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
  };
  imageSrcMap?: Record<string, string> | null;
  missingImageSrcs?: string[] | null;
};

type ChapterSummary = {
  index: number;
  title: string;
  paragraphCount: number;
  imageCount: number;
  openerSrc?: string | null;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function collectChapterStats(chapter: any): { paragraphCount: number; imageCount: number; openerSrc: string | null } {
  let paragraphCount = 0;
  let imageCount = 0;
  let openerSrc: string | null = null;

  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;

    const t = typeof node.type === "string" ? node.type : "";
    if (t === "paragraph") {
      if (typeof node.basis === "string" && node.basis.trim()) paragraphCount += 1;
      const imgs = node.images;
      if (Array.isArray(imgs)) {
        for (const img of imgs) {
          const src = typeof img?.src === "string" ? img.src.trim() : "";
          if (src) imageCount += 1;
        }
      }
    }

    const opener = (node as any).openerImage ?? (node as any).opener_image;
    if (!openerSrc && typeof opener === "string" && opener.trim()) openerSrc = opener.trim();

    Object.values(node).forEach(walk);
  };

  walk(chapter);
  return { paragraphCount, imageCount, openerSrc };
}

const COVER_CANONICAL_SRC = "__book_cover__";

export default function BookStudioBookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
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

  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState<BookRow | null>(null);
  const [versions, setVersions] = useState<BookVersionRow[]>([]);
  const [selectedBookVersionId, setSelectedBookVersionId] = useState<string>(safeStr(searchParams.get("bookVersionId")));
  const [selectedOverlayId, setSelectedOverlayId] = useState<string>(safeStr(searchParams.get("overlayId")));

  const [canonical, setCanonical] = useState<any>(null);
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [imageSrcMap, setImageSrcMap] = useState<Record<string, string> | null>(null);
  const [missingImageSrcs, setMissingImageSrcs] = useState<string[] | null>(null);

  const [rendering, setRendering] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const coverFileRef = useRef<HTMLInputElement | null>(null);

  // Sync search params for deep links.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedBookVersionId) next.set("bookVersionId", selectedBookVersionId);
    else next.delete("bookVersionId");
    if (selectedOverlayId) next.set("overlayId", selectedOverlayId);
    else next.delete("overlayId");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookVersionId, selectedOverlayId]);

  const loadBase = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const [booksRes, versionsRes] = await Promise.all([
        mcp.callGet("lms.bookList", { scope: "books", limit: "500", offset: "0" }) as Promise<BookListResponse>,
        mcp.callGet("lms.bookList", { scope: "versions", bookId, limit: "200", offset: "0" }) as Promise<VersionsListResponse>,
      ]);

      if ((booksRes as any)?.ok !== true) throw new Error((booksRes as any)?.error?.message || "Failed to load books");
      if ((versionsRes as any)?.ok !== true) throw new Error((versionsRes as any)?.error?.message || "Failed to load versions");

      const match = ((booksRes as any).books as BookRow[] | undefined)?.find((b) => b.id === bookId) || null;
      setBook(match);

      const v = ((versionsRes as any).versions as BookVersionRow[] | undefined) || [];
      setVersions(v);

      // Default bookVersionId: newest
      if (!selectedBookVersionId && v.length > 0) {
        setSelectedBookVersionId(v[0]!.book_version_id);
      }
    } catch (e) {
      toast({
        title: "Failed to load book",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, mcp, toast, selectedBookVersionId]);

  const ensureOverlay = useCallback(async (): Promise<string | null> => {
    if (!bookId || !selectedBookVersionId) return null;
    if (selectedOverlayId) return selectedOverlayId;

    const overlaysRes = (await mcp.callGet("lms.bookList", {
      scope: "overlays",
      bookId,
      bookVersionId: selectedBookVersionId,
      limit: "200",
      offset: "0",
    })) as OverlaysListResponse;

    if ((overlaysRes as any)?.ok !== true) {
      throw new Error((overlaysRes as any)?.error?.message || "Failed to load overlays");
    }

    const overlays = Array.isArray((overlaysRes as any).overlays) ? ((overlaysRes as any).overlays as BookOverlayRow[]) : [];
    const preferred =
      overlays.find((o) => String(o.label || "").trim().toLowerCase() === "book studio") || overlays[0] || null;

    if (preferred?.id) {
      setSelectedOverlayId(preferred.id);
      return preferred.id;
    }

    const created = await mcp.call("lms.bookCreateOverlay", { bookId, bookVersionId: selectedBookVersionId, label: "Book Studio" });
    if (!(created as any)?.ok) {
      throw new Error((created as any)?.error?.message || "Create overlay failed");
    }
    const overlayId = safeStr((created as any)?.overlayId);
    if (overlayId) setSelectedOverlayId(overlayId);
    return overlayId || null;
  }, [bookId, selectedBookVersionId, selectedOverlayId, mcp]);

  const loadCanonical = useCallback(async () => {
    if (!bookId || !selectedBookVersionId) return;

    const overlayId = await ensureOverlay();
    if (!overlayId) return;

    const res = (await mcp.call("lms.bookVersionInputUrls", {
      bookId,
      bookVersionId: selectedBookVersionId,
      overlayId,
      target: "book",
      allowMissingImages: true,
      expiresIn: 3600,
    })) as SignedUrlsResponse;

    if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to fetch signed URLs");
    const canonicalUrl = res?.urls?.canonical?.signedUrl;
    if (!canonicalUrl) throw new Error("Missing canonical signed URL");

    const canon = await fetch(canonicalUrl).then(async (r) => {
      if (!r.ok) throw new Error(`Canonical download failed (${r.status})`);
      return await r.json();
    });

    setCanonical(canon);
    setImageSrcMap((res as any)?.imageSrcMap || null);
    setMissingImageSrcs(Array.isArray((res as any)?.missingImageSrcs) ? ((res as any).missingImageSrcs as string[]) : null);

    const ch = Array.isArray(canon?.chapters) ? canon.chapters : [];
    const summaries: ChapterSummary[] = ch.map((c: any, idx: number) => {
      const title =
        (typeof c?.title === "string" && c.title.trim()) ||
        (typeof c?.meta?.title === "string" && c.meta.title.trim()) ||
        `Chapter ${idx + 1}`;
      const stats = collectChapterStats(c);
      return { index: idx, title, paragraphCount: stats.paragraphCount, imageCount: stats.imageCount, openerSrc: stats.openerSrc };
    });
    setChapters(summaries);
  }, [bookId, selectedBookVersionId, ensureOverlay, mcp]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void loadBase();
  }, [authLoading, isAdmin, navigate, loadBase]);

  useEffect(() => {
    if (!bookId || !selectedBookVersionId) return;
    void loadCanonical().catch((e) => {
      toast({
        title: "Failed to load canonical",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    });
  }, [bookId, selectedBookVersionId, loadCanonical, toast]);

  const selectedVersion = useMemo(() => {
    return versions.find((v) => v.book_version_id === selectedBookVersionId) || null;
  }, [versions, selectedBookVersionId]);

  const openVersions = useCallback(() => {
    if (!bookId) return;
    const qs = new URLSearchParams();
    if (selectedBookVersionId) qs.set("bookVersionId", selectedBookVersionId);
    if (selectedOverlayId) qs.set("overlayId", selectedOverlayId);
    navigate(`/admin/book-studio/${encodeURIComponent(bookId)}/versions${qs.toString() ? `?${qs.toString()}` : ""}`);
  }, [bookId, navigate, selectedBookVersionId, selectedOverlayId]);

  const openChapter = useCallback(
    (chapterIndex: number) => {
      if (!bookId) return;
      const qs = new URLSearchParams();
      if (selectedBookVersionId) qs.set("bookVersionId", selectedBookVersionId);
      if (selectedOverlayId) qs.set("overlayId", selectedOverlayId);
      navigate(
        `/admin/book-studio/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(String(chapterIndex))}${
          qs.toString() ? `?${qs.toString()}` : ""
        }`
      );
    },
    [bookId, navigate, selectedBookVersionId, selectedOverlayId]
  );

  const enqueueRenderBook = useCallback(async () => {
    if (!bookId || !selectedBookVersionId) return;
    const overlayId = selectedOverlayId || (await ensureOverlay());
    if (!overlayId) return;

    setRendering(true);
    try {
      const res = await mcp.call("lms.bookEnqueueRender", {
        bookId,
        bookVersionId: selectedBookVersionId,
        overlayId,
        target: "book",
        renderProvider: "prince_local",
        allowMissingImages: true,
      });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to enqueue render");
      const runId = safeStr((res as any)?.runId);
      toast({ title: "Queued", description: "Book render queued. Opening run…" });
      if (runId) navigate(`/admin/books/${encodeURIComponent(bookId)}/runs/${encodeURIComponent(runId)}`);
    } catch (e) {
      toast({
        title: "Render failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRendering(false);
    }
  }, [bookId, selectedBookVersionId, selectedOverlayId, ensureOverlay, mcp, toast, navigate]);

  const downloadCanonicalJson = useCallback(async () => {
    if (!bookId || !selectedBookVersionId) return;
    try {
      const overlayId = selectedOverlayId || (await ensureOverlay());
      if (!overlayId) throw new Error("Missing overlayId");

      const res = (await mcp.call("lms.bookVersionInputUrls", {
        bookId,
        bookVersionId: selectedBookVersionId,
        overlayId,
        target: "book",
        allowMissingImages: true,
        expiresIn: 3600,
      })) as SignedUrlsResponse;
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to sign URL");
      const url = res?.urls?.canonical?.signedUrl;
      if (!url) throw new Error("Missing canonical signed URL");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [bookId, selectedBookVersionId, selectedOverlayId, ensureOverlay, mcp, toast]);

  const onCoverFileChosen = useCallback(
    async (file: File | null) => {
      if (!file || !bookId) return;
      setCoverBusy(true);
      try {
        const res = await mcp.call("lms.bookLibraryUploadUrl", {
          bookId,
          canonicalSrc: COVER_CANONICAL_SRC,
          fileName: file.name,
        });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to get upload URL");

        const signedUrl = safeStr((res as any)?.signedUrl);
        const storagePath = safeStr((res as any)?.path);
        if (!signedUrl || !storagePath) throw new Error("Missing signedUrl/path");

        const up = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!up.ok) {
          const t = await up.text().catch(() => "");
          throw new Error(`Upload failed (${up.status}): ${t.slice(0, 200)}`);
        }

        const link = await mcp.call("lms.bookLibraryUpsertIndex", {
          bookId,
          mappings: [{ canonicalSrc: COVER_CANONICAL_SRC, storagePath }],
        });
        if (!(link as any)?.ok) throw new Error((link as any)?.error?.message || "Failed to link cover image");

        toast({ title: "Cover uploaded", description: "Cover image uploaded + linked." });
      } catch (e) {
        toast({
          title: "Cover upload failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setCoverBusy(false);
        if (coverFileRef.current) coverFileRef.current.value = "";
      }
    },
    [bookId, mcp, toast]
  );

  const aiGenerateCover = useCallback(async () => {
    if (!bookId) return;
    const prompt = window.prompt("AI cover prompt:\nDescribe the book cover you want:");
    if (!prompt || !prompt.trim()) return;

    setCoverBusy(true);
    try {
      const res = await mcp.call("lms.bookLibraryGenerateImage", {
        bookId,
        canonicalSrc: COVER_CANONICAL_SRC,
        prompt: prompt.trim(),
      });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "AI generation failed");
      const signedUrl = safeStr((res as any)?.signedUrl);
      toast({ title: "Cover generated", description: "AI cover generated + linked." });
      if (signedUrl) window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({
        title: "Cover generation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCoverBusy(false);
    }
  }, [bookId, mcp, toast]);

  if (authLoading || (!isAdmin && !devAgent)) {
    return (
      <PageContainer>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{book?.title || bookId}</h1>
            <div className="text-xs text-muted-foreground font-mono truncate">{bookId}</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/admin/book-studio")}
              data-cta-id="cta-bookstudio-back-to-library"
              data-action="navigate"
              data-target="/admin/book-studio"
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => void loadBase()}
              data-cta-id="cta-bookstudio-book-refresh"
              data-action="action"
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => openVersions()}
              data-cta-id="cta-bookstudio-book-versions"
              data-action="navigate"
              data-target={`/admin/book-studio/${encodeURIComponent(bookId || "")}/versions`}
            >
              Versions
            </Button>
            <Button
              onClick={() => void enqueueRenderBook()}
              disabled={rendering}
              data-cta-id="cta-bookstudio-book-render"
              data-action="action"
            >
              {rendering ? "Rendering…" : "Render PDF"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Cover</CardTitle>
              <CardDescription>Upload or AI-generate a cover (stored in the book image library).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onCoverFileChosen(e.target.files?.[0] || null)}
              />
              <div className="aspect-[3/4] rounded-lg border bg-muted/20 flex items-center justify-center text-muted-foreground">
                <div className="text-center text-xs">
                  Cover preview\n(added after `book-library-image-url` endpoint)
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => coverFileRef.current?.click()}
                  disabled={coverBusy}
                  className="flex-1"
                  data-cta-id="cta-bookstudio-cover-upload"
                  data-action="action"
                >
                  Upload
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void aiGenerateCover()}
                  disabled={coverBusy}
                  className="flex-1"
                  data-cta-id="cta-bookstudio-cover-ai"
                  data-action="action"
                >
                  AI Generate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Book</CardTitle>
              <CardDescription>Pick a version and open chapters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bookVersionId">Book version</Label>
                  <Input
                    id="bookVersionId"
                    value={selectedBookVersionId}
                    onChange={(e) => setSelectedBookVersionId(e.target.value)}
                    placeholder="book_version_id"
                    data-cta-id="cta-bookstudio-bookversion-edit"
                    data-action="edit"
                  />
                  <div className="text-xs text-muted-foreground">
                    Tip: use the newest version ID (hash) for best results.
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Overlay</Label>
                  <Input
                    value={selectedOverlayId}
                    onChange={(e) => setSelectedOverlayId(e.target.value)}
                    placeholder="overlayId (auto-created if empty)"
                    data-cta-id="cta-bookstudio-overlayid-edit"
                    data-action="edit"
                  />
                  <div className="text-xs text-muted-foreground">
                    Current overlay is used for all chapter edits and renders.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void downloadCanonicalJson()}
                  data-cta-id="cta-bookstudio-book-export"
                  data-action="action"
                >
                  Export canonical
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/admin/books/${encodeURIComponent(bookId || "")}`)}
                  data-cta-id="cta-bookstudio-book-runs"
                  data-action="navigate"
                  data-target={`/admin/books/${encodeURIComponent(bookId || "")}`}
                >
                  Runs
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/admin/books/missing-images?bookId=${encodeURIComponent(bookId || "")}`)}
                  data-cta-id="cta-bookstudio-book-missing-images"
                  data-action="navigate"
                  data-target="/admin/books/missing-images"
                >
                  Missing images
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Not implemented", description: "Archive flow is not implemented yet." })}
                  data-cta-id="cta-bookstudio-book-archive"
                  data-action="action"
                >
                  Archive
                </Button>
              </div>

              {missingImageSrcs && missingImageSrcs.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <div className="font-medium text-amber-600">Missing images detected</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {missingImageSrcs.slice(0, 6).join(", ")}
                    {missingImageSrcs.length > 6 ? " …" : ""}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {chapters.map((ch) => {
                  const openerUrl = ch.openerSrc && imageSrcMap ? imageSrcMap[ch.openerSrc] : "";
                  return (
                    <div
                      key={ch.index}
                      className={cn("rounded-lg border bg-card overflow-hidden")}
                      data-cta-id={`cta-bookstudio-chapter-card-${ch.index}`}
                      data-action="noop"
                    >
                      <div className="h-24 bg-muted/20 flex items-center justify-center text-xs text-muted-foreground">
                        {openerUrl ? (
                          <img src={openerUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span>Chapter opener</span>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{ch.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {ch.paragraphCount} paragraphs • {ch.imageCount} images
                            </div>
                          </div>
                          <Badge variant="outline" className="font-mono">
                            {ch.index + 1}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => openChapter(ch.index)}
                            data-cta-id={`cta-bookstudio-chapter-edit-${ch.index}`}
                            data-action="navigate"
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => openChapter(ch.index)}
                            data-cta-id={`cta-bookstudio-chapter-opener-${ch.index}`}
                            data-action="navigate"
                          >
                            Opener
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "Not implemented",
                      description: "Book-wide rewrite is not implemented yet. Use chapter rewrite inside a chapter.",
                    })
                  }
                  data-cta-id="cta-bookstudio-rewrite-all-book"
                  data-action="action"
                >
                  AI rewrite all (book)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Not implemented", description: "Compare/publish is implemented in the legacy books pages today." })}
                  data-cta-id="cta-bookstudio-version-compare"
                  data-action="action"
                >
                  Compare
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast({ title: "Not implemented", description: "Publish flow will be wired to overlay versions." })}
                  data-cta-id="cta-bookstudio-version-publish"
                  data-action="action"
                >
                  Publish
                </Button>
              </div>

              {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
              {!loading && versions.length > 0 && !selectedVersion && (
                <div className="text-sm text-amber-600">
                  Warning: selected bookVersionId not found in the versions list. Check the value.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}


