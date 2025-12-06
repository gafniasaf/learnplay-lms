import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type JobStatus = {
  jobId: string;
  state: string; // queued|running|done|failed|stalled|...
  step: string;  // queued|generating|storage_write|catalog_update|verifying|done|failed
  progress: number; // 0..100
  message?: string;
  lastEventTime?: string | null;
};

type JobEventsRow = {
  step?: string | null;
  status?: string | null;
  progress?: number | null;
  message?: string | null;
  created_at?: string | null;
};

type JobEventsPayload = {
  new: JobEventsRow;
};

export function useJobStatus(jobId: string | null) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const lastUpdate = useRef<number>(0);

  // Subscribe to Realtime job_events for this job
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`job_events:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_events', filter: `job_id=eq.${jobId}` },
        (payload: JobEventsPayload) => {
          const row = payload.new;
          setStatus((prev) => {
            const prevStep = prev?.step || 'generating';
            const nextStep = row.step === 'heartbeat' ? prevStep : (row.step || 'generating');
            const next: JobStatus = {
              jobId,
              state: row.status || prev?.state || 'info',
              step: nextStep,
              progress: typeof row.progress === 'number' ? row.progress : (prev?.progress ?? 10),
              message: row.message || prev?.message || '',
              lastEventTime: row.created_at ?? null,
            };
            return next;
          });
          lastUpdate.current = Date.now();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  // Poll fallback every 10s if no events in 15s
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      const elapsed = Date.now() - lastUpdate.current;
      if (elapsed > 15000) {
        try {
          const { data, error } = await supabase.functions.invoke('job-status', { body: { jobId } });
          if (!error && data) {
            setStatus(data as JobStatus);
            lastUpdate.current = Date.now();
          }
        } catch (err) {
          console.warn('[useJobStatus] poll error', jobId, err);
        }
      }
      timeoutId = setTimeout(poll, 10000);
    }

    timeoutId = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [jobId]);

  return useMemo(() => ({ status }), [status]);
}
