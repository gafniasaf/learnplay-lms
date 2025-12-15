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
  const mcpRef = useRef(mcp);
  mcpRef.current = mcp;
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
        const data = await mcpRef.current.getJobStatus(jobId);
        if (data) {
          const next = {
            jobId,
            state: data.state,
            step: data.step,
            progress: data.progress,
            message: data.message,
            lastEventTime: new Date().toISOString(),
          } as JobStatus;
          setStatus({
            ...next,
          });
          lastUpdate.current = Date.now();

          // Stop polling on terminal state based on freshest value.
          if (['done', 'failed', 'dead_letter'].includes(next.state)) {
            return;
          }
        }
      } catch (err) {
        console.warn('[useJobStatus] poll error', jobId, err);
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
  }, [jobId]);

  return useMemo(() => ({ status }), [status]);
}
