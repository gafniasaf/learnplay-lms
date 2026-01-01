import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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

type ListRecordsResponse =
  | { ok: true; records: Array<Record<string, unknown>> }
  | { ok?: false; error?: unknown; records?: Array<Record<string, unknown>> };

const TERMINAL = new Set(["done", "failed", "dead_letter", "stale"]);

function normalizeStatus(v: unknown): string {
  return String(v || "").toLowerCase().trim();
}

function getOrganizationId(user: User | null): string | null {
  const org =
    (user?.app_metadata as any)?.organization_id ??
    (user?.user_metadata as any)?.organization_id;
  return typeof org === "string" && org.trim() ? org.trim() : null;
}

function safeStorageFileName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "upload.bin";
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.slice(0, 180);
}

export default function TeacherStandards() {
  const mcp = useMCP();
  const { user, loading: authLoading } = useAuth();

  // Upload/ingest
  const [title, setTitle] = useState("");
  const [locale, setLocale] = useState("nl-NL");
  const [file, setFile] = useState<File | null>(null);

  // Lists
  const [standardsDocs, setStandardsDocs] = useState<Array<Record<string, unknown>>>([]);
  const [materials, setMaterials] = useState<Array<Record<string, unknown>>>([]);

  // Mapping selection
  const [selectedStandardsId, setSelectedStandardsId] = useState<string>("");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");

  // Job tracking (one active job panel)
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AnyJobRow | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [mappingRecord, setMappingRecord] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = useMemo(() => normalizeStatus(job?.status), [job?.status]);

  const refreshLists = useCallback(async () => {
    try {
      const [stdRes, matRes] = await Promise.all([
        mcp.listRecords("standards-document", 50) as Promise<ListRecordsResponse>,
        mcp.listRecords("library-material", 50) as Promise<ListRecordsResponse>,
      ]);

      if ((stdRes as any).ok !== true) throw new Error("Failed to load standards documents");
      if ((matRes as any).ok !== true) throw new Error("Failed to load materials");

      setStandardsDocs(Array.isArray((stdRes as any).records) ? (stdRes as any).records : []);
      setMaterials(Array.isArray((matRes as any).records) ? (matRes as any).records : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to refresh lists", { description: msg });
    }
  }, [mcp]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

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

      const nextJob = (res as any).job || null;
      setJob(nextJob);
      setEvents(Array.isArray((res as any).events) ? (res as any).events : []);

      const nextStatus = normalizeStatus(nextJob?.status);
      const jobType = String(nextJob?.job_type || "");

      if (nextStatus === "done") {
        if (jobType === "standards_map" || jobType === "standards_export") {
          try {
            const record = await mcp.callGet<Record<string, unknown>>("lms.getRecord", {
              entity: "standards-mapping",
              id: jobType === "standards_map" ? jobId : (mappingRecord as any)?.id || "",
            });
            if (record) setMappingRecord(record);
          } catch {
            // best-effort
          }
        }

        await refreshLists();
      }

      if (nextStatus === "failed") {
        const msg =
          typeof nextJob?.error === "string" && nextJob.error.trim()
            ? String(nextJob.error)
            : "Job failed";
        setError(msg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId, mcp, refreshLists, mappingRecord]);

  useEffect(() => {
    if (!jobId) return;
    void fetchJob();

    const t = window.setInterval(() => {
      if (TERMINAL.has(status)) return;
      void fetchJob();
    }, 2000);

    return () => window.clearInterval(t);
  }, [jobId, fetchJob, status]);

  const onUploadAndIngest = async () => {
    setError(null);
    setMappingRecord(null);

    if (authLoading) {
      toast.error("Auth still loading");
      return;
    }
    if (!user) {
      toast.error("Authentication required");
      return;
    }
    const orgId = getOrganizationId(user);
    if (!orgId) {
      toast.error("BLOCKED: missing organization_id", {
        description: "Run: npx tsx scripts/fix-admin-org.ts <your-email>",
      });
      return;
    }
    if (!file) {
      toast.error("Please choose a standards file");
      return;
    }

    const standardsDocumentId = crypto.randomUUID();
    const safeName = safeStorageFileName(file.name);
    const storagePath = `${orgId}/${standardsDocumentId}/upload/${safeName}`;

    try {
      // 1) Upload source into private materials bucket
      const { error: uploadErr } = await supabase.storage
        .from("materials")
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (uploadErr) throw new Error(uploadErr.message);

      // 2) Create record
      const recordTitle = title.trim() || file.name;
      const save = await mcp.saveRecord("standards-document", {
        id: standardsDocumentId,
        title: recordTitle,
        source: "upload",
        locale: locale.trim() || "und",
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
        storage_path: storagePath,
        status: "uploaded",
        item_count: 0,
        items: [],
        ingest_summary: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!(save as any)?.ok) {
        throw new Error(typeof (save as any)?.error?.message === "string" ? (save as any).error.message : "Failed to save record");
      }

      // 3) Enqueue ingest
      const enq = await mcp.enqueueJob("standards_ingest", {
        standards_document_id: standardsDocumentId,
        storage_bucket: "materials",
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
        locale: locale.trim() || "und",
        title: recordTitle,
      });
      if (!enq?.ok || !enq.jobId) throw new Error(typeof enq?.error === "string" ? enq.error : "Failed to enqueue job");

      setJobId(enq.jobId);
      toast.success("Standards ingest job queued");

      setTitle("");
      setFile(null);
      await refreshLists();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Standards upload/ingest failed", { description: msg });
    }
  };

  const onMap = async () => {
    setError(null);
    setMappingRecord(null);

    if (!selectedStandardsId || !selectedMaterialId) {
      toast.error("Select both a standards document and a material");
      return;
    }

    try {
      const enq = await mcp.enqueueJob("standards_map", {
        standards_document_id: selectedStandardsId,
        material_id: selectedMaterialId,
        top_k: 5,
        max_items: 50,
      });
      if (!enq?.ok || !enq.jobId) throw new Error(typeof enq?.error === "string" ? enq.error : "Failed to enqueue job");

      setJobId(enq.jobId);
      toast.success("Standards mapping job queued");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Failed to start mapping", { description: msg });
    }
  };

  const onExport = async () => {
    setError(null);
    const mappingId = String((mappingRecord as any)?.id || "");
    if (!mappingId) {
      toast.error("No mapping record loaded yet");
      return;
    }

    try {
      const enq = await mcp.enqueueJob("standards_export", { mapping_id: mappingId });
      if (!enq?.ok || !enq.jobId) throw new Error(typeof enq?.error === "string" ? enq.error : "Failed to enqueue job");

      setJobId(enq.jobId);
      toast.success("Export job queued");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Export failed", { description: msg });
    }
  };

  const onReset = () => {
    setJobId(null);
    setJob(null);
    setEvents([]);
    setMappingRecord(null);
    setError(null);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Standards</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void refreshLists()}
            data-cta-id="cta-teacher-standards-refresh"
            data-action="action"
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={onReset}
            data-cta-id="cta-teacher-standards-reset"
            data-action="action"
          >
            Reset
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload & Ingest Standards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. KD 2025"
                data-cta-id="cta-teacher-standards-title"
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
                data-cta-id="cta-teacher-standards-locale"
                data-action="edit"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Standards File</Label>
            <Input
              id="file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-cta-id="cta-teacher-standards-file"
              data-action="edit"
            />
          </div>

          <Button
            onClick={onUploadAndIngest}
            disabled={!file || authLoading || !user}
            data-cta-id="cta-teacher-standards-upload"
            data-action="action"
          >
            {authLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </>
            ) : (
              "Upload & Ingest"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Map Material to Standards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Standards Document</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedStandardsId}
                onChange={(e) => setSelectedStandardsId(e.target.value)}
                data-cta-id="cta-teacher-standards-select-standards"
                data-action="select"
              >
                <option value="">Select…</option>
                {standardsDocs.map((d) => {
                  const id = String(d.id || "");
                  const label = String(d.title || id);
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Material</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                data-cta-id="cta-teacher-standards-select-material"
                data-action="select"
              >
                <option value="">Select…</option>
                {materials.map((m) => {
                  const id = String(m.id || "");
                  const label = String(m.title || id);
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <Button
            onClick={onMap}
            disabled={!selectedStandardsId || !selectedMaterialId}
            data-cta-id="cta-teacher-standards-map"
            data-action="action"
          >
            Map
          </Button>

          {mappingRecord && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">mapping</Badge>
                <span className="text-sm text-muted-foreground">{String((mappingRecord as any).id)}</span>
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
                {JSON.stringify((mappingRecord as any).export || {}, null, 2)}
              </pre>
              <Button
                onClick={onExport}
                data-cta-id="cta-teacher-standards-export"
                data-action="action"
              >
                Export CSV
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {jobId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {status === "done" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              {status === "failed" && <AlertCircle className="h-5 w-5 text-red-600" />}
              {status !== "done" && status !== "failed" && <Loader2 className="h-5 w-5 animate-spin" />}
              Job: {jobId}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">status: {String(job?.status || "unknown")}</Badge>
              {job?.job_type && <Badge variant="outline">type: {String(job.job_type)}</Badge>}
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              <div className="max-h-56 overflow-y-auto rounded-md border p-2 text-sm">
                {events.length === 0 && <div className="text-muted-foreground">No events yet…</div>}
                {events.map((e, idx) => (
                  <div key={e.id || idx} className="flex items-start gap-2">
                    <span className="text-muted-foreground tabular-nums w-10">
                      {typeof e.progress === "number" ? `${e.progress}%` : ""}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground w-28">{e.step || ""}</span>
                    <span>{e.message || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



