/**
 * JobsDashboard - IgniteZero compliant
 * Uses edge functions via API layer instead of direct Supabase calls
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, RotateCcw, Clock, AlertCircle, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { invalidateCourseCache } from "@/lib/utils/cacheInvalidation";
import { useMCP } from "@/hooks/useMCP";
import type { CourseJob, MediaJob } from "@/lib/api/jobs";

interface Job {
  id: string;
  subject?: string;
  prompt?: string;
  status: string;
  retry_count?: number;
  max_retries?: number;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  processing_duration_ms?: number;
  generation_duration_ms?: number;
  last_heartbeat?: string;
  created_by?: string;
  course_id?: string;
}

interface AgentJob {
  id: string;
  job_type: string;
  status: string;
  payload?: any;
  result?: any;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  retry_count?: number;
  max_retries?: number;
  last_heartbeat?: string | null;
}

interface AlertRecord {
  id: string;
  alert_key: string;
  type: string;
  severity: string;
  message: string;
  meta?: Record<string, any>;
  count?: number;
  created_at: string;
  updated_at?: string;
  last_seen_at?: string;
  resolved_at?: string | null;
}

export default function JobsDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const mcp = useMCP();
  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlJobId = search.get("jobId") || "";
  const urlStatus = search.get("status") || "";
  const urlQ = search.get("q") || "";

  const [courseJobs, setCourseJobs] = useState<Job[]>([]);
  const [mediaJobs, setMediaJobs] = useState<Job[]>([]);
  const [agentJobs, setAgentJobs] = useState<AgentJob[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [metrics, setMetrics] = useState<{ courseJobs: any; mediaJobs: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // UI filters
  const [filterText, setFilterText] = useState<string>(urlJobId || urlQ);
  const [filterStatus, setFilterStatus] = useState<string>(urlStatus);
  const [sinceHours, setSinceHours] = useState<number>(24);

  // Events modal
  const [eventsFor, setEventsFor] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [eventsOpen, setEventsOpen] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      await mcp.runAlertDetector({ windowMinutes: Math.max(60, sinceHours * 60) }).catch(() => undefined);
      // Fetch jobs via edge functions
      const [courseRes, mediaRes, agentRes, metricsRes, alertsRes] = await Promise.all([
        mcp.listCourseJobs({
          status: filterStatus || undefined,
          sinceHours: sinceHours > 0 ? sinceHours : undefined,
          search: filterText || undefined,
          limit: 100,
        }),
        mcp.listMediaJobsFiltered({ limit: 50 }),
        mcp.listJobs({
          status: filterStatus || undefined,
          sinceHours: sinceHours > 0 ? sinceHours : undefined,
          search: filterText || undefined,
          limit: 100,
        }),
        mcp.getJobMetrics(sinceHours),
        mcp.listAlerts({ includeResolved: false, limit: 50 }),
      ]);

      if ((courseRes as { ok: boolean }).ok) setCourseJobs((courseRes as { jobs: Job[] }).jobs);
      if ((mediaRes as { ok: boolean }).ok) setMediaJobs((mediaRes as { jobs: Job[] }).jobs);
      if ((agentRes as { ok: boolean }).ok) setAgentJobs(((agentRes as any).jobs || []) as AgentJob[]);
      if ((metricsRes as { ok: boolean }).ok) {
        const m = metricsRes as { courseJobs: unknown; mediaJobs: unknown };
        setMetrics({ courseJobs: m.courseJobs, mediaJobs: m.mediaJobs });
      }
      if ((alertsRes as { ok: boolean }).ok) {
        setAlerts(((alertsRes as any).alerts || []) as AlertRecord[]);
      }
    } catch (error) {
      console.warn('[JobsDashboard] Error loading jobs:', error);
      toast({
        title: "Error loading jobs",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filterText, filterStatus, sinceHours, toast, mcp]);

  const handleRequeueJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs' | 'ai_agent_jobs') => {
    try {
      const result = await mcp.requeueJob(jobId, jobTable);
      if (result.ok) {
        toast({
          title: "Job requeued",
          description: "The job has been reset to pending status",
        });
        await loadJobs();
      } else {
        throw new Error('Requeue failed');
      }
    } catch (error) {
      toast({
        title: "Requeue failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDeleteJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs' | 'ai_agent_jobs') => {
    try {
      const result = await mcp.deleteJob(jobId, jobTable);
      if (result.ok) {
        toast({
          title: "Job deleted",
          description: "The job has been removed",
        });
        await loadJobs();
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const runBatchRunner = async () => {
    try {
      await mcp.call('ai-job-batch-runner', { n: 3 });
      toast({ title: 'Batch run triggered' });
      await loadJobs();
    } catch (error) {
      toast({ title: 'Batch run failed', description: error instanceof Error ? error.message : 'Error', variant: 'destructive' });
    }
  };

  const runReconciler = async () => {
    try {
      await mcp.call('jobs-reconciler', {});
      toast({ title: 'Reconciler ran' });
      await loadJobs();
    } catch (error) {
      toast({ title: 'Reconciler failed', description: error instanceof Error ? error.message : 'Error', variant: 'destructive' });
    }
  };

  const runAgentWorker = async () => {
    const q = filterText.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

    try {
      // If the filter looks like a job UUID, target that job explicitly.
      const qs = isUuid ? `&jobId=${encodeURIComponent(q)}` : "";
      await mcp.call(
        `ai-job-runner?worker=1&queue=agent${qs}`,
        isUuid ? { worker: true, queue: "agent", jobId: q } : { worker: true, queue: "agent" },
      );
      toast({ title: isUuid ? "Agent job processed" : "Agent worker kicked" });
      await loadJobs();
    } catch (error) {
      toast({
        title: "Agent worker failed",
        description: error instanceof Error ? error.message : "Error",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      queued: { variant: "secondary", icon: Clock },
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

  const getSeverityBadge = (severity: string) => {
    const s = severity?.toLowerCase();
    if (s === "critical") return <Badge variant="destructive">critical</Badge>;
    if (s === "warning") return <Badge variant="outline">warning</Badge>;
    return <Badge variant="secondary">{s || "info"}</Badge>;
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

  const renderAlertsTable = (items: AlertRecord[]) => {
    if (!items.length) {
      return (
        <Alert>
          <AlertDescription>No active alerts detected.</AlertDescription>
        </Alert>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Count</TableHead>
            <TableHead>Last Seen</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((alert) => (
            <TableRow key={alert.id}>
              <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
              <TableCell className="font-mono text-xs">{alert.type}</TableCell>
              <TableCell className="max-w-md">
                <div className="truncate" title={alert.message}>{alert.message}</div>
              </TableCell>
              <TableCell>{alert.count ?? 1}</TableCell>
              <TableCell>{formatDate(alert.last_seen_at || alert.updated_at || alert.created_at)}</TableCell>
              <TableCell>{alert.resolved_at ? "resolved" : "active"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
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
            <TableCell colSpan={7} className="text-center text-muted-foreground">
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
              <TableCell className="text-xs font-mono">{job.id.slice(0, 8)}...</TableCell>
              <TableCell>
                {job.retry_count ?? 0}/{job.max_retries ?? 3}
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
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/admin/logs?jobId=${encodeURIComponent(job.id)}`)}
                    title="Open logs for this job"
                    data-cta-id="view-job-logs"
                  >
                    Logs
                  </Button>
                  {job.course_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/admin/editor/${encodeURIComponent(job.course_id!)}`)}
                      title="Open in Course Editor"
                      data-cta-id="open-course-editor"
                    >
                      Open
                    </Button>
                  )}
                  {job.course_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await invalidateCourseCache(job.course_id!);
                          toast({ title: 'Cache invalidated', description: job.course_id });
                        } catch (e: any) {
                          toast({ title: 'Invalidate failed', description: e?.message || 'Error', variant: 'destructive' });
                        }
                      }}
                      title="Invalidate CDN cache"
                      data-cta-id="invalidate-cache"
                    >
                      Invalidate
                    </Button>
                  )}
                  {['failed', 'dead_letter', 'stale'].includes(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRequeueJob(job.id, jobTable)}
                      title="Requeue job"
                      data-cta-id="requeue-job"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  {['pending', 'failed', 'dead_letter', 'stale'].includes(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteJob(job.id, jobTable)}
                      title="Delete job"
                      data-cta-id="delete-job"
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

  const filteredAgentJobs = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return agentJobs.filter((job) => {
      if (filterStatus && job.status !== filterStatus) return false;
      if (!q) return true;
      return job.id.toLowerCase().includes(q) || job.job_type.toLowerCase().includes(q);
    });
  }, [agentJobs, filterStatus, filterText]);

  const renderAgentJobSummary = (job: AgentJob): string => {
    const p = (job.payload && typeof job.payload === "object") ? (job.payload as any) : null;
    if (!p) return "";
    if (job.job_type.startsWith("book_generate_")) {
      const bookId = typeof p.bookId === "string" ? p.bookId : "";
      const topic = typeof p.topic === "string" ? p.topic : "";
      const bits = [bookId, topic].filter(Boolean);
      return bits.join(" • ");
    }
    return "";
  };

  const renderAgentJobTable = (jobs: AgentJob[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Job type</TableHead>
          <TableHead>Job Id</TableHead>
          <TableHead>Retries</TableHead>
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
                <div className="font-mono text-xs">{job.job_type}</div>
                {job.status === "processing" ? (() => {
                  const raw = (job.last_heartbeat || job.started_at || job.created_at) as string | null | undefined;
                  const ms = raw ? new Date(raw).getTime() : NaN;
                  const isStalled = Number.isFinite(ms) && Date.now() - ms > 5 * 60 * 1000;
                  if (!isStalled) return null;
                  return (
                    <div className="text-xs text-destructive mt-1 flex items-center gap-1" title="No heartbeat in the last 5 minutes">
                      <AlertCircle className="h-3 w-3" />
                      stalled suspected
                    </div>
                  );
                })() : null}
                {renderAgentJobSummary(job) ? (
                  <div className="text-xs text-muted-foreground mt-1 truncate" title={renderAgentJobSummary(job)}>
                    {renderAgentJobSummary(job)}
                  </div>
                ) : null}
                {job.error ? (
                  <div data-testid="job-error" className="text-xs text-destructive mt-1 truncate" title={String(job.error)}>
                    {String(job.error)}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="text-xs font-mono">{job.id.slice(0, 8)}...</TableCell>
              <TableCell>
                {job.retry_count ?? 0}/{job.max_retries ?? 3}
              </TableCell>
              <TableCell className="text-xs">{formatDate(job.created_at)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/admin/logs?jobId=${encodeURIComponent(job.id)}`)}
                    title="Open logs for this job"
                    data-cta-id="view-job-logs-agent"
                  >
                    Logs
                  </Button>
                  {['failed', 'dead_letter', 'stale'].includes(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRequeueJob(job.id, 'ai_agent_jobs')}
                      title="Requeue job"
                      data-cta-id="requeue-agent-job"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  {['queued', 'failed', 'dead_letter', 'stale'].includes(job.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteJob(job.id, 'ai_agent_jobs')}
                      title="Delete job"
                      data-cta-id="delete-agent-job"
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

  const renderMetricsCards = () => {
    if (!metrics) return null;
    
    const statuses = ['pending', 'processing', 'done', 'failed'];
    const byStatus = metrics.courseJobs?.byStatus || {};
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statuses.map((status) => (
          <Card key={status}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium capitalize">{status}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{byStatus[status] || 0}</div>
            </CardContent>
          </Card>
        ))}
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
          <Button variant="outline" size="sm" onClick={runBatchRunner} data-cta-id="run-batch">
            Run Batch
          </Button>
          <Button variant="outline" size="sm" onClick={runAgentWorker} data-cta-id="run-agent-worker">
            Run Agent Worker
          </Button>
          <Button variant="outline" size="sm" onClick={runReconciler} data-cta-id="run-reconciler">
            Run Reconciler
          </Button>
          <Button variant="default" size="sm" onClick={loadJobs} disabled={loading} data-cta-id="refresh-jobs">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search by job id / job type (agent) or job id / subject (course); filter by status and timeframe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-muted-foreground">Search</label>
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="job id, job type, or subject"
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
                <option value="queued">queued</option>
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
            <Button variant="default" size="sm" onClick={loadJobs} disabled={loading} data-cta-id="apply-filters">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="course" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="course">Course Jobs ({courseJobs.length})</TabsTrigger>
          <TabsTrigger value="media">Media Jobs ({mediaJobs.length})</TabsTrigger>
          <TabsTrigger value="agent">Agent Jobs ({filteredAgentJobs.length})</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="course" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Generation Metrics</CardTitle>
              <CardDescription>Aggregated statistics for AI course generation</CardDescription>
            </CardHeader>
            <CardContent>
              {renderMetricsCards()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Course Jobs</CardTitle>
              <CardDescription>Last {courseJobs.length} course generation jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {renderJobTable(courseJobs, 'ai_course_jobs')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Media Jobs</CardTitle>
              <CardDescription>Last {mediaJobs.length} media generation jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {renderJobTable(mediaJobs, 'ai_media_jobs')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Agent Jobs</CardTitle>
              <CardDescription>Factory queue jobs (BookGen, lessonkit_build, ingest, etc.)</CardDescription>
            </CardHeader>
            <CardContent>{renderAgentJobTable(filteredAgentJobs)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>Job queue health signals</CardDescription>
            </CardHeader>
            <CardContent>
              {renderAlertsTable(alerts)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
