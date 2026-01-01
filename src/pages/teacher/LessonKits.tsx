import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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

export default function TeacherLessonKits() {
  const mcp = useMCP();

  const [moduleId, setModuleId] = useState("");
  const [title, setTitle] = useState("");
  const [locale, setLocale] = useState("nl-NL");
  const [protocol, setProtocol] = useState<"auto" | "procedural" | "communication" | "theory">("auto");
  const [autoRepair, setAutoRepair] = useState(true);
  const [html, setHtml] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AnyJobRow | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [lessonKitRecord, setLessonKitRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = useMemo(() => normalizeStatus(job?.status), [job?.status]);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await mcp.callGet<GetJobAnyResponse>("lms.getJob", {
        id: jobId,
        eventsLimit: "200",
        includeArtifacts: "true",
      });

      if (!res || (res as any).ok !== true) {
        throw new Error("Failed to load job");
      }

      setJob((res as any).job || null);
      setEvents(Array.isArray((res as any).events) ? (res as any).events : []);

      const nextStatus = normalizeStatus((res as any).job?.status);
      if (nextStatus === "done") {
        // Manual strategy persists lesson-kit record with id = jobId
        try {
          const record = await mcp.callGet<Record<string, unknown>>("lms.getRecord", {
            entity: "lesson-kit",
            id: jobId,
          });
          setLessonKitRecord(record || null);
        } catch {
          // Best-effort: record may not be visible yet; keep polling.
        }
      }
      if (nextStatus === "failed") {
        const msg =
          typeof (res as any).job?.error === "string" && (res as any).job.error.trim()
            ? String((res as any).job.error)
            : "Job failed";
        setError(msg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId, mcp]);

  useEffect(() => {
    if (!jobId) return;
    void fetchJob();

    const t = window.setInterval(() => {
      if (TERMINAL.has(status)) return;
      void fetchJob();
    }, 2000);

    return () => window.clearInterval(t);
  }, [jobId, fetchJob, status]);

  const onSubmit = async () => {
    setError(null);
    setLessonKitRecord(null);

    if (!moduleId.trim()) {
      toast.error("module_id is required");
      return;
    }
    if (!html.trim()) {
      toast.error("html_content is required");
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        module_id: moduleId.trim(),
        html_content: html,
        auto_repair: autoRepair,
        title: title.trim() || undefined,
        locale: locale.trim() || undefined,
      };
      if (protocol !== "auto") {
        payload.protocol = protocol;
      }

      const res = await mcp.enqueueJob("lessonkit_build", payload);
      if (!res?.ok || !res.jobId) {
        throw new Error(typeof res?.error === "string" ? res.error : "Failed to enqueue job");
      }
      setJobId(res.jobId);
      toast.success("Lesson kit job queued");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Failed to start job", { description: msg });
    }
  };

  const onReset = () => {
    setJobId(null);
    setJob(null);
    setEvents([]);
    setLessonKitRecord(null);
    setError(null);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lesson Kits</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onReset}
            data-cta-id="cta-teacher-lesson-kits-reset"
            data-action="click"
          >
            Reset
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Build a Lesson Kit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="moduleId">Module ID (required)</Label>
              <Input
                id="moduleId"
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
                placeholder="e.g. mes:course:123:studytext:4"
                data-cta-id="cta-teacher-lesson-kits-module-id"
                data-action="edit"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Shown in the lesson-kit record"
                data-cta-id="cta-teacher-lesson-kits-title"
                data-action="edit"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="locale">Locale</Label>
              <Input
                id="locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                placeholder="nl-NL"
                data-cta-id="cta-teacher-lesson-kits-locale"
                data-action="edit"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocol">Protocol</Label>
              <select
                id="protocol"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as any)}
                data-cta-id="cta-teacher-lesson-kits-protocol"
                data-action="select"
              >
                <option value="auto">Auto-detect</option>
                <option value="procedural">Procedural</option>
                <option value="communication">Communication</option>
                <option value="theory">Theory</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="autoRepair"
              type="checkbox"
              checked={autoRepair}
              onChange={(e) => setAutoRepair(e.target.checked)}
              data-cta-id="cta-teacher-lesson-kits-auto-repair"
              data-action="toggle"
            />
            <Label htmlFor="autoRepair">Auto-repair (recommended)</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="html">HTML Content (required)</Label>
            <Textarea
              id="html"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<h1>…</h1><p>…</p>"
              className="min-h-[220px] font-mono"
              data-cta-id="cta-teacher-lesson-kits-html"
              data-action="edit"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={onSubmit}
              disabled={!!jobId && !TERMINAL.has(status)}
              data-cta-id="cta-teacher-lesson-kits-submit"
              data-action="click"
            >
              Build Lesson Kit
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {jobId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Job Status
              <Badge variant={status === "done" ? "default" : status === "failed" ? "destructive" : "secondary"}>
                {status || "unknown"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Job ID:</span> {jobId}
              </div>
              {job?.job_type ? (
                <div>
                  <span className="font-medium">Type:</span> {String(job.job_type)}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {status === "done" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
              {status === "failed" ? <AlertCircle className="h-4 w-4 text-red-600" /> : null}
              {!TERMINAL.has(status) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="text-sm">
                {events.length > 0 ? String(events[events.length - 1]?.message || "") : "Waiting for worker…"}
              </span>
            </div>

            {events.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-sm">Events ({events.length})</summary>
                <pre className="mt-2 rounded bg-muted p-3 text-xs overflow-auto">
                  {JSON.stringify(events, null, 2)}
                </pre>
              </details>
            ) : null}

            {lessonKitRecord ? (
              <details open>
                <summary className="cursor-pointer text-sm">Lesson Kit Record</summary>
                <pre className="mt-2 rounded bg-muted p-3 text-xs overflow-auto">
                  {JSON.stringify(lessonKitRecord, null, 2)}
                </pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}



