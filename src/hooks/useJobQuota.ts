import { useEffect, useState } from 'react';
import { useMCP } from '@/hooks/useMCP';
import { isLiveMode } from '@/lib/env';

interface JobQuota {
  jobs_last_hour: number;
  hourly_limit: number;
  jobs_last_day: number;
  daily_limit: number;
}

// Default quota for guest/unauthenticated users and mock mode
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
  const mcp = useMCP();
  const [quota, setQuota] = useState<JobQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchQuota = async () => {
      // In guest mode or mock mode, return default quota without hitting the database
      if (isGuestMode() || !isLiveMode()) {
        if (isMounted) {
          setQuota(DEFAULT_QUOTA);
          setLoading(false);
        }
        return;
      }

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

    // Refresh quota every minute (skip in guest mode or mock mode)
    const shouldPoll = !isGuestMode() && isLiveMode();
    const interval = shouldPoll ? setInterval(fetchQuota, 60000) : null;

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  return { quota, loading, error };
}
