import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface JobQuota {
  jobs_last_hour: number;
  hourly_limit: number;
  jobs_last_day: number;
  daily_limit: number;
}

// Default quota for guest/unauthenticated users
const DEFAULT_QUOTA: JobQuota = {
  jobs_last_hour: 0,
  hourly_limit: 10,
  jobs_last_day: 0,
  daily_limit: 50,
};

// Check if in guest mode
function isGuestMode(): boolean {
  if (typeof window === 'undefined') return false;
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('guest') === '1') return true;
  try { return localStorage.getItem('guestMode') === 'true'; } catch { return false; }
}

export function useJobQuota() {
  const [quota, setQuota] = useState<JobQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchQuota = async () => {
      // In guest mode, return default quota without hitting the database
      if (isGuestMode()) {
        if (isMounted) {
          setQuota(DEFAULT_QUOTA);
          setLoading(false);
        }
        return;
      }

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
          // On error, use default quota instead of failing
          console.warn('[useJobQuota] Using default quota due to error:', err);
          setQuota(DEFAULT_QUOTA);
          setError(null); // Don't show error to user
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchQuota();

    // Refresh quota every minute (skip in guest mode)
    const interval = isGuestMode() ? null : setInterval(fetchQuota, 60000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  return { quota, loading, error };
}
