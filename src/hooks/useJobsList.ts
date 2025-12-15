/**
 * useJobsList - IgniteZero compliant
 * Uses edge functions instead of direct Supabase calls
 * Polls for updates instead of realtime subscriptions
 */
import { useEffect, useRef, useState, useCallback } from 'react';
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

function isLovablePreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h.includes('lovable.app') || h.includes('lovableproject.com') || h.includes('lovable.dev');
}

function isPageVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function useJobsList(options?: UseJobsListOptions) {
  const { listCourseJobs } = useMCP();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [shouldPoll, setShouldPoll] = useState(true);
  const defaultPollInterval = isLovablePreviewHost() ? 15000 : 5000;
  const { status, limit = 50, pollInterval = defaultPollInterval, enabled = true } = options || {};

  // Prevent overlapping polls (setInterval can pile up if requests are slow)
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const lastWarnAtRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(
    (delayMs: number) => {
      clearTimer();
      // Guard against disabled polling or hidden tab.
      if (!enabled || !shouldPoll) return;
      if (!isPageVisible()) return;
      timerRef.current = window.setTimeout(() => {
        void fetchJobs({ reason: 'poll' });
      }, delayMs);
    },
    // fetchJobs is defined below; included via function hoisting in JS runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, shouldPoll, clearTimer, pollInterval, status, limit]
  );

  const fetchJobs = useCallback(
    async ({ reason }: { reason: 'initial' | 'poll' | 'manual' }) => {
      if (!enabled || !shouldPoll) return;
      if (!isPageVisible()) return;
      if (inFlightRef.current) return;
    
      inFlightRef.current = true;
      const showLoading = reason === 'initial' || reason === 'manual' || !hasLoadedOnceRef.current;

      try {
        if (showLoading) setLoading(true);

        const response = await listCourseJobs({
          status,
          limit,
        });

        if ((response as { ok: boolean }).ok) {
          setJobs((response as { jobs: Job[] }).jobs);
          setError(null);
          consecutiveErrorsRef.current = 0;
          hasLoadedOnceRef.current = true;
          // Re-enable polling on success
          setShouldPoll(true);

          // Schedule next poll at the normal interval.
          scheduleNext(pollInterval);
          return;
        }

        throw new Error('Failed to fetch jobs');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const msg = errorMessage.toLowerCase();

        const isCorsError = msg.includes('cors') || msg.includes('not accessible from this origin');
        const isResourceError =
          msg.includes('err_insufficient_resources') ||
          msg.includes('insufficient_resources') ||
          msg.includes('failed to fetch') ||
          msg.includes('network');

        setError(err instanceof Error ? err : new Error('Failed to fetch jobs'));

        // Rate-limit console noise: max once per 10s.
        const now = Date.now();
        if (now - lastWarnAtRef.current > 10_000) {
          lastWarnAtRef.current = now;
          console.warn('[useJobsList] Error fetching jobs:', err);
        }

        // Stop polling on CORS errors (they won't resolve by retrying)
        if (isCorsError) {
          console.warn('[useJobsList] CORS error detected - stopping polling');
          setShouldPoll(false);
          clearTimer();
          return;
        }

        // Exponential backoff on transient/network/resource exhaustion errors.
        if (isResourceError) {
          consecutiveErrorsRef.current += 1;
        } else {
          // Unknown errors: slow down a bit but don’t explode.
          consecutiveErrorsRef.current = Math.max(consecutiveErrorsRef.current, 1);
        }

        const backoffBase = pollInterval;
        const backoffMs = Math.min(60_000, backoffBase * Math.pow(2, Math.min(consecutiveErrorsRef.current, 5)));
        scheduleNext(backoffMs);
      } finally {
        inFlightRef.current = false;
        if (showLoading) setLoading(false);
      }
    },
    [enabled, shouldPoll, status, limit, listCourseJobs, pollInterval, scheduleNext, clearTimer]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      clearTimer();
      return;
    }

    // Initial fetch
    void fetchJobs({ reason: 'initial' });

    // Only poll if shouldPoll is true (stops on CORS errors)
    if (!shouldPoll) {
      clearTimer();
      return;
    }

    // Start polling loop (uses setTimeout scheduling to avoid overlapping requests).
    scheduleNext(pollInterval);

    return () => {
      clearTimer();
    };
  }, [fetchJobs, pollInterval, enabled, shouldPoll, clearTimer, scheduleNext]);

  // Manual refresh function (re-enables polling if it was stopped)
  const refresh = useCallback(() => {
    consecutiveErrorsRef.current = 0;
    setShouldPoll(true);
    void fetchJobs({ reason: 'manual' });
  }, [fetchJobs]);

  return { jobs, loading, error, refresh, isPolling: shouldPoll };
}
