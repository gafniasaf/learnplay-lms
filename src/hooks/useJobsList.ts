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
  const { status, limit = 50, pollInterval = 5000, enabled = true } = options || {};

  const fetchJobs = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setLoading(true);
      const response = await mcp.listCourseJobs({
        status,
        limit,
      });

      if ((response as { ok: boolean }).ok) {
        setJobs((response as { jobs: Job[] }).jobs);
        setError(null);
      } else {
        throw new Error('Failed to fetch jobs');
      }
    } catch (err) {
      console.warn('[useJobsList] Error fetching jobs:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch jobs'));
    } finally {
      setLoading(false);
    }
  }, [status, limit, enabled, mcp]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchJobs();

    // Poll for updates (replaces realtime subscription)
    const interval = setInterval(fetchJobs, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchJobs, pollInterval, enabled]);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, error, refresh };
}
