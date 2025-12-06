/**
 * Sentry utilities for enhanced error tracking
 */

import * as Sentry from "@sentry/react";
import { callEdgeFunctionGet } from "@/lib/api/common";

/**
 * Set user context in Sentry with role information
 * Call this after authentication or when user data changes
 */
export async function setSentryUser(userId: string | null) {
  if (!userId) {
    Sentry.setUser(null);
    return;
  }

  try {
    // Fetch user profile with role via Edge Function (infrastructure-level call)
    const response = await callEdgeFunctionGet<{ record?: { role?: string; full_name?: string } }>(
      'get-record',
      { entity: 'Profile', id: userId }
    );
    const profile = response?.record;

    if (profile) {
      Sentry.setUser({
        id: userId,
        username: profile.full_name || undefined,
      });

      // Set role as tag for filtering
      if (profile.role) {
        Sentry.setTag("user_role", profile.role);
      }
    } else {
      Sentry.setUser({ id: userId });
    }
  } catch (error) {
    console.error("Failed to set Sentry user context:", error);
    // Set basic user info even if profile fetch fails
    Sentry.setUser({ id: userId });
  }
}

/**
 * Clear Sentry user context on logout
 */
export function clearSentryUser() {
  Sentry.setUser(null);
  Sentry.setTag("user_role", undefined);
}

/**
 * Capture error with additional context
 */
export function captureError(
  error: Error,
  context?: {
    route?: string;
    action?: string;
    requestId?: string;
    [key: string]: any;
  }
) {
  Sentry.captureException(error, {
    tags: {
      route: context?.route || window.location.pathname,
      ...(context?.requestId && { request_id: context.requestId }),
    },
    extra: context,
  });
}

/**
 * Capture message for non-error tracking
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, any>
) {
  Sentry.captureMessage(message, {
    level,
    tags: {
      route: window.location.pathname,
    },
    extra: context,
  });
}

/**
 * Add breadcrumb for debugging context
 */
export function addBreadcrumb(
  message: string,
  category: string = "custom",
  data?: Record<string, any>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    level: "info",
    data,
  });
}
