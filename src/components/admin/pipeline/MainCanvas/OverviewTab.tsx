import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDistanceToNow } from 'date-fns';
import { useJobContext } from '@/hooks/useJobContext';
import { PhaseProgressStepper, PhaseStep } from '../shared/PhaseProgressStepper';
import { MetricCard } from '../shared/MetricCard';
import { ReviewFeedback } from '../shared/ReviewFeedback';
import { parseJobSummary } from '@/lib/pipeline/jobParser';
import { formatLogEntry } from '@/lib/pipeline/logFormatter';
import { STEP_TO_PHASE_INDEX } from '@/lib/pipeline/phaseSteps';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Play } from 'lucide-react';
import { MetricSkeleton } from '../Skeleton';

interface OverviewTabProps {
  jobId: string | null;
}

export function OverviewTab({ jobId }: OverviewTabProps) {
  const { job, events, loading, error } = useJobContext(jobId);
  const [triggering, setTriggering] = useState(false);

  const summary = useMemo(() => {
    if (!job?.summary) return null;
    return parseJobSummary(job.summary);
  }, [job?.summary]);

  // Check if job is stuck (pending for > 1 minute with no events)
  const isStuck = useMemo(() => {
    if (!job || job.status !== 'pending') return false;
    const age = Date.now() - new Date(job.created_at).getTime();
    return age > 60000 && events.length === 0;
  }, [job, events]);

  const triggerJobRunner = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-job-batch-runner', {
        body: { n: 3 }
      });

      if (error) throw error;

      toast.success('Job runner triggered', {
        description: `Processing queue... Refresh to see updates`
      });
    } catch (error) {
      console.error('Failed to trigger job runner:', error);
      toast.error('Failed to trigger job runner', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setTriggering(false);
    }
  };

  const phases: PhaseStep[] = useMemo(() => {
    // Ground truth: actual steps observed from job_events
    const observed = new Set((events || []).map((e) => e.step));

    // Map each label to the step name we expect in job_events
    const stepMap: Record<string, string> = {
      Generate: 'generating',
      Validate: 'validating',
      Repair: 'repairing',
      Review: 'reviewing',
      Images: 'images',
      Enrich: 'enriching',
    };

    const statusFor = (label: keyof typeof stepMap): 'complete' | 'active' | 'pending' | 'failed' => {
      const step = stepMap[label];
      // Complete only if the specific step was observed
      if (observed.has(step)) return 'complete';
      // If job failed, mark as failed
      if (job?.status === 'failed') return 'failed';
      // Otherwise pending (we do not infer completion from job.status)
      return 'pending';
    };

    return [
      { id: 0, label: 'Generate', duration: summary?.phases?.generation?.duration, status: statusFor('Generate') },
      { id: 1, label: 'Validate', duration: summary?.phases?.validation?.duration, status: statusFor('Validate') },
      { id: 2, label: 'Repair', duration: summary?.phases?.repair?.duration, status: statusFor('Repair') },
      { id: 3, label: 'Review', duration: summary?.phases?.review?.duration, status: statusFor('Review') },
      { id: 4, label: 'Images', duration: summary?.phases?.images?.duration, status: statusFor('Images') },
      { id: 5, label: 'Enrich', duration: summary?.phases?.enrichment?.duration, status: statusFor('Enrich') }
    ];
  }, [events, job?.status, summary]);

  if (!jobId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select a job to view details</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded" />
              <div className="h-4 w-1/3 bg-gray-200 animate-pulse rounded" />
            </div>
          </CardHeader>
        </Card>
        <div className="grid grid-cols-3 gap-4">
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
        </div>
      </div>
    );
  }

  // If job is not yet available, continue rendering the stepper (we'll show header once it loads)

  return (
    <div className="space-y-6">
      {/* Job Header (optional) */}
      {job && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold mb-2">{job.subject}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Badge variant={job.status === 'done' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                    {job.status}
                  </Badge>
                  <span>{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
                  <span>{job.grade_band || job.grade}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {job.status === 'done' && job.result_path && (
                  <Button variant="default">View Course</Button>
                )}
                <Button
                  variant="outline"
                  data-testid="btn-rerun"
                  onClick={async () => {
                    if (!job) return;
                    try {
                      const jobType = (job as any)?.type || (job as any)?.job_type || 'variants';
                      const subject = job.subject || 'job-retry';
                      const courseId = (job as any)?.course_id || (job as any)?.courseId;
                      const { data, error } = await supabase.functions.invoke('mcp-metrics-proxy', {
                        body: { method: 'lms.enqueueAndTrack', params: { type: jobType, subject, courseId, timeoutSec: 60 } },
                      });
                      if (!error && data?.ok !== false) {
                        const payload = data?.data || data;
                        toast.success('Re-run started', { description: `Job: ${payload?.jobId || 'N/A'}` });
                      } else {
                        throw new Error(error?.message || 'Failed to re-run');
                      }
                    } catch (e) {
                      toast.error('Re-run failed', { description: e instanceof Error ? e.message : 'Unknown error' });
                    }
                  }}
                >
                  Re-run
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Stuck Job Warning */}
      {job && isStuck && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              This job has been pending for over a minute. The job runner may not be active.
            </span>
            <Button
              onClick={triggerJobRunner}
              disabled={triggering}
              size="sm"
              variant="outline"
              className="ml-4"
            >
              {triggering ? (
                <>
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  Triggering...
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-2" />
                  Trigger Job Runner
                </>
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Phase Stepper */}
      <PhaseProgressStepper phases={phases} />

      {/* Metrics */}
      {job && (
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            icon="📊"
            value={summary?.metrics?.totalItems || 0}
            label="Items Generated"
            detail={`${job.items_per_group} per group`}
          />
          <MetricCard
            icon="🔄"
            value={summary?.metrics?.totalRepairs || 0}
            label="Items Repaired"
            detail={summary?.metrics?.totalRepairs ? '1 batch' : 'No repairs'}
          />
          <MetricCard
            icon="⚡"
            value={summary?.metrics?.totalAICalls || 0}
            label="AI Calls"
            detail={`$${summary?.metrics?.estimatedCost?.toFixed(2) || '0.00'}`}
          />
        </div>
      )}

      {/* Quality Review Feedback */}
      {job && (job.status === 'failed' || job.status === 'done') && (
        <ReviewFeedback jobId={job.id} />
      )}

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No events yet</p>
            ) : (
              events.slice().reverse().map((event) => {
                const log = formatLogEntry(event);
                return (
                  <div key={event.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded">
                    <span className="text-lg">{log.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-xs text-muted-foreground">{log.timestamp}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
