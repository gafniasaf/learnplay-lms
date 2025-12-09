/**
 * useJobStatus - IgniteZero compliant
 * Uses MCP instead of direct Supabase calls
 * Polls for updates instead of realtime subscriptions
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMCP } from './useMCP';

export type JobStatus = {
  jobId: string;
  state: string; // queued|running|done|failed|stalled|...
  step: string;  // queued|generating|storage_write|catalog_update|verifying|done|failed
  progress: number; // 0..100
  message?: string;
  lastEventTime?: string | null;
};

export function useJobStatus(jobId: string | null) {
  const mcp = useMCP();
  const [status, setStatus] = useState<JobStatus | null>(null);
  const lastUpdate = useRef<number>(0);

  // Poll for job status updates
  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      
      try {
        const data = await mcp.getJobStatus(jobId);
        if (data) {
          setStatus({
            jobId,
            state: data.state,
            step: data.step,
            progress: data.progress,
            message: data.message,
            lastEventTime: new Date().toISOString(),
          });
          lastUpdate.current = Date.now();
        }
      } catch (err) {
        console.warn('[useJobStatus] poll error', jobId, err);
      }
      
      // Only poll if job is not in terminal state
      if (status && ['done', 'failed', 'dead_letter'].includes(status.state)) {
        return;
      }
      
      timeoutId = setTimeout(poll, 2000); // Poll every 2 seconds
    }

    // Initial poll
    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [jobId, mcp, status?.state]);

  return useMemo(() => ({ status }), [status]);
}
