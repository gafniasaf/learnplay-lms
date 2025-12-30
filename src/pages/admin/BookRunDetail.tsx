import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";

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

type BookJobRow = {
  id: string;
  run_id: string;
  book_id: string;
  book_version_id: string;
  target: string;
  chapter_index?: number | null;
  status: string;
  progress_stage?: string | null;
  progress_percent: number;
  progress_message?: string | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  processing_duration_ms?: number | null;
  created_at?: string;
};

type BookRunChapterRow = {
  id: string;
  run_id: string;
  chapter_index: number;
  status: string;
  progress_stage?: string | null;
  progress_percent: number;
  progress_message?: string | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
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
  created_at?: string;
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

export default function BookRunDetail() {
  const { bookId, runId } = useParams<{ bookId: string; runId: string }>();
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
  const [run, setRun] = useState<BookRunRow | null>(null);
  const [jobs, setJobs] = useState<BookJobRow[]>([]);
  const [chapters, setChapters] = useState<BookRunChapterRow[]>([]);
  const [artifacts, setArtifacts] = useState<BookArtifactRow[]>([]);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [layoutReport, setLayoutReport] = useState<LayoutReport | null>(null);
  const [layoutReportLoading, setLayoutReportLoading] = useState(false);
  const [fixingByKey, setFixingByKey] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!bookId || !runId) return;
    setLoading(true);
    try {
      const [runsRes, jobsRes, chaptersRes, artifactsRes] = await Promise.all([
        mcp.callGet("lms.bookList", { scope: "runs", bookId, limit: "500", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "jobs", runId, bookId, limit: "500", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "run-chapters", runId, bookId, limit: "500", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "artifacts", runId, bookId, limit: "500", offset: "0" }) as Promise<any>,
      ]);

      if (runsRes?.ok !== true) throw new Error(runsRes?.error?.message || "Failed to load runs");
      if (jobsRes?.ok !== true) throw new Error(jobsRes?.error?.message || "Failed to load jobs");
      if (chaptersRes?.ok !== true) throw new Error(chaptersRes?.error?.message || "Failed to load run chapters");
      if (artifactsRes?.ok !== true) throw new Error(artifactsRes?.error?.message || "Failed to load artifacts");

      const match =
        (runsRes?.runs as BookRunRow[] | undefined)?.find((r) => r.id === runId) || null;
      setRun(match);
      setJobs((jobsRes?.jobs as BookJobRow[] | undefined) || []);
      setChapters((chaptersRes?.chapters as BookRunChapterRow[] | undefined) || []);
      setArtifacts((artifactsRes?.artifacts as BookArtifactRow[] | undefined) || []);
    } catch (e) {
      toast({
        title: "Failed to load run",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, runId, mcp, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void load();
  }, [authLoading, isAdmin, navigate, load]);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }, [jobs]);

  const sortedArtifacts = useMemo(() => {
    return [...artifacts].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [artifacts]);

  const latestLayoutReportArtifact = useMemo(() => {
    return sortedArtifacts.find((a) => a.kind === "layout_report") || null;
  }, [sortedArtifacts]);

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
    void loadLayoutReport();
  }, [loadLayoutReport]);

  const downloadArtifact = useCallback(async (artifactId: string) => {
    setDownloading((prev) => new Set(prev).add(artifactId));
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
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(artifactId);
        return next;
      });
    }
  }, [mcp, toast]);

  const missingImages = useMemo(() => {
    const arr = layoutReport?.missingImages;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((m) => (m && typeof m === "object" ? m : null))
      .filter(Boolean) as NonNullable<LayoutReport["missingImages"]>;
  }, [layoutReport]);

  const uploadMissingImage = useCallback(async (canonicalSrc: string, file: File) => {
    if (!bookId) return;
    const key = `upload:${canonicalSrc}`;
    setFixingByKey((prev) => new Set(prev).add(key));
    try {
      const res = await mcp.call("lms.bookLibraryUploadUrl", { bookId, canonicalSrc, fileName: file.name });
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

      const link = await mcp.call("lms.bookLibraryUpsertIndex", { bookId, mappings: [{ canonicalSrc, storagePath }] });
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
  }, [bookId, mcp, toast]);

  const aiGenerateMissingImage = useCallback(async (canonicalSrc: string) => {
    if (!bookId) return;
    const prompt = window.prompt(`AI image prompt for:\n${canonicalSrc}\n\nDescribe what this figure should show:`);
    if (!prompt || !prompt.trim()) return;

    const key = `ai:${canonicalSrc}`;
    setFixingByKey((prev) => new Set(prev).add(key));
    try {
      const res = await mcp.call("lms.bookLibraryGenerateImage", { bookId, canonicalSrc, prompt: prompt.trim() });
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
  }, [bookId, mcp, toast]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Run</h1>
            <p className="text-sm text-muted-foreground font-mono">{runId}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/books/${encodeURIComponent(bookId || "")}`)}
              data-cta-id="cta-admin-bookrun-back"
              data-action="navigate"
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              data-cta-id="cta-admin-bookrun-refresh"
              data-action="action"
            >
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Run status</CardTitle>
            <CardDescription>{loading ? "Loading…" : "Progress + errors"}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className="font-medium">
                <Badge variant="outline">{run?.status || "—"}</Badge>
              </div>
              {run?.error ? <div className="text-xs text-destructive mt-1">{run.error}</div> : null}
            </div>
            <div>
              <div className="text-muted-foreground">Target</div>
              <div className="font-medium">{run?.target || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Provider</div>
              <div className="font-medium">{run?.render_provider || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Progress</div>
              <div className="font-medium">
                {typeof run?.progress_percent === "number" ? `${run.progress_percent}%` : "—"}{" "}
                {run?.progress_stage ? `(${run.progress_stage})` : ""}
              </div>
              {run?.progress_message ? <div className="text-xs text-muted-foreground mt-1">{run.progress_message}</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Missing images (draft placeholder mode)</CardTitle>
            <CardDescription>
              {layoutReportLoading
                ? "Loading…"
                : missingImages.length
                  ? `${missingImages.length} missing image(s) reported. Upload or AI-generate, then re-render.`
                  : "No missing images reported for this run."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestLayoutReportArtifact ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Report: <span className="font-mono">{latestLayoutReportArtifact.path}</span>{" "}
                  {layoutReport?.generatedAt ? `(${new Date(layoutReport.generatedAt).toLocaleString()})` : ""}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadLayoutReport()}
                  disabled={layoutReportLoading}
                  data-cta-id="cta-admin-bookrun-missing-refresh"
                  data-action="action"
                >
                  Refresh report
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No layout_report artifact found yet.</div>
            )}

            {missingImages.length > 0 ? (
              <div className="space-y-2">
                {missingImages.map((m, idx) => {
                  const canonicalSrc = String(m.canonicalSrc || "").trim() || String(m.htmlSrc || "").trim();
                  const uploadingKey = `upload:${canonicalSrc}`;
                  const aiKey = `ai:${canonicalSrc}`;
                  const busy = fixingByKey.has(uploadingKey) || fixingByKey.has(aiKey);

                  return (
                    <div key={`${canonicalSrc}:${idx}`} className="rounded-md border p-3 space-y-2">
                      <div className="text-sm font-mono break-all">{canonicalSrc || "—"}</div>
                      {m.suggestedUploadPath ? (
                        <div className="text-xs text-muted-foreground font-mono break-all">
                          Upload path: {m.suggestedUploadPath}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const el = document.getElementById(`missing-upload-${idx}`) as HTMLInputElement | null;
                            el?.click();
                          }}
                          disabled={busy}
                          data-cta-id="cta-admin-bookrun-missing-upload"
                          data-action="action"
                        >
                          {fixingByKey.has(uploadingKey) ? "Uploading…" : "Upload image"}
                        </Button>
                        <input
                          id={`missing-upload-${idx}`}
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
                          variant="outline"
                          onClick={() => void aiGenerateMissingImage(canonicalSrc)}
                          disabled={busy || !canonicalSrc}
                          data-cta-id="cta-admin-bookrun-missing-ai-generate"
                          data-action="action"
                        >
                          {fixingByKey.has(aiKey) ? "Generating…" : "AI generate"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${sortedJobs.length} job(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Chapter</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Job Id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedJobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Badge variant="outline">{j.status}</Badge>
                      {j.error ? <div className="text-xs text-destructive mt-1">{j.error}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{j.target}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof j.chapter_index === "number" ? j.chapter_index : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof j.progress_percent === "number" ? `${j.progress_percent}%` : "—"}{" "}
                      {j.progress_stage ? `(${j.progress_stage})` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof j.processing_duration_ms === "number" ? `${Math.round(j.processing_duration_ms / 1000)}s` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{j.id}</TableCell>
                  </TableRow>
                ))}
                {sortedJobs.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No jobs found for this run.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chapters</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${chapters.length} tracked chapter(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chapter</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chapters.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.chapter_index}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.status}</Badge>
                      {c.error ? <div className="text-xs text-destructive mt-1">{c.error}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof c.progress_percent === "number" ? `${c.progress_percent}%` : "—"}{" "}
                      {c.progress_stage ? `(${c.progress_stage})` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.progress_message || "—"}</TableCell>
                  </TableRow>
                ))}
                {chapters.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No chapter tracking rows yet (worker may populate later).
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Artifacts</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${sortedArtifacts.length} artifact(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Chapter</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedArtifacts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.kind}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof a.chapter_index === "number" ? a.chapter_index : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {typeof a.bytes === "number" ? `${Math.round(a.bytes / 1024)} KB` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.created_at ? new Date(a.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void downloadArtifact(a.id)}
                        disabled={downloading.has(a.id)}
                        data-cta-id={`cta-admin-bookrun-download-${a.id}`}
                        data-action="action"
                      >
                        {downloading.has(a.id) ? "Signing…" : "Download"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sortedArtifacts.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No artifacts uploaded yet.
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


