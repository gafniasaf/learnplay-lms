import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    // Authenticate request
    await authenticateRequest(req);

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Database not configured");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    // Try to fetch from edge_logs table if it exists
    const { data: logs, error } = await supabase
      .from("edge_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      // Table might not exist - return empty array
      console.warn("edge_logs table not found or error:", error.message);
      return new Response(JSON.stringify({ 
        ok: true, 
        logs: [],
        records: [],
        message: "No logs table configured",
      }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      logs: logs || [],
      records: logs || [],
    }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (message === "Unauthorized" || message.includes("Unauthorized")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    return new Response(JSON.stringify({ 
      ok: false, 
      error: message,
      logs: [],
      records: [],
    }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }
});

