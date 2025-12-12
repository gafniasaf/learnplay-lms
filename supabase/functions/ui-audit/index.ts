import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "summary";

    if (action === "summary") {
      // Return summary of UI audit status
      const response = {
        ok: true,
        data: {
          ok: true,
          total: 0,
          byType: {},
        },
        total: 0,
        byType: {},
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

    if (action === "run") {
      // Run full UI audit (would normally scan files, but Edge Functions can't access source)
      // This is a placeholder that returns an empty audit result
      const response = {
        ok: true,
        data: {
          ok: true,
          issues: [],
        },
        issues: [],
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: message,
      data: { ok: false, error: message },
    }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }
});

