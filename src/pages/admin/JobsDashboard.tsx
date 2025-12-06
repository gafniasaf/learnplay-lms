import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, RotateCcw, Clock, AlertCircle, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { invalidateCourseCache } from "@/lib/utils/cacheInvalidation";

interface Job {
  id: string;
  subject?: string;
  prompt?: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'dead_letter' | 'stale';
  retry_count: number;
  max_retries: number;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  processing_duration_ms?: number;
  generation_duration_ms?: number;
  last_heartbeat?: string;
  created_by: string;
}

interface Metrics {
  job_type: string;
  status: string;
  count: number;
  avg_processing_ms: number;
  max_processing_ms: number;
  avg_retries: number;
  max_retries: number;
}

interface GenMetric { source: string; count: number }
interface FailMetric { failure_code: string; count: number }
interface TimingMetric { status: string; count: number; avg_processing_ms: number; p95_processing_ms: number }

type CronStatus = {
  jobname: string;
  active: boolean;
  last_start: string | null;
  last_end: string | null;
  last_status: string | null;
  last_return_message: string | null;
};

export default function JobsDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlJobId = search.get("jobId") || "";
  const urlStatus = search.get("status") || "";
  const urlQ = search.get("q") || "";

  const [courseJobs, setCourseJobs] = useState<Job[]>([]);
  const [mediaJobs, setMediaJobs] = useState<Job[]>([]);
  const [metrics, setMetrics] = useState<Metrics[]>([]);
  const [genMetrics, setGenMetrics] = useState<GenMetric[]>([]);
  const [failMetrics, setFailMetrics] = useState<FailMetric[]>([]);
  const [timingMetrics, setTimingMetrics] = useState<TimingMetric[]>([]);
  const [cronStatuses, setCronStatuses] = useState<CronStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Runner controls state
  const [runnerActive, setRunnerActive] = useState<boolean | null>(null);
  const [runnerN, setRunnerN] = useState<number>(3);
  const [savingRunner, setSavingRunner] = useState(false);

  // UI filters
  const [filterText, setFilterText] = useState<string>(urlJobId || urlQ);
  const [filterStatus, setFilterStatus] = useState<string>(urlStatus);
  const [sinceHours, setSinceHours] = useState<number>(24);

  // Events modal
  const [eventsFor, setEventsFor] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [eventsOpen, setEventsOpen] = useState(false);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const baseCourse = supabase.from("ai_course_jobs").select("*");
      let courseQuery = baseCourse;
      // timeframe
      if (sinceHours > 0) {
        const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString();
        courseQuery = (courseQuery as any).gte("created_at", sinceIso);
      }
      // status
      if (filterStatus) {
        courseQuery = (courseQuery as any).eq("status", filterStatus);
      }
      // text filter: job id exact, or subject ilike
      if (filterText) {
        if (/^[0-9a-fA-F-]{36}$/.test(filterText)) {
          courseQuery = (courseQuery as any).eq("id", filterText);
        } else {
          courseQuery = (courseQuery as any).ilike("subject", `%${filterText}%`);
        }
      }
      courseQuery = (courseQuery as any).order("created_at", { ascending: false }).limit(100);

      const [courseRes, mediaRes, metricsRes, genRes, failRes, timeRes, runnerRes, cronRes] = await Promise.all([
        courseQuery,
        (supabase as any)
          .from("ai_media_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("ai_job_metrics")
          .select("*"),
        (supabase as any)
          .from("ai_job_generation_metrics")
          .select("*"),
        (supabase as any)
          .from("ai_job_failure_metrics")
          .select("*"),
        (supabase as any)
          .from("ai_job_timings")
          .select("*"),
        (supabase as any)
          .rpc('get_ai_runner_status'),
        // Optional: requires DB function get_cron_job_statuses(job_names text[])
        (supabase as any).rpc('get_cron_job_statuses', { job_names: ['jobs-reconciler-every-minute', 'ai-job-batch-runner-every-minute', 'ai-media-runner-every-minute'] })
      ]);

      if (courseRes.data) setCourseJobs(courseRes.data as any);
      if (mediaRes.data) setMediaJobs(mediaRes.data as any);
      if (metricsRes.data) setMetrics(metricsRes.data as any);
      if (genRes.data) setGenMetrics(genRes.data as any);
      if (failRes.data) setFailMetrics(failRes.data as any);
      if (timeRes.data) setTimingMetrics(timeRes.data as any);
      if ((runnerRes as any)?.data?.length) {
        const s = (runnerRes as any).data[0];
        setRunnerActive(!!s.active);
        setRunnerN(Number(s.concurrency) || 3);
      }
      if ((cronRes as any)?.data) setCronStatuses((cronRes as any).data as CronStatus[]);
    } catch (error) {
      toast({
        title: "Error loading jobs",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const requeueJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs') => {
    try {
      const { error } = await (supabase as any).rpc('requeue_job', {
        job_id: jobId,
        job_table: jobTable,
      });

      if (error) throw error;

      toast({
        title: "Job requeued",
        description: "The job has been reset to pending status",
      });

      await loadJobs();
    } catch (error) {
      toast({
        title: "Requeue failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const deleteJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs') => {
    try {
      const { error } = await supabase
        .from(jobTable)
        .delete()
        .eq('id', jobId);

      if (error) throw error;

      toast({
        title: "Job deleted",
        description: "The job has been removed",
      });

      await loadJobs();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const markStale = async () => {
    try {
      const { data, error } = await (supabase as any).rpc('mark_stale_jobs');
      
      if (error) throw error;

      const staleCount = data?.length || 0;
      
      toast({
        title: "Stale jobs marked",
        description: `${staleCount} jobs marked as stale`,
      });

      await loadJobs();
    } catch (error) {
      toast({
        title: "Mark stale failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const moveToDeadLetter = async () => {
    try {
      const { data, error } = await (supabase as any).rpc('move_to_dead_letter');
      
      if (error) throw error;

      const movedCount = data?.length || 0;
      
      toast({
        title: "Jobs moved to dead letter",
        description: `${movedCount} jobs moved to dead_letter status`,
      });

      await loadJobs();
    } catch (error) {
      toast({
        title: "Move to dead letter failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const openEvents = (jobId: string) => {
    setEventsFor(jobId);
    setEvents([]);
    setEventsOpen(true);
    try {
      const url = `${(import.meta as any).env?.VITE_SUPABASE_URL?.replace(/\/$/, '')}/functions/v1/job-events-stream?jobId=${encodeURIComponent(jobId)}`;
      const es = new EventSource(url);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setEvents((prev) => [...prev, data]);
          if (data?.type === 'done' || data?.type === 'failed') {
            es.close();
          }
        } catch {}
      };
      es.onerror = () => es.close();
      // Auto close after 60s
      setTimeout(() => es.close(), 60000);
    } catch {}
  };

  useEffect(() => {
    loadJobs();
  }, [filterText, filterStatus, sinceHours]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      pending: { variant: "secondary", icon: Clock },
      processing: { variant: "default", icon: RefreshCw },
      done: { variant: "success", icon: CheckCircle2 },
      failed: { variant: "destructive", icon: XCircle },
      dead_letter: { variant: "outline", icon: Trash2 },
      stale: { variant: "destructive", icon: AlertCircle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant as any} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString();
  };

  const renderJobTable = (jobs: Job[], jobTable: 'ai_course_jobs' | 'ai_media_jobs') => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Subject/Prompt</TableHead>
          <TableHead>Job Id</TableHead>
          <TableHead>Retries</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No jobs found
            </TableCell>
          </TableRow>
        ) : (
          jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{getStatusBadge(job.status)}</TableCell>
              <TableCell className="max-w-xs truncate">
                {job.subject || job.prompt || "—"}
                {job.error && (
                  <div data-testid="job-error" className="text-xs text-destructive mt-1 truncate" title={job.error}>
                    {job.error}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs">{job.id}</TableCell>
              <TableCell>
                {job.retry_count}/{job.max_retries}
              </TableCell>
              <TableCell>
                <div className="text-xs space-y-1">
                  <div>Total: {formatDuration(job.processing_duration_ms)}</div>
                  {job.generation_duration_ms && (
                    <div className="text-muted-foreground">
                      Gen: {formatDuration(job.generation_duration_ms)}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs">
                {formatDate(job.created_at)}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEvents(job.id)}
                    title="View events stream"
                  >
                    <Clock className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/admin/logs?jobId=${encodeURIComponent(job.id)}`)}
                    title="Open logs for this job"
                  >
                    Logs
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/admin/editor/${encodeURIComponent((job as any).course_id || '')}`)}
                    disabled={!((job as any).course_id)}
                    title={((job as any).course_id) ? "Open in Course Editor" : "Course ID not available"}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const cid = (job as any).course_id;
                      if (!cid) return;
                      try {
                        await invalidateCourseCache(cid);
                        toast({ title: 'Cache invalidated', description: cid });
                      } catch (e:any) {
                        toast({ title: 'Invalidate failed', description: e?.message || 'Error', variant: 'destructive' });
                      }
                    }}
                    disabled={!((job as any).course_id)}
                    title="Invalidate CDN cache"
                  >
                    Invalidate
                  </Button>
                  {['failed', 'dead_letter', 'stale'].includes(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => requeueJob(job.id, jobTable)}
                      title="Requeue job"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  {['pending', 'failed', 'dead_letter', 'stale'].includes(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteJob(job.id, jobTable)}
                      title="Delete job"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const renderMetricsCard = (jobType: string) => {
    const typeMetrics = metrics.filter((m) => m.job_type === jobType);
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['pending', 'processing', 'done', 'failed'].map((status) => {
          const metric = typeMetrics.find((m) => m.status === status);
          const count = metric?.count || 0;
          const avgMs = metric?.avg_processing_ms || 0;

          return (
            <Card key={status}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize">{status}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
                {avgMs > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Avg: {formatDuration(avgMs)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Job Queue Dashboard</h1>
          <p className="text-muted-foreground">Monitor and manage AI generation jobs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={markStale}>
            <AlertCircle className="h-4 w-4 mr-2" />
            Mark Stale
          </Button>
          <Button variant="outline" size="sm" onClick={moveToDeadLetter}>
            <Trash2 className="h-4 w-4 mr-2" />
            Move to Dead Letter
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const n = runnerN || 3;
              const { data, error } = await (supabase.functions as any).invoke(`ai-job-batch-runner?n=${n}`, { method: 'POST', body: {} });
              if (error) throw error;
              toast({ title: 'Batch run triggered', description: `Processed: ${data?.processedInThisBatch ?? 0}` });
            } catch (e:any) {
              toast({ title: 'Batch run failed', description: e?.message || 'Error', variant: 'destructive' });
            }
          }}>
            Run Batch (x{runnerN})
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const { data, error } = await (supabase.functions as any).invoke('jobs-reconciler', { method: 'POST', body: {} });
              if (error) throw error;
              toast({ title: 'Reconciler ran', description: `Actions: ${data?.count ?? 0}` });
              loadJobs();
            } catch (e:any) {
              toast({ title: 'Reconciler failed', description: e?.message || 'Error', variant: 'destructive' });
            }
          }}>
            Run Reconciler
          </Button>
          <Button variant="default" size="sm" onClick={loadJobs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search by job id or subject; filter by status and timeframe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Search</label>
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="job id or subject"
                className="border rounded px-2 py-1 text-sm w-64"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">any</option>
                <option value="pending">pending</option>
                <option value="processing">processing</option>
                <option value="done">done</option>
                <option value="failed">failed</option>
                <option value="dead_letter">dead_letter</option>
                <option value="stale">stale</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Since (hours)</label>
              <input
                type="number"
                min={1}
                max={720}
                value={sinceHours}
                onChange={(e) => setSinceHours(Math.max(1, Math.min(720, Number(e.target.value))))}
                className="border rounded px-2 py-1 text-sm w-24"
              />
            </div>
            <Button variant="default" size="sm" onClick={() => loadJobs()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scheduler Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduler Controls</CardTitle>
          <CardDescription>Pause/resume and set worker concurrency</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {runnerActive === null ? (
                <Badge>Loading…</Badge>
              ) : runnerActive ? (
                <Badge variant="secondary">Active</Badge>
              ) : (
                <Badge variant="destructive">Inactive</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Workers:</span>
              <input
                type="number"
                min={1}
                max={10}
                value={runnerN}
                onChange={(e) => setRunnerN(Math.max(1, Math.min(10, Number(e.target.value))))}
                className="w-16 border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={runnerActive === null || savingRunner}
                onClick={async () => {
                  try {
                    setSavingRunner(true);
                    const { error } = await (supabase as any).rpc('set_ai_batch_concurrency', { p_n: runnerN });
                    if (error) throw error;
                    toast({ title: 'Updated', description: `Concurrency set to ${runnerN}` });
                  } catch (e:any) {
                    toast({ title: 'Update failed', description: e?.message || 'Error', variant: 'destructive' });
                  } finally {
                    setSavingRunner(false);
                    loadJobs();
                  }
                }}
              >
                Apply Workers
              </Button>
              {runnerActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runnerActive === null || savingRunner}
                  onClick={async () => {
                    try {
                      setSavingRunner(true);
                      const { error } = await (supabase as any).rpc('set_ai_runner_active', { p_active: false });
                      if (error) throw error;
                      toast({ title: 'Paused scheduler' });
                      setRunnerActive(false);
                    } catch (e:any) {
                      toast({ title: 'Pause failed', description: e?.message || 'Error', variant: 'destructive' });
                    } finally {
                      setSavingRunner(false);
                    }
                  }}
                >
                  Pause
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={runnerActive === null || savingRunner}
                  onClick={async () => {
                    try {
                      setSavingRunner(true);
                      const { error } = await (supabase as any).rpc('set_ai_runner_active', { p_active: true });
                      if (error) throw error;
                      toast({ title: 'Resumed scheduler' });
                      setRunnerActive(true);
                    } catch (e:any) {
                      toast({ title: 'Resume failed', description: e?.message || 'Error', variant: 'destructive' });
                    } finally {
                      setSavingRunner(false);
                    }
                  }}
                >
                  Resume
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edge Schedules Status (optional) */}
      {cronStatuses.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Edge Schedules</CardTitle>
                <CardDescription>Cron status for reconciler, batch runner, and media runner</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    // Prefer RPC if present (requires GRANT EXECUTE)
                    const { error } = await (supabase as any).rpc('_call_jobs_reconciler');
                    if (error) throw error;
                    toast({ title: 'Triggered', description: 'jobs-reconciler invoked' });
                  } catch (e:any) {
                    try {
                      // Fallback to invoking edge function directly
                      const { error: invErr } = await (supabase.functions as any).invoke('jobs-reconciler', { method: 'POST', body: {} });
                      if (invErr) throw invErr;
                      toast({ title: 'Triggered (fallback)', description: 'jobs-reconciler invoked' });
                    } catch (e2:any) {
                      toast({ title: 'Trigger failed', description: e2?.message || 'Error', variant: 'destructive' });
                    }
                  }
                }}>Run Reconciler Now</Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    // Prefer RPC if present (requires GRANT EXECUTE)
                    const { error } = await (supabase as any).rpc('_call_ai_job_batch_runner');
                    if (error) throw error;
                    toast({ title: 'Triggered', description: 'ai-job-batch-runner invoked' });
                  } catch (e:any) {
                    try {
                      // Fallback: invoke edge function with n from runnerN state
                      const n = Number.isFinite(runnerN) && runnerN > 0 ? runnerN : 3;
                      const { error: invErr } = await (supabase.functions as any).invoke(`ai-job-batch-runner?n=${n}`, { method: 'POST', body: {} });
                      if (invErr) throw invErr;
                      toast({ title: 'Triggered (fallback)', description: `ai-job-batch-runner invoked (n=${n})` });
                    } catch (e2:any) {
                      toast({ title: 'Trigger failed', description: e2?.message || 'Error', variant: 'destructive' });
                    }
                  }
                }}>Run Batch Now</Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    // Prefer RPC if present (requires GRANT EXECUTE)
                    const { error } = await (supabase as any).rpc('_call_ai_media_runner');
                    if (error) throw error;
                    toast({ title: 'Triggered', description: 'ai-media-runner invoked' });
                  } catch (e:any) {
                    try {
                      // Fallback: invoke media runner edge directly
                      const { error: invErr } = await (supabase.functions as any).invoke('ai-media-runner', { method: 'POST', body: {} });
                      if (invErr) throw invErr;
                      toast({ title: 'Triggered (fallback)', description: 'ai-media-runner invoked' });
                    } catch (e2:any) {
                      toast({ title: 'Trigger failed', description: e2?.message || 'Error', variant: 'destructive' });
                    }
                  }
                }}>Run Media Runner Now</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cronStatuses.map((c) => (
                <div key={c.jobname} className="p-3 border rounded">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{c.jobname}</div>
                    <Badge variant={c.active ? 'secondary' : 'destructive'}>{c.active ? 'active' : 'inactive'}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <div>last_status: {c.last_status ?? '—'}</div>
                    <div>last_start: {c.last_start ? new Date(c.last_start).toLocaleString() : '—'}</div>
                    <div>last_end: {c.last_end ? new Date(c.last_end).toLocaleString() : '—'}</div>
                    {c.last_return_message && (
                      <div className="truncate" title={c.last_return_message}>return: {c.last_return_message}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="course" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="course">Course Jobs</TabsTrigger>
          <TabsTrigger value="media">Media Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="course" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Generation Metrics</CardTitle>
              <CardDescription>Aggregated statistics for AI course generation</CardDescription>
            </CardHeader>
            <CardContent>
              {renderMetricsCard('course')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generation Sources</CardTitle>
              <CardDescription>Successful jobs by source</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {genMetrics.map((g) => (
                  <div key={g.source} className="p-3 border rounded">
                    <div className="text-xs text-muted-foreground">{g.source}</div>
                    <div className="text-xl font-semibold">{g.count}</div>
                  </div>
                ))}
                {genMetrics.length === 0 && (
                  <div className="text-sm text-muted-foreground">No data</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Failure Codes</CardTitle>
              <CardDescription>Recent failures grouped by code</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {failMetrics.map((f) => (
                  <div key={f.failure_code} className="p-3 border rounded">
                    <div className="text-xs text-muted-foreground">{f.failure_code}</div>
                    <div className="text-xl font-semibold">{f.count}</div>
                  </div>
                ))}
                {failMetrics.length === 0 && (
                  <div className="text-sm text-muted-foreground">No recent failures</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processing Time (ms)</CardTitle>
              <CardDescription>Avg and p95 by status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {timingMetrics.map((t) => (
                  <div key={t.status} className="p-3 border rounded">
                    <div className="text-xs text-muted-foreground">{t.status}</div>
                    <div className="text-sm">avg: {t.avg_processing_ms ?? '—'}</div>
                    <div className="text-sm">p95: {t.p95_processing_ms ?? '—'}</div>
                  </div>
                ))}
                {timingMetrics.length === 0 && (
                  <div className="text-sm text-muted-foreground">No timing data</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Course Jobs</CardTitle>
              <CardDescription>Last 50 course generation jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {renderJobTable(courseJobs, 'ai_course_jobs')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Media Generation Metrics</CardTitle>
              <CardDescription>Aggregated statistics for AI media generation</CardDescription>
            </CardHeader>
            <CardContent>
              {renderMetricsCard('media')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Media Jobs</CardTitle>
              <CardDescription>Last 50 media generation jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {renderJobTable(mediaJobs, 'ai_media_jobs')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Events modal (simple) */}
      {eventsOpen && eventsFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Events — {eventsFor}</div>
              <Button variant="ghost" size="sm" onClick={() => setEventsOpen(false)}>Close</Button>
            </div>
            <div className="p-4 space-y-2 text-sm">
              {events.length === 0 ? (
                <div className="text-muted-foreground">Waiting for events…</div>
              ) : (
                events.map((ev, i) => (
                  <div key={i} className="p-2 border rounded">
                    <pre className="whitespace-pre-wrap break-words">{JSON.stringify(ev, null, 2)}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

