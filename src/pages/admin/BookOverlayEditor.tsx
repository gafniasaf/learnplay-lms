import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";

type OverlayJson = {
  paragraphs: Array<{ paragraph_id: string; rewritten: string }>;
};

type CanonicalParagraph = {
  id: string;
  basis: string;
  chapterIndex: number;
  chapterTitle: string;
  sectionTitle: string;
  microTitle?: string | null;
};

function stripHtml(s: string): string {
  return String(s || "").replace(/<[^>]*>/g, "");
}

function collectCanonicalParagraphs(canonical: any): CanonicalParagraph[] {
  const out: CanonicalParagraph[] = [];
  const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const chapterTitle =
      (typeof chapter?.title === "string" && chapter.title) ||
      (typeof chapter?.meta?.title === "string" && chapter.meta.title) ||
      `Chapter ${ci + 1}`;

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
        if (id && basis) {
          out.push({
            id,
            basis,
            chapterIndex: ci,
            chapterTitle,
            sectionTitle: ctx.sectionTitle,
            microTitle: ctx.microTitle ?? null,
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
      // Some sources may place content directly under chapter
      walkBlocks(chapter?.content ?? chapter?.blocks ?? chapter?.items, { sectionTitle: "Chapter", microTitle: null });
    }
  }

  return out;
}

export default function BookOverlayEditor() {
  const { bookId, bookVersionId, overlayId } = useParams<{
    bookId: string;
    bookVersionId: string;
    overlayId: string;
  }>();
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canonical, setCanonical] = useState<any>(null);
  const [paragraphs, setParagraphs] = useState<CanonicalParagraph[]>([]);
  const [rewrites, setRewrites] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [conflicts, setConflicts] = useState<Array<{ paragraph_id: string; expected_hash: string; stored_hash: string }> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [derivedCourseId, setDerivedCourseId] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!bookId || !bookVersionId || !overlayId) return;
    setLoading(true);
    setConflicts(null);
    try {
      const res = await mcp.call("lms.bookVersionInputUrls", {
        bookId,
        bookVersionId,
        overlayId,
        expiresIn: 3600,
      });
      if (!(res as any)?.ok) {
        throw new Error((res as any)?.error?.message || "Failed to fetch signed URLs");
      }

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

      const canonicalParagraphs = collectCanonicalParagraphs(canonicalJson);
      const overlay = (overlayJson || { paragraphs: [] }) as OverlayJson;
      const map: Record<string, string> = {};
      for (const p of overlay.paragraphs || []) {
        if (p && typeof p.paragraph_id === "string" && typeof p.rewritten === "string") {
          map[p.paragraph_id] = p.rewritten;
        }
      }

      setCanonical(canonicalJson);
      setParagraphs(canonicalParagraphs);
      setRewrites(map);
    } catch (e) {
      toast({
        title: "Failed to load overlay",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, bookVersionId, overlayId, mcp, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void load();
  }, [authLoading, isAdmin, navigate, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return paragraphs.filter((p) => {
      const edited = typeof rewrites[p.id] === "string" && rewrites[p.id].trim().length > 0;
      if (onlyEdited && !edited) return false;
      if (!q) return true;
      const hay = [
        p.id,
        p.chapterTitle,
        p.sectionTitle,
        p.microTitle || "",
        stripHtml(p.basis),
        stripHtml(rewrites[p.id] || ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [paragraphs, rewrites, search, onlyEdited]);

  const editedCount = useMemo(() => {
    return Object.values(rewrites).filter((v) => typeof v === "string" && v.trim().length > 0).length;
  }, [rewrites]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllShown = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((p) => next.add(p.id));
      return next;
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const enqueueExerciseGeneration = useCallback(async () => {
    if (!bookId || !bookVersionId || !overlayId) return;
    if (selectedIds.size === 0) {
      toast({ title: "Select paragraphs", description: "Select at least one paragraph to generate exercises from.", variant: "destructive" });
      return;
    }
    const selected = paragraphs.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      toast({ title: "Select paragraphs", description: "No selected paragraphs found in canonical.", variant: "destructive" });
      return;
    }

    const title = typeof canonical?.meta?.title === "string" && canonical.meta.title.trim() ? canonical.meta.title.trim() : bookId;
    const level = canonical?.meta?.level === "n3" || canonical?.meta?.level === "n4" ? canonical.meta.level : "n3";

    const studyText = selected
      .map((p) => {
        const override = typeof rewrites[p.id] === "string" && rewrites[p.id].trim().length > 0 ? rewrites[p.id] : p.basis;
        return stripHtml(override).trim();
      })
      .filter(Boolean)
      .join("\n\n");

    if (!studyText || studyText.length < 20) {
      toast({ title: "Not enough text", description: "Selected paragraphs have insufficient text.", variant: "destructive" });
      return;
    }
    if (studyText.length > 19_000) {
      toast({
        title: "Too much text",
        description: "Selection is too large for exercise generation. Select fewer paragraphs.",
        variant: "destructive",
      });
      return;
    }

    const fallbackId = `book-${bookId}-ex-${crypto.randomUUID().slice(0, 8)}`;
    const outCourseId = (derivedCourseId.trim() || fallbackId).trim();

    setGenerating(true);
    try {
      const resp = await mcp.enqueueJob("ai_course_generate", {
        course_id: outCourseId,
        subject: title,
        grade_band: level,
        grade: level,
        items_per_group: 5,
        mode: "options",
        protocol: "ec-expert",
        notes: `Book-derived exercise generation (book=${bookId}, version=${bookVersionId}, overlay=${overlayId}, paragraphs=${selected.length})`,
        study_text: studyText,
      });

      if (!resp?.ok || !resp.jobId) {
        throw new Error(resp?.error || "enqueue-job failed");
      }

      await mcp.call("lms.bookRegisterDerivedCourse", {
        bookId,
        bookVersionId,
        overlayId,
        courseId: outCourseId,
        jobId: String(resp.jobId),
        paragraphIds: Array.from(selectedIds),
      });

      toast({ title: "Queued", description: `Exercise generation queued (job ${String(resp.jobId).slice(0, 8)}…)` });
      navigate(`/admin/jobs?jobId=${encodeURIComponent(String(resp.jobId))}`);
    } catch (e) {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [bookId, bookVersionId, overlayId, selectedIds, paragraphs, rewrites, canonical, derivedCourseId, mcp, toast, navigate]);

  const handleSave = useCallback(async () => {
    if (!overlayId) return;
    setSaving(true);
    setConflicts(null);
    try {
      const payload = Object.entries(rewrites)
        .map(([paragraph_id, rewritten]) => ({ paragraph_id, rewritten }))
        .filter((x) => typeof x.rewritten === "string" && x.rewritten.trim().length > 0);

      const res = await mcp.call("lms.bookSaveOverlay", {
        overlayId,
        rewrites: { paragraphs: payload },
      });

      if (!(res as any)?.ok) {
        const code = (res as any)?.error?.code;
        if (code === "conflict") {
          setConflicts((res as any)?.error?.conflicts || []);
          toast({
            title: "Conflict",
            description: "Canonical text changed since this overlay was saved. Rebase is required.",
            variant: "destructive",
          });
          return;
        }
        throw new Error((res as any)?.error?.message || "Save failed");
      }

      toast({ title: "Saved", description: `Saved ${payload.length} rewrite(s).` });
      await load();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [overlayId, rewrites, mcp, toast, load]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">Overlay editor</h1>
            <div className="text-xs text-muted-foreground font-mono truncate">
              {bookId} / {bookVersionId} / {overlayId}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/books/${encodeURIComponent(bookId || "")}/versions/${encodeURIComponent(bookVersionId || "")}`)}
              data-cta-id="cta-admin-overlay-back"
              data-action="navigate"
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              data-cta-id="cta-admin-overlay-refresh"
              data-action="action"
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              data-cta-id="cta-admin-overlay-save"
              data-action="action"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : (
                <>
                  {filtered.length} paragraph(s) shown •{" "}
                  <Badge variant="outline">{editedCount} edited</Badge>
                  {" "}
                  • <Badge variant="outline">{selectedCount} selected</Badge>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row gap-3 md:items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by id/title/text…"
              data-cta-id="cta-admin-overlay-search"
            />
            <Button
              variant={onlyEdited ? "default" : "outline"}
              onClick={() => setOnlyEdited((v) => !v)}
              data-cta-id="cta-admin-overlay-only-edited"
              data-action="action"
            >
              {onlyEdited ? "Showing edited" : "Show edited only"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void selectAllShown()}
              data-cta-id="cta-admin-overlay-select-all"
              data-action="action"
            >
              Select shown
            </Button>
            <Button
              variant="outline"
              onClick={() => void clearSelection()}
              data-cta-id="cta-admin-overlay-clear-selection"
              data-action="action"
            >
              Clear selection
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate exercises (from selected paragraphs)</CardTitle>
            <CardDescription>
              Queues an <code>ai_course_generate</code> job using the selected paragraph text as the study text input.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="w-full sm:flex-1 space-y-2">
              <div className="text-sm text-muted-foreground">
                Selected: <span className="font-medium">{selectedCount}</span>
              </div>
              <Input
                value={derivedCourseId}
                onChange={(e) => setDerivedCourseId(e.target.value)}
                placeholder="Optional: output courseId (leave empty to auto-generate)"
                data-cta-id="cta-admin-overlay-derived-courseid"
              />
            </div>
            <Button
              onClick={() => void enqueueExerciseGeneration()}
              disabled={generating}
              data-cta-id="cta-admin-overlay-generate-exercises"
              data-action="action"
            >
              {generating ? "Queuing…" : "Generate exercises"}
            </Button>
          </CardContent>
        </Card>

        {conflicts && conflicts.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Conflicts detected</CardTitle>
              <CardDescription>
                These paragraphs changed in canonical since the overlay hash was recorded.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Rebase is not implemented yet; re-ingest a new book version and create a new overlay.
              </div>
              <ul className="text-xs font-mono space-y-1">
                {conflicts.slice(0, 50).map((c) => (
                  <li key={c.paragraph_id}>
                    {c.paragraph_id} (stored {c.stored_hash.slice(0, 10)}… expected {c.expected_hash.slice(0, 10)}…)
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Paragraph rewrites</CardTitle>
            <CardDescription>
              Edit the rewritten text for any paragraph id. Empty rewrite means “no override”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[65vh] pr-4">
              <div className="space-y-4">
                {filtered.map((p) => {
                  const rewritten = rewrites[p.id] ?? "";
                  return (
                    <div key={p.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs truncate">{p.id}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.chapterTitle} • {p.sectionTitle}
                            {p.microTitle ? ` • ${p.microTitle}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleSelected(p.id)}
                            />
                            Select
                          </label>
                          <Badge variant={rewritten.trim() ? "default" : "outline"}>
                            {rewritten.trim() ? "Edited" : "Default"}
                          </Badge>
                        </div>
                      </div>

                      <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded p-3 border border-border">
                        {stripHtml(p.basis)}
                      </div>

                      <Textarea
                        value={rewritten}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRewrites((prev) => ({ ...prev, [p.id]: v }));
                        }}
                        placeholder="Rewrite override (optional)…"
                        className="min-h-[110px]"
                        data-cta-id={`cta-admin-overlay-rewrite-${p.id}`}
                      />
                    </div>
                  );
                })}

                {filtered.length === 0 && !loading && (
                  <div className="text-center text-muted-foreground py-8">No paragraphs match your filter.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}


