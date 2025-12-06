// supabase/functions/_shared/obs.ts
// Backward-compatibility shim - all utilities now live in cors.ts

/**
 * @deprecated Import from cors.ts instead:
 * import { newReqId, getRequestId, stdHeaders, handleOptions, withCors } from "../_shared/cors.ts";
 */

// Re-export all utilities from cors.ts for backward compatibility
export { newReqId, getRequestId, stdHeaders, handleOptions, withCors } from "./cors.ts";

/**
 * @deprecated Use withCors from cors.ts instead
 * Observability wrapper for edge function handlers
 */
export function withObs<T>(
  functionName: string,
  handler: (req: Request, reqId: string) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const { getRequestId: getReqId } = await import("./cors.ts");
    const reqId = getReqId(req);
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
