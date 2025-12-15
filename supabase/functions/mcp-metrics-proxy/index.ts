import { withCors, getRequestId } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";

/**
 * MCP Metrics Proxy (Edge Function)
 *
 * This endpoint is called by the UI as `lms.mcpMetricsProxy` via `callGet`, which maps
 * to the edge function name `mcp-metrics-proxy`.
 *
 * Today we keep this intentionally lightweight:
 * - Satisfy CORS preflight for localhost and embedded preview origins (withCors)
 * - Return a structured payload so UI can render gracefully
 *
 * If/when you wire a real metrics backend, extend `handleSummary()` to fetch it.
 */

function handleSummary() {
  return {
    ok: true,
    summary: {},
  };
}

Deno.serve(
  withCors(async (req: Request) => {
    const reqId = getRequestId(req);

    if (req.method !== "GET") {
      return Errors.methodNotAllowed(req.method, reqId, req);
    }

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "summary";

    if (type === "summary") {
      const payload = handleSummary();
      return new Response(JSON.stringify({ ...payload, requestId: reqId }), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
      });
    }

    return Errors.invalidRequest(`Unknown type: ${type}`, reqId, req);
  }),
);

