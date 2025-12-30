import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { cn } from "@/lib/utils";

type BookRow = {
  id: string;
  title?: string | null;
  level?: string | null;
  source?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type BookRunRow = {
  id: string;
  organization_id: string;
  book_id: string;
  book_version_id: string;
  overlay_id?: string | null;
  target: string;
  status: string;
  render_provider: string;
  progress_stage?: string | null;
  progress_percent: number;
  progress_message?: string | null;
  error?: string | null;
  created_at?: string | null;
};

type BookRunChapterRow = {
  id: string;
  run_id: string;
  chapter_index: number;
  status: string;
  created_at?: string | null;
};

type BookArtifactRow = {
  id: string;
  run_id: string;
  chapter_index?: number | null;
  kind: string;
  path: string;
  sha256?: string | null;
  bytes?: number | null;
  content_type?: string | null;
  created_at?: string | null;
};

type LayoutReport = {
  generatedAt?: string;
  allowMissingImages?: boolean;
  missingImages?: Array<{
    htmlSrc?: string;
    canonicalSrc?: string;
    basename?: string;
    suggestedUploadPath?: string;
  }>;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function BookMissingImages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const mcp = useMCP();
  const { user, role, loading: authLoading } = useAuth();

  const devAgent = isDevAgentMode();
  const devOverrideRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const isAdmin =
    devAgent ||
    role === "admin" ||
    devOverrideRole === "admin" ||
    user?.app_metadata?.role === "admin" ||
    user?.user_metadata?.role === "admin";

  const initialBookId = safeStr(searchParams.get("bookId"));
  const initialRunId = safeStr(searchParams.get("runId"));

  const [books, setBooks] = useState<BookRow[]>([]);
  const [runs, setRuns] = useState<BookRunRow[]>([]);
  const [chapters, setChapters] = useState<BookRunChapterRow[]>([]);
  const [artifacts, setArtifacts] = useState<BookArtifactRow[]>([]);

  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);

  const [selectedBookId, setSelectedBookId] = useState<string>(initialBookId);
  const [selectedRunId, setSelectedRunId] = useState<string>(initialRunId);

  const [layoutReport, setLayoutReport] = useState<LayoutReport | null>(null);
  const [layoutReportLoading, setLayoutReportLoading] = useState(false);
  const [fixingByKey, setFixingByKey] = useState<Set<string>>(new Set());
  const [enqueuing, setEnqueuing] = useState(false);

  // Keep query params in sync (deep-linkable).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedBookId) next.set("bookId", selectedBookId);
    else next.delete("bookId");
    if (selectedRunId) next.set("runId", selectedRunId);
    else next.delete("runId");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookId, selectedRunId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
    }
  }, [authLoading, isAdmin, navigate]);

  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    try {
      const res = (await mcp.callGet("lms.bookList", {
        scope: "books",
        limit: "200",
        offset: "0",
      })) as any;
      if (res?.ok !== true) throw new Error(res?.error?.message || "Failed to load books");
      const data = Array.isArray(res?.books) ? (res.books as BookRow[]) : [];
      setBooks(data);
    } catch (e) {
      toast({
        title: "Failed to load books",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setBooks([]);
    } finally {
      setLoadingBooks(false);
    }
  }, [mcp, toast]);

  const loadRuns = useCallback(async (bookId: string) => {
    if (!bookId) return;
    setLoadingRuns(true);
    try {
      const res = (await mcp.callGet("lms.bookList", {
        scope: "runs",
        bookId,
        limit: "200",
        offset: "0",
      })) as any;
      if (res?.ok !== true) throw new Error(res?.error?.message || "Failed to load runs");
      const data = Array.isArray(res?.runs) ? (res.runs as BookRunRow[]) : [];
      setRuns(data);
    } catch (e) {
      toast({
        title: "Failed to load runs",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  }, [mcp, toast]);

  const loadRunDetail = useCallback(async (bookId: string, runId: string) => {
    if (!bookId || !runId) return;
    setLoadingRunDetail(true);
    try {
      const [chaptersRes, artifactsRes] = await Promise.all([
        mcp.callGet("lms.bookList", { scope: "run-chapters", bookId, runId, limit: "200", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "artifacts", bookId, runId, limit: "200", offset: "0" }) as Promise<any>,
      ]);

      if (chaptersRes?.ok !== true) throw new Error(chaptersRes?.error?.message || "Failed to load chapters");
      if (artifactsRes?.ok !== true) throw new Error(artifactsRes?.error?.message || "Failed to load artifacts");

      setChapters(Array.isArray(chaptersRes?.chapters) ? (chaptersRes.chapters as BookRunChapterRow[]) : []);
      setArtifacts(Array.isArray(artifactsRes?.artifacts) ? (artifactsRes.artifacts as BookArtifactRow[]) : []);
    } catch (e) {
      toast({
        title: "Failed to load run",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setChapters([]);
      setArtifacts([]);
    } finally {
      setLoadingRunDetail(false);
    }
  }, [mcp, toast]);

  const latestLayoutReportArtifact = useMemo(() => {
    const sorted = [...artifacts].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return sorted.find((a) => a.kind === "layout_report") || null;
  }, [artifacts]);

  const loadLayoutReport = useCallback(async () => {
    if (!latestLayoutReportArtifact) {
      setLayoutReport(null);
      return;
    }
    setLayoutReportLoading(true);
    try {
      const res = await mcp.call("lms.bookArtifactUrl", { artifactId: latestLayoutReportArtifact.id });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to sign URL");
      const signedUrl = (res as any)?.signedUrl as string | undefined;
      if (!signedUrl) throw new Error("Missing signedUrl");

      const r = await fetch(signedUrl);
      if (!r.ok) throw new Error(`Failed to download report (${r.status})`);
      const j = await r.json().catch(() => null);
      setLayoutReport(j && typeof j === "object" ? (j as LayoutReport) : null);
    } catch (e) {
      setLayoutReport(null);
      toast({
        title: "Failed to load layout report",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLayoutReportLoading(false);
    }
  }, [latestLayoutReportArtifact, mcp, toast]);

  useEffect(() => {
    if (!isAdmin || authLoading) return;
    void loadBooks();
  }, [isAdmin, authLoading, loadBooks]);

  useEffect(() => {
    if (!selectedBookId) {
      setRuns([]);
      setSelectedRunId("");
      return;
    }
    void loadRuns(selectedBookId);
  }, [selectedBookId, loadRuns]);

  useEffect(() => {
    if (!selectedBookId || !selectedRunId) {
      setChapters([]);
      setArtifacts([]);
      setLayoutReport(null);
      return;
    }
    void loadRunDetail(selectedBookId, selectedRunId);
  }, [selectedBookId, selectedRunId, loadRunDetail]);

  useEffect(() => {
    void loadLayoutReport();
  }, [loadLayoutReport]);

  const visibleBooks = useMemo(() => {
    // Hide E2E-only books by default (they’re useful for tests but noisy for admins).
    const isE2E = (b: BookRow): boolean => String(b?.source || "").trim().toLowerCase() === "e2e";
    const filtered = books.filter((b) => !isE2E(b));

    // Keep deep-links stable: if the selected book is E2E, still show it in the dropdown.
    if (selectedBookId && !filtered.some((b) => b.id === selectedBookId)) {
      const selected = books.find((b) => b.id === selectedBookId);
      if (selected) return [selected, ...filtered];
    }

    return filtered;
  }, [books, selectedBookId]);

  const selectedBook = useMemo(() => {
    return books.find((b) => b.id === selectedBookId) || null;
  }, [books, selectedBookId]);

  const selectedRun = useMemo(() => {
    return runs.find((r) => r.id === selectedRunId) || null;
  }, [runs, selectedRunId]);

  const missingImages = useMemo(() => {
    const arr = layoutReport?.missingImages;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((m) => (m && typeof m === "object" ? m : null))
      .filter(Boolean) as NonNullable<LayoutReport["missingImages"]>;
  }, [layoutReport]);

  const uploadMissingImage = useCallback(
    async (canonicalSrc: string, file: File) => {
      if (!selectedBookId) return;
      const key = `upload:${canonicalSrc}`;
      setFixingByKey((prev) => new Set(prev).add(key));
      try {
        const res = await mcp.call("lms.bookLibraryUploadUrl", {
          bookId: selectedBookId,
          canonicalSrc,
          fileName: file.name,
        });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to get upload URL");

        const signedUrl = (res as any)?.signedUrl as string | undefined;
        const storagePath = (res as any)?.path as string | undefined;
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
          bookId: selectedBookId,
          mappings: [{ canonicalSrc, storagePath }],
        });
        if (!(link as any)?.ok) throw new Error((link as any)?.error?.message || "Failed to update images index");

        toast({ title: "Uploaded", description: "Image uploaded + linked. Re-render to apply." });
      } catch (e) {
        toast({
          title: "Upload failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setFixingByKey((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [mcp, toast, selectedBookId]
  );

  const aiGenerateMissingImage = useCallback(
    async (canonicalSrc: string) => {
      if (!selectedBookId) return;
      const prompt = window.prompt(`AI image prompt for:\n${canonicalSrc}\n\nDescribe what this figure should show:`);
      if (!prompt || !prompt.trim()) return;

      const key = `ai:${canonicalSrc}`;
      setFixingByKey((prev) => new Set(prev).add(key));
      try {
        const res = await mcp.call("lms.bookLibraryGenerateImage", {
          bookId: selectedBookId,
          canonicalSrc,
          prompt: prompt.trim(),
        });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "AI generation failed");

        const signedUrl = (res as any)?.signedUrl as string | undefined;
        toast({ title: "Generated", description: "AI image generated + linked. Re-render to apply." });
        if (signedUrl) window.open(signedUrl, "_blank", "noopener,noreferrer");
      } catch (e) {
        toast({
          title: "AI generate failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setFixingByKey((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [mcp, toast, selectedBookId]
  );

  const signAndOpenArtifact = useCallback(
    async (artifactId: string) => {
      try {
        const res = await mcp.call("lms.bookArtifactUrl", { artifactId });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to sign URL");
        const signedUrl = (res as any)?.signedUrl as string | undefined;
        if (!signedUrl) throw new Error("Missing signedUrl");
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      } catch (e) {
        toast({
          title: "Download failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [mcp, toast]
  );

  const enqueueRerender = useCallback(async () => {
    if (!selectedRun || !selectedBookId) return;
    setEnqueuing(true);
    try {
      const chapterIndex =
        selectedRun.target === "chapter"
          ? (Array.isArray(chapters) && chapters.length > 0 ? chapters[0].chapter_index : null)
          : null;
      if (selectedRun.target === "chapter" && typeof chapterIndex !== "number") {
        throw new Error("Missing chapter index for this run (no book_run_chapters rows).");
      }

      const res = await mcp.call("lms.bookEnqueueRender", {
        bookId: selectedBookId,
        bookVersionId: selectedRun.book_version_id,
        overlayId: selectedRun.overlay_id || undefined,
        target: selectedRun.target === "chapter" ? "chapter" : "book",
        ...(selectedRun.target === "chapter" ? { chapterIndex } : {}),
        renderProvider: selectedRun.render_provider === "docraptor_api" ? "docraptor_api" : "prince_local",
        allowMissingImages: true,
      });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Failed to enqueue render");
      const nextRunId = safeStr((res as any)?.runId);
      toast({ title: "Queued", description: "Re-render queued. Opening the new run…" });
      if (nextRunId) setSelectedRunId(nextRunId);
      else void loadRuns(selectedBookId);
    } catch (e) {
      toast({
        title: "Re-render failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setEnqueuing(false);
    }
  }, [selectedRun, selectedBookId, chapters, mcp, toast, loadRuns]);

  const pdfArtifact = useMemo(() => {
    const sorted = [...artifacts].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return sorted.find((a) => a.kind === "pdf") || null;
  }, [artifacts]);

  const headerTitle = useMemo(() => {
    const bookLabel = selectedBook?.title ? String(selectedBook.title) : (selectedBookId ? selectedBookId : "Select a book");
    const runLabel = selectedRunId ? `${selectedRunId.slice(0, 6)}…` : "Select a run";
    return `${bookLabel} / ${runLabel}`;
  }, [selectedBook, selectedBookId, selectedRunId]);

  const statusBadge = useMemo(() => {
    const s = safeStr(selectedRun?.status);
    const variant =
      s === "done" ? "bg-green-100 text-green-800 border-green-200" :
      s === "failed" ? "bg-red-100 text-red-800 border-red-200" :
      s ? "bg-amber-100 text-amber-800 border-amber-200" :
      "bg-muted text-muted-foreground border-border";
    return (
      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide", variant)}>
        {s || "—"}
      </span>
    );
  }, [selectedRun?.status]);

  if (authLoading || (!isAdmin && !devAgent)) {
    return (
      <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-3">
        <div className="play-root w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 p-2 sm:p-3 md:p-4 rounded-xl">
          <div className="w-full flex flex-col gap-3">
            {/* Compact header */}
            <div className="bg-background/80 backdrop-blur border rounded-lg px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm font-semibold truncate">Missing images</div>
                  <span className="text-xs text-muted-foreground truncate">{headerTitle}</span>
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                  {statusBadge}
                  <span className="hidden sm:inline">•</span>
                  <span>
                    {layoutReportLoading ? "Loading report…" : missingImages.length ? `${missingImages.length} missing` : "No missing images reported"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/admin/books")}
                  data-cta-id="cta-admin-bookmissing-back"
                  data-action="navigate"
                >
                  Back to Books
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadBooks()}
                  disabled={loadingBooks}
                  data-cta-id="cta-admin-bookmissing-refresh"
                  data-action="action"
                >
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => void enqueueRerender()}
                  disabled={!selectedRun || enqueuing}
                  data-cta-id="cta-admin-bookmissing-rerender"
                  data-action="action"
                >
                  {enqueuing ? "Queuing…" : "Re-render PDF"}
                </Button>
              </div>
            </div>

            {/* Selector row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-background/80 backdrop-blur border rounded-lg px-3 py-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Book
                </div>
                <select
                  className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
                  value={selectedBookId}
                  onChange={(e) => {
                    const next = String(e.target.value || "");
                    setSelectedBookId(next);
                    setSelectedRunId("");
                  }}
                  disabled={loadingBooks}
                  data-cta-id="cta-admin-bookmissing-book-select"
                  data-action="select"
                >
                  <option value="">{loadingBooks ? "Loading…" : "Select a book…"}</option>
                  {visibleBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title ? `${b.title}${b.level ? ` (${b.level})` : ""}` : b.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-background/80 backdrop-blur border rounded-lg px-3 py-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Run
                </div>
                <select
                  className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(String(e.target.value || ""))}
                  disabled={!selectedBookId || loadingRuns}
                  data-cta-id="cta-admin-bookmissing-run-select"
                  data-action="select"
                >
                  <option value="">
                    {!selectedBookId ? "Select a book first…" : loadingRuns ? "Loading runs…" : "Select a run…"}
                  </option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id.slice(0, 8)}… • {r.target} • {r.status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-background/80 backdrop-blur border rounded-lg px-3 py-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Artifacts
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {loadingRunDetail ? "Loading…" : selectedRunId ? `${artifacts.length} file(s)` : "—"}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (pdfArtifact ? void signAndOpenArtifact(pdfArtifact.id) : undefined)}
                    disabled={!pdfArtifact}
                    data-cta-id="cta-admin-bookmissing-open-pdf"
                    data-action="action"
                  >
                    Open PDF
                  </Button>
                </div>
              </div>
            </div>

            {/* Main layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Missing images */}
              <div className="lg:col-span-2 bg-background/80 backdrop-blur border rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span>🖼️</span>
                    <span>Missing images</span>
                    {layoutReport?.allowMissingImages ? (
                      <Badge variant="outline" className="text-[10px]">placeholders</Badge>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadLayoutReport()}
                    disabled={layoutReportLoading}
                    data-cta-id="cta-admin-bookrun-missing-refresh"
                    data-action="action"
                  >
                    {layoutReportLoading ? "Refreshing…" : "Refresh report"}
                  </Button>
                </div>

                <div className="p-3 space-y-3">
                  {!selectedRunId ? (
                    <div className="text-sm text-muted-foreground">Select a run to view missing images.</div>
                  ) : layoutReportLoading ? (
                    <div className="text-sm text-muted-foreground">Loading layout report…</div>
                  ) : !latestLayoutReportArtifact ? (
                    <div className="text-sm text-muted-foreground">
                      No <span className="font-mono text-xs">layout_report</span> artifact found yet. Render with
                      placeholders enabled to generate it.
                    </div>
                  ) : missingImages.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No missing images reported for this run.</div>
                  ) : (
                    <div className="space-y-2">
                      {missingImages.map((m, idx) => {
                        const canonicalSrc = safeStr(m.canonicalSrc).trim() || safeStr(m.htmlSrc).trim();
                        const uploadingKey = `upload:${canonicalSrc}`;
                        const aiKey = `ai:${canonicalSrc}`;
                        const busy = fixingByKey.has(uploadingKey) || fixingByKey.has(aiKey);

                        return (
                          <div key={`${canonicalSrc}:${idx}`} className="rounded-lg border bg-background p-3">
                            <div className="flex flex-col sm:flex-row gap-3">
                              <div className="w-full sm:w-44 h-24 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 flex items-center justify-center">
                                <div className="text-center">
                                  <div className="text-2xl opacity-60">🖼️</div>
                                  <div className="text-[9px] font-semibold text-amber-700 mt-1">PLACEHOLDER</div>
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-mono break-all">{canonicalSrc || "—"}</div>
                                {m.suggestedUploadPath ? (
                                  <div className="text-[11px] text-muted-foreground font-mono break-all mt-1">
                                    Upload path: {m.suggestedUploadPath}
                                  </div>
                                ) : null}

                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const el = document.getElementById(`bookmissing-upload-${idx}`) as HTMLInputElement | null;
                                      el?.click();
                                    }}
                                    disabled={busy || !canonicalSrc}
                                    data-cta-id="cta-admin-bookrun-missing-upload"
                                    data-action="action"
                                  >
                                    {fixingByKey.has(uploadingKey) ? "Uploading…" : "Upload image"}
                                  </Button>
                                  <input
                                    id={`bookmissing-upload-${idx}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.currentTarget.files?.[0] || null;
                                      e.currentTarget.value = "";
                                      if (!f || !canonicalSrc) return;
                                      void uploadMissingImage(canonicalSrc, f);
                                    }}
                                  />

                                  <Button
                                    size="sm"
                                    className="bg-violet-600 hover:bg-violet-700 text-white"
                                    onClick={() => void aiGenerateMissingImage(canonicalSrc)}
                                    disabled={busy || !canonicalSrc}
                                    data-cta-id="cta-admin-bookrun-missing-ai-generate"
                                    data-action="action"
                                  >
                                    {fixingByKey.has(aiKey) ? "Generating…" : "AI generate"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Artifacts list */}
              <div className="bg-background/80 backdrop-blur border rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b flex items-center justify-between">
                  <div className="text-sm font-semibold">Artifacts</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (selectedBookId && selectedRunId ? void loadRunDetail(selectedBookId, selectedRunId) : undefined)}
                    disabled={!selectedBookId || !selectedRunId || loadingRunDetail}
                    data-cta-id="cta-admin-bookrun-refresh"
                    data-action="action"
                  >
                    {loadingRunDetail ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
                <div className="p-3 space-y-2">
                  {!selectedRunId ? (
                    <div className="text-sm text-muted-foreground">Select a run to view artifacts.</div>
                  ) : artifacts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No artifacts uploaded yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {artifacts
                        .slice()
                        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
                        .map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                            onClick={() => void signAndOpenArtifact(a.id)}
                            data-cta-id="cta-admin-bookmissing-artifact-open"
                            data-action="action"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-mono truncate">{a.kind}</div>
                                <div className="text-[11px] text-muted-foreground font-mono truncate">{a.path}</div>
                              </div>
                              <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {typeof a.bytes === "number" ? `${Math.round(a.bytes / 1024)} KB` : "—"}
                              </div>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer hint */}
            <div className="text-[11px] text-muted-foreground px-1">
              Tip: Upload or AI-generate missing images, then click <span className="font-medium">Re-render PDF</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


