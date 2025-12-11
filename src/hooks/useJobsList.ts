/**
 * useJobsList - IgniteZero compliant
 * Uses edge functions instead of direct Supabase calls
 * Polls for updates instead of realtime subscriptions
 */
import { useEffect, useState, useCallback } from 'react';
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
  result_path?: string | null;
  error?: string | null;
  summary?: string | Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

interface UseJobsListOptions {
  status?: 'pending' | 'running' | 'done' | 'failed' | 'processing';
  limit?: number;
  pollInterval?: number; // ms, default 5000
  enabled?: boolean;
}

export function useJobsList(options?: UseJobsListOptions) {
  const mcp = useMCP();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [shouldPoll, setShouldPoll] = useState(true);
  const { status, limit = 50, pollInterval = 5000, enabled = true } = options || {};

  const fetchJobs = useCallback(async () => {
    if (!enabled || !shouldPoll) return;
    
    try {
      setLoading(true);
      const response = await mcp.listCourseJobs({
        status,
        limit,
      });

      if ((response as { ok: boolean }).ok) {
        setJobs((response as { jobs: Job[] }).jobs);
        setError(null);
        setShouldPoll(true); // Re-enable polling on success
      } else {
        throw new Error('Failed to fetch jobs');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isCorsError = errorMessage.toLowerCase().includes('cors') || 
                         errorMessage.toLowerCase().includes('not accessible from this origin');
      
      console.warn('[useJobsList] Error fetching jobs:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch jobs'));
      
      // Stop polling on CORS errors (they won't resolve by retrying)
      if (isCorsError) {
        console.warn('[useJobsList] CORS error detected - stopping polling');
        setShouldPoll(false);
      }
    } finally {
      setLoading(false);
    }
  }, [status, limit, enabled, mcp, shouldPoll]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchJobs();

    // Only poll if shouldPoll is true (stops on CORS errors)
    if (!shouldPoll) {
      return;
    }

    // Poll for updates (replaces realtime subscription)
    const interval = setInterval(fetchJobs, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchJobs, pollInterval, enabled, shouldPoll]);

  // Manual refresh function (re-enables polling if it was stopped)
  const refresh = useCallback(() => {
    setShouldPoll(true);
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, error, refresh, isPolling: shouldPoll };
}
