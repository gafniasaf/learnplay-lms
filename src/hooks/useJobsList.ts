import { useEffect, useState } from 'react';
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
}

interface UseJobsListOptions {
  status?: 'pending' | 'running' | 'done' | 'failed';
  limit?: number;
}

export function useJobsList(options?: UseJobsListOptions) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchJobs = async () => {
      try {
        setLoading(true);
        let query = supabase
          .from('ai_course_jobs')
          .select('*')
          .order('created_at', { ascending: false });

        if (options?.status) {
          query = query.eq('status', options.status);
        }

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        if (isMounted) {
          setJobs(data || []);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch jobs'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchJobs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('ai_course_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_course_jobs'
        },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [options?.status, options?.limit]);

  return { jobs, loading, error };
}
