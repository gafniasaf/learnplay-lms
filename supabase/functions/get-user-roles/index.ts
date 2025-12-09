import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "get-user-roles");
  }

  // Check for agent token first (backend/automation calls)
  const agentToken = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
  const expectedAgentToken = Deno.env.get("AGENT_TOKEN");
  const isAgentAuth = expectedAgentToken && agentToken === expectedAgentToken;

  let userId: string;
  let client;

  if (isAgentAuth) {
    // Agent auth - use service role and get userId from body/query
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Service role key not configured" }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }
    client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    // For agent calls, get userId from body or query
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { 
        body = await req.json() as Record<string, unknown>; 
      } catch (error) {
        // Body parsing failed - treat as empty (may be GET request or malformed JSON)
        console.warn("[get-user-roles] Failed to parse request body:", error instanceof Error ? error.message : String(error));
      }
    }
    const url = new URL(req.url);
    userId = (typeof body.userId === 'string' ? body.userId : '') || url.searchParams.get("userId") || "";
    
    if (!userId) {
      // Return empty roles for agent without userId (system check)
      return new Response(
        JSON.stringify({ roles: [], _agent: true }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }
  } else {
    // User auth - require Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    const token = authHeader.slice(7);
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }
    userId = user.id;
  }

  try {
    const { data, error } = await client
      .from("user_roles")
      .select("user_id, organization_id, role")
      .eq("user_id", userId);

    if (error) {
      console.error("[get-user-roles] Query error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    return new Response(
      JSON.stringify({ roles: data || [] }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (err) {
    console.error("[get-user-roles] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

