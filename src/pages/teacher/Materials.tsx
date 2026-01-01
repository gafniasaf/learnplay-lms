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
  // Keep extension; replace dangerous chars.
  const trimmed = String(name || "").trim();
  if (!trimmed) return "upload.bin";
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.slice(0, 180);
}

export default function TeacherMaterials() {
  const mcp = useMCP();
  const { user, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [materials, setMaterials] = useState<Array<Record<string, unknown>>>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const selectedMaterial = useMemo(
    () => materials.find((m) => String(m.id || "") === String(selectedMaterialId || "")) || null,
    [materials, selectedMaterialId],
  );

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AnyJobRow | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const status = useMemo(() => normalizeStatus(job?.status), [job?.status]);

  const refreshMaterials = useCallback(async () => {
    try {
      const res = (await mcp.listRecords("library-material", 50)) as ListRecordsResponse;
      if (!res || (res as any).ok !== true) {
        throw new Error("Failed to load materials");
      }
      setMaterials(Array.isArray((res as any).records) ? (res as any).records : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Failed to load materials", { description: msg });
    }
  }, [mcp]);

  useEffect(() => {
    void refreshMaterials();
  }, [refreshMaterials]);

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
        if (jobType === "material_ingest") {
          // Chain analysis automatically
          const materialId = selectedMaterialId;
          if (materialId) {
            try {
              const analyze = await mcp.enqueueJob("material_analyze", { material_id: materialId });
              if (analyze?.ok && analyze.jobId) {
                setJobId(analyze.jobId);
                toast.success("Material analysis job queued");
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              toast.error("Failed to enqueue analysis job", { description: msg });
            }
          }
        }

        if (jobType === "material_analyze") {
          // Refresh list so analysis summary shows up
          await refreshMaterials();
        }
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
  }, [jobId, mcp, refreshMaterials, selectedMaterialId]);

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
      toast.error("Please choose a file");
      return;
    }

    const materialId = crypto.randomUUID();
    const safeName = safeStorageFileName(file.name);
    const storagePath = `${orgId}/${materialId}/upload/${safeName}`;

    try {
      // 1) Upload to Storage (org-scoped path)
      const { error: uploadErr } = await supabase.storage
        .from("materials")
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (uploadErr) throw new Error(uploadErr.message);

      // 2) Create/Upsert entity record
      const recordTitle = title.trim() || file.name;
      const save = await mcp.saveRecord("library-material", {
        id: materialId,
        title: recordTitle,
        source: "upload",
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
        storage_bucket: "materials",
        storage_path: storagePath,
        status: "uploaded",
        analysis_summary: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (!(save as any)?.ok) {
        throw new Error(typeof (save as any)?.error?.message === "string" ? (save as any).error.message : "Failed to save record");
      }

      // 3) Enqueue ingest job
      const enq = await mcp.enqueueJob("material_ingest", {
        material_id: materialId,
        storage_bucket: "materials",
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
      });
      if (!enq?.ok || !enq.jobId) {
        throw new Error(typeof enq?.error === "string" ? enq.error : "Failed to enqueue job");
      }

      setSelectedMaterialId(materialId);
      setJobId(enq.jobId);
      toast.success("Material ingest job queued");

      setTitle("");
      setFile(null);
      await refreshMaterials();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Upload/ingest failed", { description: msg });
    }
  };

  const onReset = () => {
    setJobId(null);
    setJob(null);
    setEvents([]);
    setError(null);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Materials</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void refreshMaterials()}
            data-cta-id="cta-teacher-materials-refresh"
            data-action="action"
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={onReset}
            data-cta-id="cta-teacher-materials-reset"
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
          <CardTitle>Upload & Ingest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Shown in the library"
              data-cta-id="cta-teacher-materials-title"
              data-action="edit"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <Input
              id="file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-cta-id="cta-teacher-materials-file"
              data-action="edit"
            />
          </div>

          <Button
            onClick={onUploadAndIngest}
            disabled={!file || authLoading || !user}
            data-cta-id="cta-teacher-materials-upload-and-ingest"
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
              {selectedMaterialId && <Badge variant="outline">material: {selectedMaterialId}</Badge>}
            </div>

            <div className="space-y-2">
              <Label>Events</Label>
              <div className="max-h-56 overflow-y-auto rounded-md border p-2 text-sm">
                {events.length === 0 && <div className="text-muted-foreground">No events yet…</div>}
                {events.map((e, idx) => (
                  <div key={e.id || idx} className="flex items-start gap-2">
                    <span className="text-muted-foreground tabular-nums w-10">{typeof e.progress === "number" ? `${e.progress}%` : ""}</span>
                    <span className="font-mono text-xs text-muted-foreground w-24">{e.step || ""}</span>
                    <span>{e.message || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {materials.length === 0 && <div className="text-sm text-muted-foreground">No materials yet.</div>}

          {materials.map((m) => {
            const id = String(m.id || "");
            const s = String((m as any)?.status || "");
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedMaterialId(id)}
                className={`w-full rounded-md border p-3 text-left hover:bg-muted/40 ${selectedMaterialId === id ? "border-primary" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{String(m.title || m.name || id)}</div>
                  <Badge variant="secondary">{s || "unknown"}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  updated: {String(m.updated_at || "")}
                </div>
              </button>
            );
          })}

          {selectedMaterial && (
            <div className="rounded-md border p-3">
              <div className="font-semibold">Selected</div>
              <div className="text-sm text-muted-foreground">{String(selectedMaterial.title || selectedMaterial.id)}</div>

              <div className="mt-3 text-sm">
                <div className="font-medium mb-1">Analysis Summary</div>
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
                  {JSON.stringify((selectedMaterial as any)?.analysis_summary?.analysis ?? null, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



