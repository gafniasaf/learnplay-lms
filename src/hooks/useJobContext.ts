/**
 * useJobContext - IgniteZero compliant
 * Uses edge functions instead of direct Supabase calls
 * Polls for updates instead of realtime subscriptions
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useMCP } from './useMCP';

export interface Job {
  id: string;
  course_id?: string;
  subject?: string;
  grade?: string | null;
  grade_band?: string;
  items_per_group?: number;
  levels_count?: number | null;
  mode?: string;
  status: string;
  progress_stage?: string | null;
  progress_percent?: number | null;
  progress_message?: string | null;
  result_path?: string | null;
  error?: string | null;
  summary?: string | Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
  generation_duration_ms?: number | null;
}

export interface JobEvent {
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

export interface JobContext {
  job: Job | null;
  events: JobEvent[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Unified job context hook: fetches job + events by jobId via edge function.
 * Polls for updates (replaces realtime subscriptions).
 * Single source of truth for all pipeline panels.
 */
export function useJobContext(jobId: string | null, pollInterval = 2000): JobContext {
  const { getCourseJob } = useMCP();
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchJobDetails = useCallback(async () => {
    if (!jobId) {
      setJob(null);
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      const response = await getCourseJob(jobId, true);

      const ok = (response as { ok: boolean }).ok;
      const errCode = (response as any)?.error?.code as string | undefined;
      if (!ok && errCode === "transient_network") {
        // Retryable upstream blip (Edge ↔ PostgREST). Keep polling; don't flip UI into hard error.
        return;
      }

      if (ok) {
        setJob((response as { job: Job }).job);
        setEvents(((response as { events?: JobEvent[] }).events || []) as JobEvent[]);
        setError(null);
      } else {
        throw new Error('Failed to fetch job');
      }
    } catch (err) {
      console.warn('[useJobContext] Error fetching job:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch job'));
    } finally {
      setLoading(false);
    }
  }, [jobId, getCourseJob]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Initial fetch
    fetchJobDetails();

    // Poll for updates (replaces realtime subscription)
    // Only poll if job is not in terminal state
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
  }, [jobId, fetchJobDetails, pollInterval, job?.status]);

  const refresh = useCallback(() => {
    fetchJobDetails();
  }, [fetchJobDetails]);

  return useMemo(() => ({ job, events, loading, error, refresh }), [job, events, loading, error, refresh]);
}
