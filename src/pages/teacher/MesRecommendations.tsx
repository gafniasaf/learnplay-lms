import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

type JobEvent = {
  id?: string;
  job_id?: string;
  seq?: number;
  step?: string;
  status?: string;
  progress?: number | null;
  message?: string | null;
  meta?: Record<string, unknown>;
  created_at?: string;
};

type AnyJobRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  job_type?: string;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

type GetJobAnyResponse =
  | {
      ok: true;
      job: AnyJobRow;
      events?: JobEvent[];
      jobSource?: string;
      artifacts?: Record<string, unknown>;
    }
  | {
      ok?: false;
      error?: unknown;
      job?: null;
      events?: JobEvent[];
    };

const TERMINAL = new Set(["done", "failed", "dead_letter", "stale"]);

function normalizeStatus(v: unknown): string {
  return String(v || "").toLowerCase().trim();
}

type MesDocInput = {
  doc_id: string;
  title?: string;
  text: string;
  url?: string;
};

export default function MesRecommendations() {
  const mcp = useMCP();

  // Search
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(5);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Index job (optional)
  const [docsJson, setDocsJson] = useState<string>("");
  const [indexJobId, setIndexJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AnyJobRow | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [jobError, setJobError] = useState<string | null>(null);

  const jobStatus = useMemo(() => normalizeStatus(job?.status), [job?.status]);

  const fetchJob = useCallback(async () => {
    if (!indexJobId) return;
    try {
      const res = await mcp.callGet<GetJobAnyResponse>("lms.getJob", {
        id: indexJobId,
        eventsLimit: "200",
        includeArtifacts: "true",
      });
      if (!res || (res as any).ok !== true) throw new Error("Failed to load job");
      const nextJob = (res as any).job || null;
      setJob(nextJob);
      setEvents(Array.isArray((res as any).events) ? (res as any).events : []);
      const st = normalizeStatus(nextJob?.status);
      if (st === "failed") {
        const msg = typeof nextJob?.error === "string" && nextJob.error.trim() ? String(nextJob.error) : "Job failed";
        setJobError(msg);
      }
    } catch (e) {
      setJobError(e instanceof Error ? e.message : String(e));
    }
  }, [indexJobId, mcp]);

  useEffect(() => {
    if (!indexJobId) return;
    void fetchJob();
    const t = window.setInterval(() => {
      if (TERMINAL.has(jobStatus)) return;
      void fetchJob();
    }, 2000);
    return () => window.clearInterval(t);
  }, [indexJobId, fetchJob, jobStatus]);

  const onSearch = async () => {
    setSearchError(null);
    const q = query.trim();
    if (!q) {
      toast.error("Query is required");
      return;
    }
    setSearching(true);
    try {
      const resp: any = await mcp.recommendMesContent(q, limit);
      if (!resp || resp.ok !== true) {
        const msg = typeof resp?.error?.message === "string"
          ? resp.error.message
          : typeof resp?.error === "string"
            ? resp.error
            : "recommend-mes-content failed";
        throw new Error(msg);
      }
      setResults(Array.isArray(resp.results) ? resp.results : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSearchError(msg);
      toast.error("Search failed", { description: msg });
    } finally {
      setSearching(false);
    }
  };

  const onEnqueueIndex = async () => {
    setJobError(null);
    setJob(null);
    setEvents([]);
    setIndexJobId(null);

    let docs: MesDocInput[];
    try {
      const parsed = JSON.parse(docsJson || "null");
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("docs JSON must be a non-empty array");
      }
      docs = parsed as MesDocInput[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Invalid documents JSON", { description: msg });
      return;
    }

    try {
      const resp = await mcp.enqueueJob("mes_corpus_index", { documents: docs });
      if (!resp?.ok || !resp.jobId) {
        throw new Error(typeof resp?.error === "string" ? resp.error : "Failed to enqueue mes_corpus_index");
      }
      setIndexJobId(resp.jobId);
      toast.success("MES corpus index job queued");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setJobError(msg);
      toast.error("Failed to enqueue job", { description: msg });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">MES Recommendations</h1>
        <p className="text-sm text-muted-foreground">
          Search the indexed MES corpus using semantic embeddings.
        </p>
      </div>

      {searchError ? (
        <Alert variant="destructive">
          <AlertDescription>{searchError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Find relevant MES content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="mes-query">Query</Label>
              <Input
                id="mes-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. blood flow through the heart"
                data-cta-id="cta-teachergpt-mes-query"
                data-action="edit"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mes-limit">Limit</Label>
              <Input
                id="mes-limit"
                type="number"
                min={1}
                max={20}
                value={String(limit)}
                onChange={(e) => setLimit(Math.max(1, Math.min(20, Number(e.target.value || 5))))}
                data-cta-id="cta-teachergpt-mes-limit"
                data-action="edit"
              />
            </div>
          </div>

          <Button
            onClick={onSearch}
            disabled={searching}
            data-cta-id="cta-teachergpt-mes-search"
            data-action="click"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Results</Badge>
              <span className="text-xs text-muted-foreground">{results.length} doc(s)</span>
            </div>
            {results.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No results yet. If the corpus isn’t indexed, enqueue an index job below.
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((r: any) => (
                  <div key={String(r?.doc_id || "")} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {String(r?.title || r?.doc_id || "Untitled")}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          doc_id: {String(r?.doc_id || "")}
                          {r?.url ? ` · ${String(r.url)}` : ""}
                        </div>
                      </div>
                      <Badge variant="outline">score {Number(r?.score ?? 0).toFixed(3)}</Badge>
                    </div>
                    <div className="mt-2 grid gap-2">
                      {(Array.isArray(r?.matches) ? r.matches : []).slice(0, 3).map((m: any, idx: number) => (
                        <div key={idx} className="rounded border bg-muted/20 p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">chunk {String(m?.item_index ?? "")}</span>
                            <span className="text-muted-foreground">sim {Number(m?.similarity ?? 0).toFixed(3)}</span>
                          </div>
                          <div className="mt-1 text-muted-foreground whitespace-pre-wrap">
                            {String(m?.text || "").slice(0, 220)}
                            {String(m?.text || "").length > 220 ? "…" : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Index MES corpus (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {jobError ? (
            <Alert variant="destructive">
              <AlertDescription>{jobError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="mes-docs-json">Documents JSON</Label>
            <Textarea
              id="mes-docs-json"
              value={docsJson}
              onChange={(e) => setDocsJson(e.target.value)}
              placeholder='[{"doc_id":"ec-1","title":"...","text":"...","url":"..."}]'
              className="min-h-[160px]"
              data-cta-id="cta-teachergpt-mes-index-docs"
              data-action="edit"
            />
            <div className="text-xs text-muted-foreground">
              This queues <code>mes_corpus_index</code> and writes embeddings to <code>content_embeddings</code>.
            </div>
          </div>

          <Button
            onClick={onEnqueueIndex}
            data-cta-id="cta-teachergpt-mes-index-run"
            data-action="click"
          >
            Enqueue Index Job
          </Button>

          {indexJobId ? (
            <div className="space-y-2">
              <div className="text-sm">
                Job: <span className="font-mono text-xs">{indexJobId}</span>{" "}
                <Badge variant="outline">{jobStatus || "queued"}</Badge>
              </div>
              {events.length > 0 ? (
                <div className="rounded border bg-muted/20 p-2 text-xs max-h-56 overflow-auto">
                  {events
                    .slice()
                    .sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))
                    .map((ev, i) => (
                      <div key={i} className="py-1 border-b last:border-b-0">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{String(ev.step || "")}</span>
                          <span className="text-muted-foreground">
                            {ev.progress !== null && ev.progress !== undefined ? `${ev.progress}%` : ""}
                          </span>
                        </div>
                        {ev.message ? <div className="text-muted-foreground">{ev.message}</div> : null}
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}


