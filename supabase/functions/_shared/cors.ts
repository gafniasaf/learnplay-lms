// supabase/functions/_shared/cors.ts
// Centralized CORS handling with automatic header injection

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

// Safe debug flag that works in Deno (Edge) and in Node/Jest without Deno global
const CORS_DEBUG: boolean = (() => {
	// Use globalThis to avoid ReferenceError in Node
	try {
		// @ts-ignore - Deno is only available at runtime in Edge
		return (globalThis as any).Deno?.env?.get?.("CORS_DEBUG") === "1";
	} catch {
		return false;
	}
})();

/**
 * Generate standard CORS + CSP headers for all responses
 * - Echo Origin when present (and allow credentials); otherwise fallback to "*"
 * - Always include Vary: Origin
 * - Include Allow-Methods and Allow-Headers on all responses
 * - Add Content-Security-Policy for XSS protection
 */
export function stdHeaders(req?: Request, extra?: Record<string, string>): Record<string, string> {
  const reqOrigin = req?.headers.get("origin") || "";
  // Always echo origin in dev/preview; fallback to * when missing
  const origin = reqOrigin.trim() !== "" ? reqOrigin : "*";

	if (CORS_DEBUG) {
    console.log("[stdHeaders] Request origin:", reqOrigin, "-> Using:", origin);
  }

  // Ensure Authorization is always allowed, merge with requested headers if present
  const requested = (req?.headers.get("access-control-request-headers") || "").toLowerCase();
  const baseAllowed = [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-request-id",
    "if-none-match",
    "if-modified-since",
  ];
  const merged = Array.from(new Set((requested ? requested.split(/,\s*/) : []).concat(baseAllowed))).filter(Boolean).join(", ");

  const allowMethods = req?.headers.get("access-control-request-method") || "GET, POST, OPTIONS, HEAD";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": allowMethods,
    "Access-Control-Allow-Headers": merged,
    // Expose additional debugging headers for clients
    "Access-Control-Expose-Headers": "ETag, Cache-Control, Age, Content-Type, Content-Disposition, X-Request-Id, Vary",
    // CSP for edge functions (API responses)
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    // Additional security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...(extra || {}),
  };

  // Only add credentials and Vary when echoing a concrete origin (not "*")
  if (origin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }

	if (CORS_DEBUG) {
    console.log("[stdHeaders] Generated headers:", JSON.stringify(headers, null, 2));
  }

  return headers;
}

/**
 * Handle OPTIONS preflight requests with dynamic header echoing
 */
export function handleOptions(req: Request, reqId: string): Response {
  const allowMethods = req.headers.get("access-control-request-method") || "GET, POST, OPTIONS, HEAD";
  const headers = stdHeaders(req, {
    "Access-Control-Allow-Methods": allowMethods,
    "X-Request-Id": reqId,
  });
  
  // Debug log to diagnose CORS issues
	if (CORS_DEBUG) {
    console.log("[handleOptions] Generated headers:", JSON.stringify(headers, null, 2));
  }
  
  return new Response("ok", {
    status: 200,
    headers,
  });
}

/**
 * Wrap handler with automatic CORS injection.
 * Guarantees CORS headers for ALL responses: 200/4xx/5xx/304/405/HEAD/OPTIONS.
 */
export function withCors(
  handler: (req: Request) => Promise<Response | Record<string, any> | string>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const reqId = req.headers.get("x-request-id") || newReqId();

    // Always satisfy preflight
    if (req.method === "OPTIONS") {
      return handleOptions(req, reqId);
    }

    try {
      const result = await handler(req);

      // Handle error objects from Errors helper (must come before Response check)
      if (result && typeof result === 'object' && !Array.isArray(result) && !(result instanceof Response)) {
        // Check if it's an error object with _error and _status
        if ('_error' in result && '_status' in result) {
          const { _error, _status, ...body } = result as any;
          return new Response(JSON.stringify(body), {
            status: _status,
            headers: stdHeaders(req, {
              "Content-Type": "application/json",
              "X-Request-Id": reqId,
            }),
          });
        }
        
        // Otherwise it's a regular success object
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: stdHeaders(req, {
            "Content-Type": "application/json",
            "X-Request-Id": reqId,
          }),
        });
      }

      if (result instanceof Response) {
        const cloned = result.clone();

        // Collect existing headers
        const existing: Record<string, string> = {};
        cloned.headers.forEach((value, key) => {
          existing[key] = value;
        });

        // Strip any pre-existing CORS headers regardless of case to avoid duplicates
        const stripKeys = [
          "access-control-allow-origin",
          "access-control-allow-headers",
          "access-control-allow-methods",
          "access-control-allow-credentials",
          "access-control-expose-headers",
          "vary",
        ];
        for (const k of Object.keys(existing)) {
          if (stripKeys.includes(k.toLowerCase())) {
            delete existing[k];
          }
        }

        // Build CORS headers (do not set Content-Type here)
        const cors = stdHeaders(req, { "X-Request-Id": reqId });

        // Merge: start with sanitized existing, then add CORS keys
        const finalHeaders: Record<string, string> = { ...existing, ...cors };

        return new Response(cloned.body, {
          status: cloned.status,
          statusText: cloned.statusText,
          headers: finalHeaders,
        });
      }

      // Plain object or string → wrap with CORS, set appropriate Content-Type
      const isString = typeof result === "string";
      const body = isString ? result : JSON.stringify(result);
      const contentType = isString ? "text/plain; charset=utf-8" : "application/json";

      return new Response(body, {
        status: 200,
        headers: stdHeaders(req, {
          "Content-Type": contentType,
          "X-Request-Id": reqId,
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const errorBody = {
        error: { code: "internal_error", message },
        requestId: reqId,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(errorBody), {
        status: 500,
        headers: stdHeaders(req, {
          "Content-Type": "application/json",
          "X-Request-Id": reqId,
        }),
      });
    }
  };
}
