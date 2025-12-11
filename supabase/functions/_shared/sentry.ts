/**
 * Sentry integration for Edge Functions
 * Lightweight error capture with requestId propagation
 */

/**
 * Capture error to Sentry (if SENTRY_DSN env is set)
 * Falls back to console.error if Sentry is not configured
 */
export async function captureSentryError(
  error: Error | string,
  context: {
    requestId: string;
    function: string;
    userId?: string;
    extra?: Record<string, any>;
  }
): Promise<void> {
  const sentryDsn = Deno.env.get("SENTRY_DSN");
  
  // Always log to console
  console.error(`[${context.function}] Error (reqId: ${context.requestId}):`, error);
  
  if (!sentryDsn) {
    return; // Sentry not configured
  }
  
  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error ? error.stack : undefined;
    
    const payload = {
      message: `[${context.function}] ${errorMessage}`,
      level: "error",
      tags: {
        function: context.function,
        request_id: context.requestId,
        ...(context.userId && { user_id: context.userId }),
      },
      extra: {
        stack: stackTrace,
        ...context.extra,
      },
      timestamp: new Date().toISOString(),
    };
    
    // Send to Sentry API
    await fetch(`https://sentry.io/api/0/projects/${getSentryProjectId(sentryDsn)}/events/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `DSN ${sentryDsn}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (sentryError) {
    // Don't let Sentry errors break the function
    console.error(`[${context.function}] Failed to send to Sentry:`, sentryError);
  }
}

/**
 * Extract project ID from Sentry DSN
 */
function getSentryProjectId(dsn: string): string {
  const match = dsn.match(/\/\/([^@]+)@[^/]+\/(\d+)/);
  return match ? match[2] : "unknown";
}

/**
 * Capture message to Sentry (if SENTRY_DSN env is set)
 */
export async function captureSentryMessage(
  message: string,
  context: {
    requestId: string;
    function: string;
    level?: "info" | "warning" | "error";
    extra?: Record<string, any>;
  }
): Promise<void> {
  const sentryDsn = Deno.env.get("SENTRY_DSN");
  
  // Always log to console
  const logLevel = context.level || "info";
  if (logLevel === "error") {
    console.error(`[${context.function}]`, message);
  } else if (logLevel === "warning") {
    console.warn(`[${context.function}]`, message);
  } else {
    console.log(`[${context.function}]`, message);
  }
  
  if (!sentryDsn || logLevel === "info") {
    return; // Only send warnings and errors to Sentry
  }
  
  try {
    const payload = {
      message: `[${context.function}] ${message}`,
      level: logLevel,
      tags: {
        function: context.function,
        request_id: context.requestId,
      },
      extra: context.extra,
      timestamp: new Date().toISOString(),
    };
    
    await fetch(`https://sentry.io/api/0/projects/${getSentryProjectId(sentryDsn)}/events/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `DSN ${sentryDsn}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (sentryError) {
    console.error(`[${context.function}] Failed to send to Sentry:`, sentryError);
  }
}


