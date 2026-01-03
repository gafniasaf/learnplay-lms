import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type BookRow = {
  id: string;
  title?: string | null;
  level?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BookListResponse =
  | { ok: true; scope: string; books: BookRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

type GetJobResponse =
  | { ok: true; job: any; events: any[]; jobSource: string }
  | { ok: false; error: string };

type BookVersionInputUrlsResponse =
  | {
      ok: true;
      bookId: string;
      bookVersionId: string;
      urls: { skeleton: { path: string; signedUrl: string } | null };
    }
  | { ok: false; error: any; httpStatus?: number };

type BookLibraryImageUrlResponse =
  | { ok: true; bookId: string; urls: Record<string, { storagePath: string; signedUrl: string }>; missing: string[] }
  | { ok: false; error: any; httpStatus?: number };

type SkeletonImagePlaceholder = {
  canonicalSrc: string;
  suggestedPrompt: string;
  caption?: string | null;
  figureNumber?: string | null;
  layoutHint?: string | null;
  chapterIndex?: number | null;
  sectionId?: string | null;
  blockId?: string | null;
};

function extractPlaceholdersFromSkeleton(skeleton: any): SkeletonImagePlaceholder[] {
  const out: SkeletonImagePlaceholder[] = [];
  const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters : [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (const s of sections) {
      const blocks = Array.isArray(s?.blocks) ? s.blocks : [];
      for (const b of blocks) {
        const images = Array.isArray(b?.images) ? b.images : [];
        for (const img of images) {
          const canonicalSrc = safeStr(img?.src).trim();
          if (!canonicalSrc) continue;
          out.push({
            canonicalSrc,
            suggestedPrompt: safeStr(img?.suggestedPrompt).trim(),
            caption: typeof img?.caption === "string" ? img.caption : null,
            figureNumber: typeof img?.figureNumber === "string" ? img.figureNumber : null,
            layoutHint: typeof img?.layoutHint === "string" ? img.layoutHint : null,
            chapterIndex: ci,
            sectionId: safeStr(s?.id) || null,
            blockId: safeStr(b?.id) || null,
          });
        }
      }
    }
  }

  return out;
}

export default function BookStudioGenerate() {
  const navigate = useNavigate();
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

  const [mode, setMode] = useState<"create" | "existing">("create");

  const [books, setBooks] = useState<BookRow[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  const [bookId, setBookId] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<"n3" | "n4">("n3");
  const [language, setLanguage] = useState("nl");
  const [chapterCount, setChapterCount] = useState(8);
  const [topic, setTopic] = useState("");
  const [userInstructions, setUserInstructions] = useState("");

  // Required for the chapter generator job (fail-loud backend).
  const [writeModel, setWriteModel] = useState("anthropic:claude-sonnet-4-5");

  // Pipeline tracking
  const [rootJobId, setRootJobId] = useState<string>("");
  const [activeJobId, setActiveJobId] = useState<string>("");
  const [activeJob, setActiveJob] = useState<any>(null);
  const [activeEvents, setActiveEvents] = useState<any[]>([]);
  const [pipelineBookId, setPipelineBookId] = useState<string>("");
  const [pipelineBookVersionId, setPipelineBookVersionId] = useState<string>("");
  const [pipelineChapterCount, setPipelineChapterCount] = useState<number | null>(null);
  const [pipelineDone, setPipelineDone] = useState<boolean>(false);

  const [skeleton, setSkeleton] = useState<any>(null);
  const [placeholders, setPlaceholders] = useState<SkeletonImagePlaceholder[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const [busyBySrc, setBusyBySrc] = useState<Set<string>>(new Set());

  const activeJobPollTimer = useRef<number | null>(null);

  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    try {
      const res = (await mcp.callGet("lms.bookList", {
        scope: "books",
        limit: "200",
        offset: "0",
      })) as BookListResponse;
      if ((res as any)?.ok !== true) throw new Error((res as any)?.error?.message || "Failed to load books");
      setBooks(Array.isArray((res as any).books) ? (res as any).books : []);
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

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void loadBooks();
  }, [authLoading, isAdmin, loadBooks, navigate]);

  const selectedBook = useMemo(() => books.find((b) => b.id === bookId) || null, [books, bookId]);

  // When switching to existing mode, default bookId to the first book.
  useEffect(() => {
    if (mode !== "existing") return;
    if (bookId) return;
    const first = books[0]?.id;
    if (first) setBookId(first);
  }, [mode, books, bookId]);

  // Keep level in sync with selected existing book (but allow user to override).
  useEffect(() => {
    if (mode !== "existing") return;
    const lv = safeStr(selectedBook?.level).trim();
    if (lv === "n3" || lv === "n4") setLevel(lv);
  }, [mode, selectedBook]);

  const backToLibrary = useCallback(() => navigate("/admin/book-studio"), [navigate]);

  const startGeneration = useCallback(async () => {
    setPipelineDone(false);
    setSkeleton(null);
    setPlaceholders([]);
    setImageUrls({});
    setMissing(new Set());

    try {
      const id = bookId.trim();
      if (!id) throw new Error("bookId is required");
      const lang = language.trim();
      if (!lang) throw new Error("language is required");
      if (!topic.trim()) throw new Error("topic is required");
      if (!writeModel.trim()) throw new Error("writeModel is required (e.g. anthropic:claude-sonnet-4-5)");
      if (mode === "create" && !title.trim()) throw new Error("title is required for create mode");
      if (chapterCount <= 0) throw new Error("chapterCount must be > 0");

      const payload: Record<string, unknown> = {
        mode,
        bookId: id,
        ...(mode === "create" ? { title: title.trim() } : {}),
        level,
        language: lang,
        chapterCount,
        topic: topic.trim(),
        ...(userInstructions.trim() ? { userInstructions: userInstructions.trim() } : {}),
        writeModel: writeModel.trim(),
      };

      const res = await mcp.enqueueJob("book_generate_full", payload);
      if (!res?.ok || !res.jobId) throw new Error(res?.error || "Failed to enqueue job");

      setRootJobId(res.jobId);
      setActiveJobId(res.jobId);
      toast({ title: "Queued", description: "Book generation job queued." });
    } catch (e) {
      toast({
        title: "Generate failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [bookId, chapterCount, language, level, mcp, mode, title, toast, topic, userInstructions, writeModel]);

  const stopPolling = useCallback(() => {
    if (activeJobPollTimer.current) {
      window.clearInterval(activeJobPollTimer.current);
      activeJobPollTimer.current = null;
    }
  }, []);

  const pollJobOnce = useCallback(
    async (jobIdToPoll: string) => {
      if (!jobIdToPoll) return;
      const res = (await mcp.callGet("lms.getJob", {
        id: jobIdToPoll,
        eventsLimit: "200",
      })) as GetJobResponse;
      if ((res as any)?.ok !== true) throw new Error((res as any)?.error || "Failed to load job");

      const job = (res as any).job;
      const events = Array.isArray((res as any).events) ? (res as any).events : [];
      setActiveJob(job);
      setActiveEvents(events);

      const status = safeStr(job?.status);
      if (status === "done") {
        const jobType = safeStr(job?.job_type);
        const result = job?.result ?? null;

        if (jobType === "book_generate_full") {
          const nextJobId = safeStr(result?.firstChapterJobId);
          const bId = safeStr(result?.bookId);
          const bvId = safeStr(result?.bookVersionId);
          const cc = typeof result?.chapterCount === "number" ? result.chapterCount : null;
          if (bId) setPipelineBookId(bId);
          if (bvId) setPipelineBookVersionId(bvId);
          if (cc !== null) setPipelineChapterCount(cc);

          if (nextJobId) {
            setActiveJobId(nextJobId);
            return;
          }
        }

        if (jobType === "book_generate_chapter") {
          const bId = safeStr(result?.bookId);
          const bvId = safeStr(result?.bookVersionId);
          if (bId) setPipelineBookId(bId);
          if (bvId) setPipelineBookVersionId(bvId);

          const nextJobId = safeStr(result?.nextChapterJobId);
          const done = result?.done === true;
          if (nextJobId) {
            setActiveJobId(nextJobId);
            return;
          }
          if (done) {
            setPipelineDone(true);
            stopPolling();
          }
        }
      }

      if (status === "failed" || status === "dead_letter") {
        setPipelineDone(true);
        stopPolling();
      }
    },
    [mcp, stopPolling],
  );

  useEffect(() => {
    stopPolling();
    if (!activeJobId) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        await pollJobOnce(activeJobId);
      } catch (e) {
        // Stop spamming; show once.
        stopPolling();
        toast({
          title: "Job polling failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

    void tick();
    activeJobPollTimer.current = window.setInterval(tick, 2000);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [activeJobId, pollJobOnce, stopPolling, toast]);

  const loadSkeletonAndImages = useCallback(async () => {
    const bId = pipelineBookId.trim();
    const bvId = pipelineBookVersionId.trim();
    if (!bId || !bvId) return;

    try {
      const urlsRes = (await mcp.call("lms.bookVersionInputUrls", {
        bookId: bId,
        bookVersionId: bvId,
        expiresIn: 3600,
        target: "book",
        allowMissingImages: true,
      })) as BookVersionInputUrlsResponse;
      if ((urlsRes as any)?.ok !== true) throw new Error((urlsRes as any)?.error?.message || "Failed to sign URLs");
      const skUrl = safeStr((urlsRes as any)?.urls?.skeleton?.signedUrl);
      if (!skUrl) throw new Error("Missing skeleton URL (skeleton not saved yet?)");

      const r = await fetch(skUrl);
      if (!r.ok) throw new Error(`Failed to download skeleton (${r.status})`);
      const j = await r.json().catch(() => null);
      if (!j || typeof j !== "object") throw new Error("Invalid skeleton JSON");
      setSkeleton(j);

      const ph = extractPlaceholdersFromSkeleton(j);
      setPlaceholders(ph);

      const unique = Array.from(new Set(ph.map((x) => x.canonicalSrc))).slice(0, 200);
      if (unique.length === 0) {
        setImageUrls({});
        setMissing(new Set());
        return;
      }

      const imgRes = (await mcp.call("lms.bookLibraryImageUrl", {
        bookId: bId,
        canonicalSrcs: unique,
        expiresIn: 3600,
      })) as BookLibraryImageUrlResponse;
      if ((imgRes as any)?.ok !== true) throw new Error((imgRes as any)?.error?.message || "Failed to resolve image URLs");

      const urls = (imgRes as any)?.urls || {};
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(urls)) {
        const signedUrl = safeStr((v as any)?.signedUrl);
        if (signedUrl) map[k] = signedUrl;
      }
      setImageUrls(map);
      const missingArr = Array.isArray((imgRes as any)?.missing) ? ((imgRes as any).missing as string[]) : [];
      setMissing(new Set(missingArr));
    } catch (e) {
      toast({
        title: "Failed to load skeleton/images",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [mcp, pipelineBookId, pipelineBookVersionId, toast]);

  useEffect(() => {
    if (!pipelineDone) return;
    if (!pipelineBookId || !pipelineBookVersionId) return;
    void loadSkeletonAndImages();
  }, [pipelineDone, pipelineBookId, pipelineBookVersionId, loadSkeletonAndImages]);

  const uploadImageForSrc = useCallback(
    async (canonicalSrc: string, file: File | null) => {
      const bId = pipelineBookId.trim();
      if (!bId || !canonicalSrc || !file) return;
      setBusyBySrc((prev) => new Set(prev).add(canonicalSrc));
      try {
        const res = await mcp.call("lms.bookLibraryUploadUrl", { bookId: bId, canonicalSrc, fileName: file.name });
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

        const link = await mcp.call("lms.bookLibraryUpsertIndex", { bookId: bId, mappings: [{ canonicalSrc, storagePath, action: "upsert" }] });
        if (!(link as any)?.ok) throw new Error((link as any)?.error?.message || "Failed to link image");

        const signed = await mcp.call("lms.bookLibraryStorageUrl", { bookId: bId, storagePath, expiresIn: 3600 });
        if (!(signed as any)?.ok) throw new Error((signed as any)?.error?.message || "Failed to sign image URL");
        const signedUrl = safeStr((signed as any)?.signedUrl);
        if (!signedUrl) throw new Error("Missing signedUrl");

        setImageUrls((prev) => ({ ...prev, [canonicalSrc]: signedUrl }));
        setMissing((prev) => {
          const next = new Set(prev);
          next.delete(canonicalSrc);
          return next;
        });

        toast({ title: "Uploaded", description: "Image uploaded + linked. Re-render to apply." });
      } catch (e) {
        toast({
          title: "Upload failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setBusyBySrc((prev) => {
          const next = new Set(prev);
          next.delete(canonicalSrc);
          return next;
        });
      }
    },
    [mcp, pipelineBookId, toast],
  );

  const aiGenerateImageForSrc = useCallback(
    async (canonicalSrc: string, prompt: string) => {
      const bId = pipelineBookId.trim();
      if (!bId || !canonicalSrc || !prompt.trim()) return;
      setBusyBySrc((prev) => new Set(prev).add(canonicalSrc));
      try {
        const res = await mcp.call("lms.bookLibraryGenerateImage", { bookId: bId, canonicalSrc, prompt: prompt.trim() });
        if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "AI generation failed");
        const signedUrl = safeStr((res as any)?.signedUrl);
        if (!signedUrl) throw new Error("Missing signedUrl");

        setImageUrls((prev) => ({ ...prev, [canonicalSrc]: signedUrl }));
        setMissing((prev) => {
          const next = new Set(prev);
          next.delete(canonicalSrc);
          return next;
        });

        toast({ title: "Generated", description: "AI image generated + linked. Re-render to apply." });
      } catch (e) {
        toast({
          title: "AI image failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setBusyBySrc((prev) => {
          const next = new Set(prev);
          next.delete(canonicalSrc);
          return next;
        });
      }
    },
    [mcp, pipelineBookId, toast],
  );

  const openGeneratedVersion = useCallback(() => {
    const bId = pipelineBookId.trim();
    const bvId = pipelineBookVersionId.trim();
    if (!bId) return;
    const qs = new URLSearchParams();
    if (bvId) qs.set("bookVersionId", bvId);
    navigate(`/admin/book-studio/${encodeURIComponent(bId)}${qs.toString() ? `?${qs.toString()}` : ""}`);
  }, [navigate, pipelineBookId, pipelineBookVersionId]);

  const activeStatus = safeStr(activeJob?.status) || (activeJobId ? "loading" : "");
  const activeJobType = safeStr(activeJob?.job_type);
  const activeError = safeStr(activeJob?.error);

  const lastEvent = useMemo(() => {
    const ev = Array.isArray(activeEvents) ? activeEvents : [];
    return ev.length ? ev[ev.length - 1] : null;
  }, [activeEvents]);

  const progress = typeof lastEvent?.progress === "number" ? Math.max(0, Math.min(100, Math.floor(lastEvent.progress))) : null;
  const progressMsg = safeStr(lastEvent?.message);

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
            <h1 className="text-2xl font-bold truncate">Generate Full Book</h1>
            <div className="text-xs text-muted-foreground">
              Skeleton-first pipeline. Images are created as placeholders with suggested prompts (no image generation during generation).
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={backToLibrary} data-cta-id="cta-bookgen-back" data-action="navigate" data-target="/admin/book-studio">
              Back
            </Button>
            <Button variant="outline" onClick={() => void loadBooks()} disabled={loadingBooks} data-cta-id="cta-bookgen-refresh-books" data-action="action">
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Choose what to generate and how.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={mode === "create" ? "default" : "outline"}
                onClick={() => setMode("create")}
                data-cta-id="cta-bookgen-mode-create"
                data-action="action"
              >
                Create new book + version
              </Button>
              <Button
                size="sm"
                variant={mode === "existing" ? "default" : "outline"}
                onClick={() => setMode("existing")}
                data-cta-id="cta-bookgen-mode-existing"
                data-action="action"
              >
                New version for existing book
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bookId">Book ID</Label>
                {mode === "existing" ? (
                  <select
                    id="bookId"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                    data-cta-id="cta-bookgen-bookid"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} {b.title ? `— ${b.title}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="bookId"
                    value={bookId}
                    onChange={(e) => setBookId(e.target.value)}
                    placeholder="e.g. anatomy-n3"
                    data-cta-id="cta-bookgen-bookid"
                  />
                )}
                {mode === "existing" && selectedBook ? (
                  <div className="text-xs text-muted-foreground">
                    Existing book: <span className="font-medium">{selectedBook.title || selectedBook.id}</span>{" "}
                    {selectedBook.level ? <Badge variant="secondary">{selectedBook.level}</Badge> : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={mode === "existing" ? "(optional) override title" : "Book title"}
                  data-cta-id="cta-bookgen-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <select
                  id="level"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={level}
                  onChange={(e) => setLevel(e.target.value === "n4" ? "n4" : "n3")}
                  data-cta-id="cta-bookgen-level"
                >
                  <option value="n3">n3</option>
                  <option value="n4">n4</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Input
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="e.g. nl"
                  data-cta-id="cta-bookgen-language"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="chapterCount">Chapters</Label>
                <Input
                  id="chapterCount"
                  type="number"
                  min={1}
                  max={50}
                  value={chapterCount}
                  onChange={(e) => setChapterCount(Number(e.target.value))}
                  data-cta-id="cta-bookgen-chapters"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="writeModel">Write model (required)</Label>
                <Input
                  id="writeModel"
                  value={writeModel}
                  onChange={(e) => setWriteModel(e.target.value)}
                  placeholder="anthropic:claude-sonnet-4-5 or openai:gpt-4o"
                  data-cta-id="cta-bookgen-write-model"
                />
                <div className="text-xs text-muted-foreground">
                  Use `anthropic:&lt;model&gt;` or `openai:&lt;model&gt;`. The backend fails loudly if the matching API key is missing.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic">Topic (required)</Label>
              <Textarea id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should this book cover?" data-cta-id="cta-bookgen-topic" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="userInstructions">User instructions (optional)</Label>
              <Textarea
                id="userInstructions"
                value={userInstructions}
                onChange={(e) => setUserInstructions(e.target.value)}
                placeholder="Tone, constraints, must-include topics, etc."
                data-cta-id="cta-bookgen-user-instructions"
              />
            </div>

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void startGeneration()} data-cta-id="cta-bookgen-start" data-action="enqueueJob" data-job-type="book_generate_full">
                Generate
              </Button>
              {rootJobId ? (
                <div className="text-xs text-muted-foreground font-mono">
                  rootJobId={rootJobId} {activeJobId && activeJobId !== rootJobId ? `• activeJobId=${activeJobId}` : ""}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {activeJobId ? (
          <Card>
            <CardHeader>
              <CardTitle>Pipeline status</CardTitle>
              <CardDescription>Live job events from the factory queue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={activeStatus === "done" ? "default" : activeStatus === "failed" ? "destructive" : "secondary"}>
                  {activeStatus || "—"}
                </Badge>
                {activeJobType ? <Badge variant="outline">{activeJobType}</Badge> : null}
                {progress !== null ? <Badge variant="outline">{progress}%</Badge> : null}
                {pipelineBookId ? <Badge variant="outline">bookId={pipelineBookId}</Badge> : null}
                {pipelineBookVersionId ? <Badge variant="outline">bookVersionId={pipelineBookVersionId}</Badge> : null}
                {pipelineChapterCount !== null ? <Badge variant="outline">chapters={pipelineChapterCount}</Badge> : null}
              </div>
              {progressMsg ? <div className="text-sm">{progressMsg}</div> : null}
              {activeError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
                  <div className="font-medium text-destructive">Failed</div>
                  <div className="text-xs text-muted-foreground mt-1">{activeError}</div>
                </div>
              ) : null}
              {pipelineDone && pipelineBookId && pipelineBookVersionId ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={openGeneratedVersion} data-cta-id="cta-bookgen-open-book" data-action="navigate">
                    Open in Book Studio
                  </Button>
                  <Button variant="outline" onClick={() => void loadSkeletonAndImages()} data-cta-id="cta-bookgen-refresh-skeleton" data-action="action">
                    Refresh skeleton + images
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {pipelineDone && skeleton ? (
          <Card>
            <CardHeader>
              <CardTitle>Image placeholders</CardTitle>
              <CardDescription>
                Upload an existing image or AI-generate an image using the suggested prompt. This does not re-render PDFs automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {placeholders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No image placeholders found in skeleton yet.</div>
              ) : (
                <div className="space-y-3">
                  {placeholders.slice(0, 200).map((ph, idx) => {
                    const url = imageUrls[ph.canonicalSrc];
                    const isMissing = missing.has(ph.canonicalSrc) || !url;
                    const busy = busyBySrc.has(ph.canonicalSrc);
                    const prompt = ph.suggestedPrompt || "";
                    return (
                      <div key={`${ph.canonicalSrc}:${idx}`} className="rounded-lg border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-mono break-all">{ph.canonicalSrc}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {ph.figureNumber ? `Figure ${ph.figureNumber}` : "Figure"}{" "}
                              {ph.chapterIndex !== null && ph.chapterIndex !== undefined ? `• chapter ${ph.chapterIndex + 1}` : ""}
                              {ph.blockId ? ` • ${ph.blockId}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={isMissing ? "destructive" : "secondary"}>{isMissing ? "missing" : "linked"}</Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3 mt-3">
                          <div className="rounded-md border bg-muted/30 overflow-hidden flex items-center justify-center h-[120px]">
                            {url ? (
                              <img src={url} alt={ph.canonicalSrc} className="h-full w-full object-cover" />
                            ) : (
                              <div className="text-xs text-muted-foreground">No preview</div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-medium">Suggested prompt</div>
                            <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {prompt || "— (no suggestion provided yet)"}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "image/*";
                                  input.onchange = () => {
                                    const f = input.files && input.files[0] ? input.files[0] : null;
                                    void uploadImageForSrc(ph.canonicalSrc, f);
                                  };
                                  input.click();
                                }}
                                data-cta-id={`cta-bookgen-image-upload-${idx}`}
                                data-action="action"
                              >
                                {busy ? "Uploading…" : "Upload"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || !prompt.trim()}
                                onClick={() => void aiGenerateImageForSrc(ph.canonicalSrc, prompt)}
                                data-cta-id={`cta-bookgen-image-ai-${idx}`}
                                data-action="action"
                              >
                                {busy ? "Generating…" : "AI Generate"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  );
}


