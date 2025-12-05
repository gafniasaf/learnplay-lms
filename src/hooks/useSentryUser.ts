/**
 * Hook to automatically sync Sentry user context with auth state
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/react";
import { useAuth } from "./useAuth";

/**
 * Keeps Sentry's user context in sync with Supabase authentication.
 * We no longer fetch profile metadata—just attach the user ID/email so
 * crash reports can be traced back to a session.
 */
export function useSentryUser() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      Sentry.setUser({
        id: user.id,
        email: user.email ?? undefined,
      });
    } else {
      Sentry.setUser(null);
    }
  }, [user?.id, user?.email]);
}
