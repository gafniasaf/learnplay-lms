// supabase/functions/_shared/obs.ts
// Observability utilities for edge functions

import { stdHeaders as coreStdHeaders } from "./cors.ts";

/**
 * Generate a unique request ID
 */
export function newReqId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Extract request ID from headers or generate new one
 */
export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") || newReqId();
}

/**
 * Standard CORS and request ID headers
 * Re-exported from cors.ts with backward-compatible signature
 * @deprecated Import stdHeaders from cors.ts instead for new code
 */
export function stdHeaders(
  extraOrReq?: Record<string, string> | { contentTypeJson?: boolean } | Request,
  reqIdOrExtra?: string | Record<string, string>
): Record<string, string> {
  // Detect signature patterns:
  // Old: stdHeaders(extra, reqId) 
  // New: stdHeaders(req, extra)
  // contentTypeJson: stdHeaders({ contentTypeJson: true }, reqId)
  
  let req: Request | undefined;
  let extra: Record<string, string> | undefined;
  
  if (extraOrReq && 'method' in extraOrReq && 'headers' in extraOrReq) {
    // First arg is Request - new signature: stdHeaders(req, extra)
    req = extraOrReq as Request;
    extra = reqIdOrExtra as Record<string, string> | undefined;
  } else if (extraOrReq && 'contentTypeJson' in extraOrReq && extraOrReq.contentTypeJson) {
    // contentTypeJson flag: stdHeaders({ contentTypeJson: true })
    req = new Request("http://localhost");
    extra = { "Content-Type": "application/json" };
  } else {
    // Old signature - first arg is extra headers: stdHeaders(extra)
    req = new Request("http://localhost");
    extra = extraOrReq as Record<string, string> | undefined;
  }
  
  return coreStdHeaders(req, extra);
}

/**
 * Observability wrapper for edge function handlers
 * Extracts/generates requestId and ensures it's included in all responses
 */
export function withObs<T>(
  functionName: string,
  handler: (req: Request, reqId: string) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const reqId = getRequestId(req);
    const startTime = Date.now();
    
    console.log(`[${reqId}] [${functionName}] Request started`);
    
    try {
      const response = await handler(req, reqId);
      const duration = Date.now() - startTime;
      console.log(`[${reqId}] [${functionName}] Completed in ${duration}ms`);
      return response;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[${reqId}] [${functionName}] Error after ${duration}ms:`, errorMessage);
      throw err;
    }
  };
}
