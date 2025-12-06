import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Job } from './useJobsList';

interface JobEvent {
  id: string;
  job_id: string;
  status: string;
  step: string;
  progress: number | null;
  message: string | null;
  created_at: string;
}

interface UsePipelineJobOptions {
  enabled?: boolean;
}

export function usePipelineJob(jobId: string | null, options?: UsePipelineJobOptions) {
  const { enabled = true } = options || {};
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!jobId || !enabled) {
      setJob(null);
      setEvents([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchJobDetails = async () => {
      try {
        setLoading(true);

        // Fetch job
        const { data: jobData, error: jobError } = await supabase
          .from('ai_course_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (jobError) throw jobError;

        // Fetch events
        const { data: eventsData, error: eventsError } = await supabase
          .from('job_events')
          .select('*')
          .eq('job_id', jobId)
          .order('seq', { ascending: true });

        if (eventsError) throw eventsError;

        if (isMounted) {
          setJob(jobData);
          setEvents(eventsData || []);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch job'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchJobDetails();

    // Subscribe to job updates
    const jobChannel = supabase
      .channel(`job_${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_course_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          if (isMounted) {
            setJob(payload.new as Job);
          }
        }
      )
      .subscribe();

    // Subscribe to events
    const eventsChannel = supabase
      .channel(`job_events_${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_events',
          filter: `job_id=eq.${jobId}`
        },
        (payload) => {
          if (isMounted) {
            setEvents(prev => [...prev, payload.new as JobEvent]);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(jobChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [jobId, enabled]);

  return { job, events, loading, error };
}
