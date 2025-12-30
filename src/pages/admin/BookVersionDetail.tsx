import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";

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
  created_at?: string;
  updated_at?: string;
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
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
};

type BookOverlayRow = {
  id: string;
  book_id: string;
  book_version_id: string;
  overlay_path: string;
  label?: string | null;
  created_at?: string;
  updated_at?: string;
};

type BookElearningLinkRow = {
  id: string;
  kind: string;
  course_id: string;
  study_text_id?: string | null;
  derived_job_id?: string | null;
  stale: boolean;
  stale_reason?: string | null;
  updated_at?: string;
  created_at?: string;
};

export default function BookVersionDetail() {
  const { bookId, bookVersionId } = useParams<{ bookId: string; bookVersionId: string }>();
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
  const [version, setVersion] = useState<BookVersionRow | null>(null);
  const [runs, setRuns] = useState<BookRunRow[]>([]);
  const [overlays, setOverlays] = useState<BookOverlayRow[]>([]);
  const [links, setLinks] = useState<BookElearningLinkRow[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string>("none");

  const [chapterIndexRaw, setChapterIndexRaw] = useState("0");
  const [enqueueing, setEnqueueing] = useState(false);
  const [creatingOverlay, setCreatingOverlay] = useState(false);
  const [newOverlayLabel, setNewOverlayLabel] = useState("");
  const [exportCourseId, setExportCourseId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [renderProvider, setRenderProvider] = useState<"prince_local" | "docraptor_api">("prince_local");
  const [allowMissingImages, setAllowMissingImages] = useState(true);

  const load = useCallback(async () => {
    if (!bookId || !bookVersionId) return;
    setLoading(true);
    try {
      const [versionsRes, runsRes, overlaysRes, linksRes] = await Promise.all([
        mcp.callGet("lms.bookList", { scope: "versions", bookId, limit: "200", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "runs", bookId, bookVersionId, limit: "200", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "overlays", bookId, bookVersionId, limit: "200", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "links", bookId, bookVersionId, limit: "200", offset: "0" }) as Promise<any>,
      ]);

      if (versionsRes?.ok !== true) throw new Error(versionsRes?.error?.message || "Failed to load versions");
      if (runsRes?.ok !== true) throw new Error(runsRes?.error?.message || "Failed to load runs");
      if (overlaysRes?.ok !== true) throw new Error(overlaysRes?.error?.message || "Failed to load overlays");
      if (linksRes?.ok !== true) throw new Error(linksRes?.error?.message || "Failed to load links");

      const match =
        (versionsRes?.versions as BookVersionRow[] | undefined)?.find((v) => v.book_version_id === bookVersionId) || null;
      setVersion(match);
      setRuns((runsRes?.runs as BookRunRow[] | undefined) || []);
      setOverlays((overlaysRes?.overlays as BookOverlayRow[] | undefined) || []);
      setLinks((linksRes?.links as BookElearningLinkRow[] | undefined) || []);
    } catch (e) {
      toast({
        title: "Failed to load version",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, bookVersionId, mcp, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void load();
  }, [authLoading, isAdmin, navigate, load]);

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [runs]);

  const sortedLinks = useMemo(() => {
    return [...links].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }, [links]);

  const enqueue = useCallback(async (target: "chapter" | "book") => {
    if (!bookId || !bookVersionId) return;
    setEnqueueing(true);
    try {
      const payload: any = {
        bookId,
        bookVersionId,
        target,
      };
      payload.renderProvider = renderProvider;
      if (allowMissingImages) payload.allowMissingImages = true;
      if (selectedOverlayId && selectedOverlayId !== "none") {
        payload.overlayId = selectedOverlayId;
      }
      if (target === "chapter") {
        const n = Number(chapterIndexRaw);
        if (!Number.isFinite(n) || n < 0) {
          toast({ title: "Invalid chapter index", description: "chapterIndex must be a non-negative number.", variant: "destructive" });
          return;
        }
        payload.chapterIndex = Math.floor(n);
      }

      const res = await mcp.call("lms.bookEnqueueRender", payload);
      if (!(res as any)?.ok) {
        throw new Error((res as any)?.error?.message || "Enqueue failed");
      }

      const runId = (res as any)?.runId as string | undefined;
      toast({ title: "Queued", description: "Render run queued." });
      await load();
      if (runId) {
        navigate(`/admin/books/${encodeURIComponent(bookId)}/runs/${encodeURIComponent(runId)}`);
      }
    } catch (e) {
      toast({
        title: "Enqueue failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setEnqueueing(false);
    }
  }, [bookId, bookVersionId, chapterIndexRaw, selectedOverlayId, renderProvider, allowMissingImages, mcp, toast, load, navigate]);

  const createOverlay = useCallback(async () => {
    if (!bookId || !bookVersionId) return;
    setCreatingOverlay(true);
    try {
      const label = newOverlayLabel.trim() || `Overlay ${new Date().toLocaleString()}`;
      const res = await mcp.call("lms.bookCreateOverlay", { bookId, bookVersionId, label });
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Create overlay failed");
      const createdId = (res as any)?.overlayId as string | undefined;
      toast({ title: "Overlay created" });
      setNewOverlayLabel("");
      await load();
      if (createdId) {
        navigate(
          `/admin/books/${encodeURIComponent(bookId)}/versions/${encodeURIComponent(bookVersionId)}/overlays/${encodeURIComponent(createdId)}`
        );
      }
    } catch (e) {
      toast({
        title: "Create overlay failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreatingOverlay(false);
    }
  }, [bookId, bookVersionId, newOverlayLabel, mcp, toast, load, navigate]);

  const exportStudyTextsToCourse = useCallback(async () => {
    if (!bookId || !bookVersionId) return;
    const courseId = exportCourseId.trim();
    if (!courseId) {
      toast({ title: "Course ID required", description: "Enter a target courseId to export study texts into.", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const payload: any = {
        bookId,
        bookVersionId,
        courseId,
        mode: "chapter",
      };
      if (selectedOverlayId && selectedOverlayId !== "none") {
        payload.overlayId = selectedOverlayId;
      }
      const res = await mcp.call("lms.bookExportStudytexts", payload);
      if (!(res as any)?.ok) throw new Error((res as any)?.error?.message || "Export failed");
      toast({ title: "Exported", description: "Study texts were exported into the course." });
      navigate(`/admin/editor/${encodeURIComponent(courseId)}`);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }, [bookId, bookVersionId, exportCourseId, selectedOverlayId, mcp, toast, navigate]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Book Version</h1>
            <p className="text-sm text-muted-foreground font-mono">{bookVersionId}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/books/${encodeURIComponent(bookId || "")}`)}
              data-cta-id="cta-admin-bookversion-back"
              data-action="navigate"
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              data-cta-id="cta-admin-bookversion-refresh"
              data-action="action"
            >
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Version metadata</CardTitle>
            <CardDescription>{loading ? "Loading…" : "Paths + status"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground">Status</div>
                <div className="font-medium">
                  <Badge variant="outline">{version?.status || "—"}</Badge>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Schema</div>
                <div className="font-medium">{version?.schema_version || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Canonical path</div>
                <div className="font-mono text-xs break-all">{version?.canonical_path || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Figures path</div>
                <div className="font-mono text-xs break-all">{version?.figures_path || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Design tokens path</div>
                <div className="font-mono text-xs break-all">{version?.design_tokens_path || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Created</div>
                <div className="font-medium">{version?.created_at ? new Date(version.created_at).toLocaleString() : "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Render</CardTitle>
            <CardDescription>Queue a chapter or a full book render run.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="w-full sm:w-48 space-y-2">
                <Label htmlFor="chapterIndex">Chapter index</Label>
                <Input
                  id="chapterIndex"
                  value={chapterIndexRaw}
                  onChange={(e) => setChapterIndexRaw(e.target.value)}
                  placeholder="0"
                  data-cta-id="cta-admin-bookversion-chapterindex"
                />
              </div>
              <div className="w-full sm:w-72 space-y-2">
                <Label htmlFor="overlayId">Overlay (optional)</Label>
                <Input
                  id="overlayId"
                  value={selectedOverlayId}
                  onChange={(e) => setSelectedOverlayId(e.target.value)}
                  placeholder="none or overlay uuid"
                  data-cta-id="cta-admin-bookversion-overlayid"
                />
              </div>
              <div className="w-full sm:w-56 space-y-2">
                <Label htmlFor="renderProvider">Render provider</Label>
                <Input
                  id="renderProvider"
                  value={renderProvider}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setRenderProvider(v === "docraptor_api" ? "docraptor_api" : "prince_local");
                  }}
                  placeholder="prince_local"
                  data-cta-id="cta-admin-bookversion-render-provider"
                />
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="allowMissingImages"
                    checked={allowMissingImages}
                    onCheckedChange={(v) => setAllowMissingImages(v === true)}
                    data-cta-id="cta-admin-bookversion-allow-missing-images"
                    data-action="action"
                  />
                  <Label htmlFor="allowMissingImages" className="cursor-pointer">
                    Allow missing images (placeholders)
                  </Label>
                </div>
              </div>
              <Button
                onClick={() => void enqueue("chapter")}
                disabled={enqueueing}
                data-cta-id="cta-admin-bookversion-enqueue-chapter"
                data-action="action"
              >
                Render Chapter
              </Button>
              <Button
                variant="outline"
                onClick={() => void enqueue("book")}
                disabled={enqueueing}
                data-cta-id="cta-admin-bookversion-enqueue-book"
                data-action="action"
              >
                Render Full Book
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>E-learning linkage</CardTitle>
            <CardDescription>Export this book version into an existing Course’s study texts.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="w-full sm:flex-1 space-y-2">
              <Label htmlFor="exportCourseId">Target courseId</Label>
              <Input
                id="exportCourseId"
                value={exportCourseId}
                onChange={(e) => setExportCourseId(e.target.value)}
                placeholder="Existing course id"
                data-cta-id="cta-admin-bookversion-export-courseid"
              />
            </div>
            <Button
              onClick={() => void exportStudyTextsToCourse()}
              disabled={exporting}
              data-cta-id="cta-admin-bookversion-export-studytexts"
              data-action="action"
            >
              {exporting ? "Exporting…" : "Export StudyTexts"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked outputs</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${sortedLinks.length} link(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLinks.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{l.course_id}</TableCell>
                    <TableCell>
                      <Badge variant={l.stale ? "destructive" : "outline"}>{l.stale ? "stale" : "fresh"}</Badge>
                      {l.stale_reason ? <div className="text-xs text-muted-foreground mt-1">{l.stale_reason}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.updated_at ? new Date(l.updated_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {l.derived_job_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/jobs?jobId=${encodeURIComponent(String(l.derived_job_id))}`)}
                            data-cta-id={`cta-admin-bookversion-open-job-${l.id}`}
                            data-action="navigate"
                          >
                            Job
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/editor/${encodeURIComponent(l.course_id)}`)}
                          data-cta-id={`cta-admin-bookversion-open-course-${l.id}`}
                          data-action="navigate"
                        >
                          Open
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {sortedLinks.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No linked outputs yet. Export study texts or generate exercises from an overlay.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overlays</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${overlays.length} overlay(s)`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="w-full sm:flex-1 space-y-2">
                <Label htmlFor="newOverlayLabel">New overlay label</Label>
                <Input
                  id="newOverlayLabel"
                  value={newOverlayLabel}
                  onChange={(e) => setNewOverlayLabel(e.target.value)}
                  placeholder="e.g. Round 1 edits"
                  data-cta-id="cta-admin-bookversion-new-overlay-label"
                />
              </div>
              <Button
                onClick={() => void createOverlay()}
                disabled={creatingOverlay}
                data-cta-id="cta-admin-bookversion-create-overlay"
                data-action="action"
              >
                {creatingOverlay ? "Creating…" : "Create overlay"}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Overlay Id</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overlays.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.label || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{o.id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.updated_at ? new Date(o.updated_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            `/admin/books/${encodeURIComponent(bookId || "")}/versions/${encodeURIComponent(
                              bookVersionId || ""
                            )}/overlays/${encodeURIComponent(o.id)}`
                          )
                        }
                        data-cta-id={`cta-admin-bookversion-open-overlay-${o.id}`}
                        data-action="navigate"
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {overlays.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No overlays yet. Create one above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runs</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${sortedRuns.length} run(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRuns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                      {r.error ? <div className="text-xs text-destructive mt-1">{r.error}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.target}</TableCell>
                    <TableCell className="text-muted-foreground">{r.render_provider}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof r.progress_percent === "number" ? `${r.progress_percent}%` : "—"}{" "}
                      {r.progress_stage ? `(${r.progress_stage})` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/books/${encodeURIComponent(bookId || "")}/runs/${encodeURIComponent(r.id)}`)}
                        data-cta-id={`cta-admin-bookversion-open-run-${r.id}`}
                        data-action="navigate"
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sortedRuns.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No runs yet. Queue one above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}


