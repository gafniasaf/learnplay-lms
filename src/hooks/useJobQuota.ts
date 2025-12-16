import { useEffect, useState } from 'react';
import { useMCP } from '@/hooks/useMCP';

interface JobQuota {
  jobs_last_hour: number;
  hourly_limit: number;
  jobs_last_day: number;
  daily_limit: number;
}

// Default quota for guest/unauthenticated users (and as a safe UI fallback on error)
const DEFAULT_QUOTA: JobQuota = {
  jobs_last_hour: 0,
  hourly_limit: 10,
  jobs_last_day: 0,
  daily_limit: 50,
};

export function useJobQuota() {
  const mcp = useMCP();
  const [quota, setQuota] = useState<JobQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchQuota = async () => {
      try {
        // Use MCP to fetch job quota (routes through Edge Function)
        const response = await mcp.getRecord('UserJobQuota', 'current') as unknown as { record?: JobQuota };
        const data = response?.record;

        if (!data) {
          throw new Error('Job quota record not found');
        }

        if (isMounted) {
          setQuota(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          // IgniteZero "No Silent Mocks" policy: FAIL LOUDLY in live mode
          // Surface the error to the user instead of silently falling back
          const errorObj = err instanceof Error ? err : new Error('Failed to fetch job quota');
          console.error('[useJobQuota] Error fetching quota:', errorObj);
          setError(errorObj);
          // Still provide default quota so UI doesn't break, but error is visible
          setQuota(DEFAULT_QUOTA);
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
      if (interval) clearInterval(interval);
    };
  }, []);

  return { quota, loading, error };
}
