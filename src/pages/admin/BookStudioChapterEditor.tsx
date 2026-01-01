import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { cn } from "@/lib/utils";

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
    if (Array.isArray(blocks.content)) walkBlocks(blocks.content, ctx);
    if (Array.isArray(blocks.blocks)) walkBlocks(blocks.blocks, ctx);
    if (Array.isArray(blocks.items)) walkBlocks(blocks.items, ctx);
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

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
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
  const [aiBusy, setAiBusy] = useState(false);

  const [bookVersionId, setBookVersionId] = useState<string>(safeStr(searchParams.get("bookVersionId")));
  const [overlayId, setOverlayId] = useState<string>(safeStr(searchParams.get("overlayId")));

  const [canonical, setCanonical] = useState<any>(null);
  const [imageSrcMap, setImageSrcMap] = useState<Record<string, string> | null>(null);
  const [missingImageSrcs, setMissingImageSrcs] = useState<string[] | null>(null);

  const [paragraphs, setParagraphs] = useState<CanonicalParagraph[]>([]);
  const [loadedRewrites, setLoadedRewrites] = useState<Record<string, string>>({});
  const [rewrites, setRewrites] = useState<Record<string, string>>({});

  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

    let resolvedBookVersionId = bookVersionId;
    if (!resolvedBookVersionId) {
      const v = await mcp.callGet("lms.bookList", { scope: "versions", bookId, limit: "1", offset: "0" });
      if (!(v as any)?.ok) throw new Error((v as any)?.error?.message || "Failed to load versions");
      const first = (v as any)?.versions?.[0]?.book_version_id;
      resolvedBookVersionId = safeStr(first);
      if (!resolvedBookVersionId) throw new Error("No versions found for book");
      setBookVersionId(resolvedBookVersionId);
    }

    let resolvedOverlayId = overlayId;
    if (!resolvedOverlayId) {
      const list = await mcp.callGet("lms.bookList", {
        scope: "overlays",
        bookId,
        bookVersionId: resolvedBookVersionId,
        limit: "200",
        offset: "0",
      });
      if (!(list as any)?.ok) throw new Error((list as any)?.error?.message || "Failed to load overlays");
      const overlays = Array.isArray((list as any)?.overlays) ? ((list as any).overlays as any[]) : [];
      const preferred =
        overlays.find((o) => String(o?.label || "").trim().toLowerCase() === "book studio") || overlays[0] || null;
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
      const res = await mcp.call("lms.bookVersionInputUrls", {
        bookId,
        bookVersionId: resolved.bookVersionId,
        overlayId: resolved.overlayId,
        target: "chapter",
        chapterIndex: resolved.chapterIndex,
        allowMissingImages: true,
        expiresIn: 3600,
        includeChapterOpeners: true,
      });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to fetch signed URLs");

      const canonicalUrl = (res as any)?.urls?.canonical?.signedUrl as string | undefined;
      const overlayUrl = (res as any)?.urls?.overlay?.signedUrl as string | undefined;
      if (!canonicalUrl) throw new Error("Missing canonical signed URL");
      if (!overlayUrl) throw new Error("Missing overlay signed URL");

      const [canonicalJson, overlayJson] = await Promise.all([
        fetch(canonicalUrl).then(async (r) => {
          if (!r.ok) throw new Error(`Canonical download failed (${r.status})`);
          return await r.json();
        }),
        fetch(overlayUrl).then(async (r) => {
          if (!r.ok) throw new Error(`Overlay download failed (${r.status})`);
          return await r.json();
        }),
      ]);

      const chapterParas = collectCanonicalParagraphsForChapter(canonicalJson, chapterIdx);
      const overlay = (overlayJson || { paragraphs: [] }) as OverlayJsonV1;
      const map: Record<string, string> = {};
      for (const p of overlay.paragraphs || []) {
        if (p && typeof p.paragraph_id === "string" && typeof p.rewritten === "string") {
          map[p.paragraph_id] = p.rewritten;
        }
      }

      setCanonical(canonicalJson);
      setImageSrcMap((res as any)?.imageSrcMap || null);
      setMissingImageSrcs(Array.isArray((res as any)?.missingImageSrcs) ? ((res as any).missingImageSrcs as string[]) : null);
      setParagraphs(chapterParas);
      setLoadedRewrites(map);
      setRewrites(map);
    } catch (e) {
      toast({
        title: "Failed to load chapter",
        description: e instanceof Error ? e.message : "Unknown error",
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

  const chapterTitle = useMemo(() => {
    if (chapterIdx === null) return "";
    const ch = Array.isArray(canonical?.chapters) ? canonical.chapters[chapterIdx] : null;
    return (
      (typeof ch?.title === "string" && ch.title) ||
      (typeof ch?.meta?.title === "string" && ch.meta.title) ||
      `Chapter ${chapterIdx + 1}`
    );
  }, [canonical, chapterIdx]);

  const saveAll = useCallback(async () => {
    if (!overlayId) return;
    setSaving(true);
    try {
      const payload = Object.entries(rewrites)
        .map(([paragraph_id, rewritten]) => ({ paragraph_id, rewritten }))
        .filter((p) => typeof p.paragraph_id === "string" && typeof p.rewritten === "string");

      const res = await mcp.call("lms.bookSaveOverlay", { overlayId, rewrites: { paragraphs: payload } });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Save failed");

      toast({ title: "Saved", description: "Overlay saved." });
      setLoadedRewrites(rewrites);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [overlayId, rewrites, mcp, toast]);

  const revertParagraph = useCallback(
    (pid: string) => {
      setRewrites((prev) => ({ ...prev, [pid]: loadedRewrites[pid] || "" }));
    },
    [loadedRewrites]
  );

  const aiRewriteParagraph = useCallback(
    async (pid: string, basis: string) => {
      setAiBusy(true);
      try {
        // NOTE: `book_paragraph` segmentType is added in a later todo. For now, use reference rewrite.
        const next = await mcp.rewriteText({
          currentText: stripHtml(basis),
          segmentType: "reference",
          styleHints: [
            "Rewrite as a clear, student-friendly paragraph for this book chapter.",
            "Keep meaning.",
            "Do not add facts.",
          ],
        });
        if (!next || typeof next !== "string") throw new Error("AI rewrite returned empty");
        setRewrites((prev) => ({ ...prev, [pid]: next }));
      } catch (e) {
        toast({
          title: "AI rewrite failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setAiBusy(false);
      }
    },
    [mcp, toast]
  );

  const uploadImageForSrc = useCallback(
    async (canonicalSrc: string, file: File | null) => {
      if (!file || !bookId) return;
      try {
        const res = await mcp.call("lms.bookLibraryUploadUrl", {
          bookId,
          canonicalSrc,
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
          mappings: [{ canonicalSrc, storagePath }],
        });
        if (!(link as any)?.ok) throw new Error((link as any)?.error?.message || "Failed to link image");

        toast({ title: "Uploaded", description: "Image uploaded + linked." });
        void load();
      } catch (e) {
        toast({
          title: "Upload failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        // reset handled by input onChange owner
      }
    },
    [bookId, mcp, toast, load]
  );

  const aiGenerateImageForSrc = useCallback(
    async (canonicalSrc: string) => {
      if (!bookId) return;
      const prompt = window.prompt(`AI image prompt for:\n${canonicalSrc}\n\nDescribe the image to generate:`);
      if (!prompt || !prompt.trim()) return;
      try {
        const res = await mcp.call("lms.bookLibraryGenerateImage", { bookId, canonicalSrc, prompt: prompt.trim() });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "AI generation failed");
        const signedUrl = safeStr((res as any)?.signedUrl);
        toast({ title: "Generated", description: "AI image generated + linked." });
        if (signedUrl) window.open(signedUrl, "_blank", "noopener,noreferrer");
        void load();
      } catch (e) {
        toast({
          title: "AI image failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [bookId, mcp, toast, load]
  );

  const uniqueImageSrcs = useMemo(() => {
    const set = new Set<string>();
    for (const p of paragraphs) {
      for (const img of p.images) {
        if (img?.src) set.add(img.src);
      }
    }
    return Array.from(set);
  }, [paragraphs]);

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
            <h1 className="text-2xl font-bold truncate">{chapterTitle}</h1>
            <div className="text-xs text-muted-foreground font-mono truncate">
              {bookId} • chapterIndex={chapterIdx ?? "?"} • bookVersionId={bookVersionId || "—"} • overlayId={overlayId || "—"}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/book-studio/${encodeURIComponent(bookId || "")}?bookVersionId=${encodeURIComponent(bookVersionId || "")}&overlayId=${encodeURIComponent(overlayId || "")}`)}
              data-cta-id="cta-bookstudio-back-to-book"
              data-action="navigate"
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => toast({ title: "Not implemented", description: "Chapter-wide rewrite is wired in a later todo (job-based)." })}
              data-cta-id="cta-bookstudio-chapter-ai-rewrite-all"
              data-action="action"
            >
              AI rewrite chapter
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              data-cta-id="cta-bookstudio-chapter-discard"
              data-action="action"
            >
              Discard
            </Button>
            <Button onClick={() => void saveAll()} disabled={saving} data-cta-id="cta-bookstudio-chapter-save" data-action="action">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {missingImageSrcs && missingImageSrcs.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="font-medium text-amber-600">Missing images in this chapter</div>
            <div className="text-xs text-muted-foreground mt-1">
              {missingImageSrcs.slice(0, 8).join(", ")}
              {missingImageSrcs.length > 8 ? " …" : ""}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
            <CardDescription>Resolve missing images via upload or AI generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uniqueImageSrcs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No images referenced in this chapter.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {uniqueImageSrcs.map((src, idx) => {
                  const url = imageSrcMap?.[src] || "";
                  const isMissing = !!missingImageSrcs?.includes(src) || !url;
                  return (
                    <div key={src} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-mono break-all">{src}</div>
                          <div className="text-xs text-muted-foreground">{isMissing ? "Missing" : "Resolved"}</div>
                        </div>
                        <Badge variant={isMissing ? "destructive" : "outline"}>{isMissing ? "MISSING" : "OK"}</Badge>
                      </div>
                      <div className="h-28 rounded-md border bg-muted/20 flex items-center justify-center overflow-hidden">
                        {url ? (
                          <img src={url} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-xs text-muted-foreground">No preview</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={(el) => {
                            uploadInputRefs.current[src] = el;
                          }}
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            void uploadImageForSrc(src, f);
                            e.currentTarget.value = "";
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => uploadInputRefs.current[src]?.click()}
                          data-cta-id={`cta-bookstudio-image-upload-${idx}`}
                          data-action="action"
                        >
                          Upload
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => void aiGenerateImageForSrc(src)}
                          data-cta-id={`cta-bookstudio-image-ai-${idx}`}
                          data-action="action"
                        >
                          AI
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        <div className="space-y-4">
          {paragraphs.map((p, i) => {
            const current = rewrites[p.id] ?? "";
            const isEdited = typeof current === "string" && current.trim().length > 0;
            return (
              <Card key={p.id} className={cn(isEdited ? "border-primary/50" : "")}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span className="font-mono text-xs">{p.id}</span>
                        <Badge variant="outline">#{i + 1}</Badge>
                      </CardTitle>
                      <CardDescription className="truncate">
                        {p.sectionTitle}
                        {p.microTitle ? ` • ${p.microTitle}` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void aiRewriteParagraph(p.id, p.basis)}
                        disabled={aiBusy}
                        data-cta-id={`cta-bookstudio-para-ai-rewrite-${i}`}
                        data-action="action"
                      >
                        AI rewrite
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revertParagraph(p.id)}
                        data-cta-id={`cta-bookstudio-para-revert-${i}`}
                        data-action="action"
                      >
                        Revert
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Basis (canonical)</div>
                      <div className="rounded-md border bg-muted/10 p-2 text-sm whitespace-pre-wrap">
                        {stripHtml(p.basis)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">Rewrite (overlay)</div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void saveAll()}
                          disabled={saving}
                          data-cta-id={`cta-bookstudio-para-save-${i}`}
                          data-action="action"
                        >
                          Save
                        </Button>
                      </div>
                      <Textarea
                        value={current}
                        onChange={(e) => setRewrites((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="Leave empty to use basis text."
                        className="min-h-[140px]"
                        data-cta-id={`cta-bookstudio-para-text-${i}`}
                        data-action="edit"
                      />
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/5 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium">Microheading</div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toast({ title: "Not implemented", description: "Microheading storage is added in overlay v2 (later todo)." })}
                          data-cta-id={`cta-bookstudio-para-suggest-microhead-${i}`}
                          data-action="action"
                        >
                          Suggest
                        </Button>
                      </div>
                    </div>
                    <Input
                      value={p.microTitle || ""}
                      onChange={() => toast({ title: "Not implemented", description: "Microheading editing is stored in overlay v2 (later todo)." })}
                      placeholder="Microheading…"
                      data-cta-id={`cta-bookstudio-para-microhead-${i}`}
                      data-action="edit"
                    />
                  </div>

                  {p.images.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Paragraph images</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {p.images.map((img, imgIdx) => {
                          const url = imageSrcMap?.[img.src] || "";
                          const isMissing = !!missingImageSrcs?.includes(img.src) || !url;
                          return (
                            <div key={`${img.src}-${imgIdx}`} className="rounded-md border p-3 space-y-2">
                              <div className="text-xs font-mono break-all">{img.src}</div>
                              <div className="h-24 rounded border bg-muted/20 flex items-center justify-center overflow-hidden">
                                {url ? (
                                  <img src={url} alt={img.alt || ""} className="w-full h-full object-contain" />
                                ) : (
                                  <span className="text-xs text-muted-foreground">No preview</span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => uploadInputRefs.current[img.src]?.click()}
                                  data-cta-id={`cta-bookstudio-para-image-upload-${i}-${imgIdx}`}
                                  data-action="action"
                                >
                                  Upload
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => void aiGenerateImageForSrc(img.src)}
                                  data-cta-id={`cta-bookstudio-para-image-ai-${i}-${imgIdx}`}
                                  data-action="action"
                                >
                                  AI
                                </Button>
                              </div>
                              {isMissing && (
                                <div className="text-xs text-amber-600">Missing mapping — upload or AI-generate.</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!loading && paragraphs.length === 0 && (
            <div className="text-sm text-muted-foreground">No paragraphs found for this chapter.</div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}


