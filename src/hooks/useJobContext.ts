import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Job {
  id: string;
  course_id: string;
  subject: string;
  grade: string | null;
  grade_band: string;
  items_per_group: number;
  levels_count: number | null;
  mode: string;
  status: string;
  result_path: string | null;
  error: string | null;
  summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  generation_duration_ms?: number | null;
}

export interface JobEvent {
  id: string;
  job_id: string;
  status: string;
  step: string;
  progress: number | null;
  message: string | null;
  created_at: string;
  seq?: number;
}

export interface JobContext {
  job: Job | null;
  events: JobEvent[];
  loading: boolean;
  error: Error | null;
}

/**
 * Unified job context hook: fetches job + events by jobId, subscribes to realtime updates.
 * Single source of truth for all pipeline panels.
 */
export function useJobContext(jobId: string | null): JobContext {
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setEvents([]);
      setLoading(false);
      setError(null);
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
          setJob(jobData as Job);
          setEvents((eventsData || []) as JobEvent[]);
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
          if (isMounted && payload?.new) {
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
          if (isMounted && payload?.new) {
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
  }, [jobId]);

  return useMemo(() => ({ job, events, loading, error }), [job, events, loading, error]);
}

