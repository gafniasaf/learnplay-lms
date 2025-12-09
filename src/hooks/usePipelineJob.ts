/**
 * usePipelineJob - IgniteZero compliant
 * Uses edge functions instead of direct Supabase calls
 * Polls for updates instead of realtime subscriptions
 */
import { useEffect, useState, useCallback } from 'react';
import { useMCP } from './useMCP';
import type { Job } from './useJobsList';

interface JobEvent {
  id: string;
  job_id: string;
  status?: string;
  step?: string;
  event_type?: string;
  progress?: number | null;
  message?: string | null;
  payload?: Record<string, unknown>;
  created_at: string;
  seq?: number;
}

interface UsePipelineJobOptions {
  enabled?: boolean;
  pollInterval?: number;
}

export function usePipelineJob(jobId: string | null, options?: UsePipelineJobOptions) {
  const mcp = useMCP();
  const { enabled = true, pollInterval = 2000 } = options || {};
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchJobDetails = useCallback(async () => {
    if (!jobId || !enabled) {
      return;
    }

    try {
      const response = await mcp.getCourseJob(jobId, true);

      if ((response as { ok: boolean }).ok) {
        setJob((response as { job: Job }).job);
        setEvents(((response as { events?: JobEvent[] }).events || []) as JobEvent[]);
        setError(null);
      } else {
        throw new Error('Failed to fetch job');
      }
    } catch (err) {
      console.warn('[usePipelineJob] Error fetching job:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch job'));
    } finally {
      setLoading(false);
    }
  }, [jobId, enabled, mcp]);

  useEffect(() => {
    if (!jobId || !enabled) {
      setJob(null);
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Initial fetch
    fetchJobDetails();

    // Poll for updates (replaces realtime subscription)
    const interval = setInterval(() => {
      // Check if job is in terminal state
      if (job && ['done', 'failed', 'dead_letter'].includes(job.status)) {
        return; // Don't poll for completed jobs
      }
      fetchJobDetails();
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [jobId, enabled, fetchJobDetails, pollInterval, job?.status]);

  const refresh = useCallback(() => {
    fetchJobDetails();
  }, [fetchJobDetails]);

  return { job, events, loading, error, refresh };
}
