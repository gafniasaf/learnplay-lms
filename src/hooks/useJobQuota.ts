import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface JobQuota {
  jobs_last_hour: number;
  hourly_limit: number;
  jobs_last_day: number;
  daily_limit: number;
}

export function useJobQuota() {
  const [quota, setQuota] = useState<JobQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchQuota = async () => {
      try {
        const { data, error } = await supabase
          .from('user_job_quota')
          .select('*')
          .single();

        if (error) throw error;

        if (isMounted) {
          setQuota(data as JobQuota);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to fetch quota'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchQuota();

    // Refresh quota every minute
    const interval = setInterval(fetchQuota, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { quota, loading, error };
}
