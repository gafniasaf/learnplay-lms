// supabase/functions/_shared/requestContext.ts
// Request context utilities for tracking and tracing

import { getRequestId } from "./log.ts";

export interface RequestContext {
  requestId: string;
  userId?: string;
  functionName: string;
  startTime: number;
}

/**
 * Create request context from incoming request
 */
export function createRequestContext(
  req: Request,
  functionName: string,
  userId?: string
): RequestContext {
  return {
    requestId: getRequestId(req),
    userId,
    functionName,
    startTime: Date.now(),
  };
}

/**
 * Add request-id to response headers
 */
export function addRequestIdToResponse(
  response: Response,
  requestId: string
): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Log request duration
 */
export function logRequestDuration(context: RequestContext) {
  const duration = Date.now() - context.startTime;
  console.log(
    `[${context.requestId}] [TIMING] ${context.functionName} completed in ${duration}ms`
  );
  return duration;
}


