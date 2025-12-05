// supabase/functions/_shared/log.ts
// Centralized logging and error tracking for edge functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

interface LogContext {
  functionName?: string;
  userId?: string;
  requestId?: string;
  jobId?: string;
  durationMs?: number;
  errorCode?: string;
  [key: string]: any;
}

// Lazy admin client
let _admin: any | null = null;
function supabaseAdmin() {
  if (_admin) return _admin;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _admin;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract request ID from headers or generate new one
 */
export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") || generateRequestId();
}

/**
 * Write log to database (non-blocking, best-effort)
 */
async function writeLogToDatabase(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context?: LogContext
) {
  try {
    const admin = supabaseAdmin();
    // Extract metadata without polluting the main fields
    const { functionName, userId, requestId, jobId, durationMs, errorCode, ...metadata } = context || {};

    const logEntry = {
      function_name: functionName || 'unknown',
      request_id: requestId || null,
      level,
      message,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      user_id: userId || null,
      job_id: jobId || null,
      duration_ms: durationMs || null,
      error_code: errorCode || null,
      stack_trace: (metadata as any).stack || null,
    };

    if (admin) {
      // Prefer secure RPC to avoid any policy drift
      await admin.rpc('log_edge_event', {
        p_function_name: logEntry.function_name,
        p_level: logEntry.level,
        p_message: logEntry.message,
        p_request_id: logEntry.request_id,
        p_user_id: logEntry.user_id,
        p_job_id: logEntry.job_id,
        p_duration_ms: logEntry.duration_ms,
        p_error_code: logEntry.error_code,
        p_metadata: logEntry.metadata,
        p_stack_trace: logEntry.stack_trace,
      });
      return;
    }

    // Fallback to REST RPC if admin client not available
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
    fetch(`${SUPABASE_URL}/rest/v1/rpc/log_edge_event`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        p_function_name: logEntry.function_name,
        p_level: logEntry.level,
        p_message: logEntry.message,
        p_request_id: logEntry.request_id,
        p_user_id: logEntry.user_id,
        p_job_id: logEntry.job_id,
        p_duration_ms: logEntry.duration_ms,
        p_error_code: logEntry.error_code,
        p_metadata: logEntry.metadata,
        p_stack_trace: logEntry.stack_trace,
      }),
    }).catch(() => {});
  } catch {
    // Fail silently - console logs still work
  }
}

let sentryInitialized = false;
let Sentry: any = null;

/**
 * Initialize Sentry for error tracking (opt-in via SENTRY_DSN secret)
 */
async function initSentry() {
  if (sentryInitialized) return;
  
  const sentryDsn = Deno.env.get("SENTRY_DSN");
  if (!sentryDsn) {
    console.log("[Sentry] DSN not configured - error tracking disabled");
    sentryInitialized = true;
    return;
  }

  try {
    // Dynamically import Sentry for Deno
    const sentryModule = await import("https://deno.land/x/sentry@7.119.1/index.mjs");
    Sentry = sentryModule;
    
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: 0.1,
      environment: Deno.env.get("ENVIRONMENT") || "production",
    });
    
    console.log("[Sentry] Initialized successfully");
    sentryInitialized = true;
  } catch (error) {
    console.error("[Sentry] Failed to initialize:", error);
    sentryInitialized = true;
  }
}

/**
 * Log info message with request-id
 */
export function logInfo(message: string, context?: LogContext) {
  const requestId = context?.requestId ? `[${context.requestId}] ` : "";
  console.log(`${requestId}[INFO] ${message}`, context ? JSON.stringify(context) : "");
  
  // Write to database asynchronously
  writeLogToDatabase('info', message, context);
}

/**
 * Log warning with request-id
 */
export function logWarn(message: string, context?: LogContext) {
  const requestId = context?.requestId ? `[${context.requestId}] ` : "";
  console.warn(`${requestId}[WARN] ${message}`, context ? JSON.stringify(context) : "");
  
  // Write to database asynchronously
  writeLogToDatabase('warn', message, context);
}

/**
 * Log error with optional Sentry capture and request-id
 */
export async function logError(
  message: string,
  error: Error | unknown,
  context?: LogContext
) {
  const requestId = context?.requestId ? `[${context.requestId}] ` : "";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : undefined;
  
  // Always log to console
  console.error(`${requestId}[ERROR] ${message}`, {
    error: errorMessage,
    stack: stackTrace,
    ...context,
  });

  // Write to database with stack trace
  await writeLogToDatabase('error', `${message}: ${errorMessage}`, {
    ...context,
    stack: stackTrace,
  });

  // Attempt to send to Sentry if available
  await initSentry();
  
  if (Sentry && error instanceof Error) {
    Sentry.captureException(error, {
      tags: {
        function_name: context?.functionName || "unknown",
        request_id: context?.requestId || "unknown",
        ...(context?.userId && { user_id: context.userId }),
      },
      extra: context,
    });
  }
}

/**
 * Create a scoped logger for a specific function
 */
export function createLogger(functionName: string) {
  return {
    info: (message: string, context?: Omit<LogContext, 'functionName'>) =>
      logInfo(message, { ...context, functionName }),
    
    warn: (message: string, context?: Omit<LogContext, 'functionName'>) =>
      logWarn(message, { ...context, functionName }),
    
    error: (message: string, error: Error | unknown, context?: Omit<LogContext, 'functionName'>) =>
      logError(message, error, { ...context, functionName }),
  };
}

/**
 * Wrap async handler with error logging
 */
export function withErrorLogging<T>(
  functionName: string,
  handler: () => Promise<T>
): Promise<T> {
  return handler().catch(async (error) => {
    await logError(`Unhandled error in ${functionName}`, error, { functionName });
    throw error;
  });
}