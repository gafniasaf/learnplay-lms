import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  const startTime = Date.now();

  try {
    // Check database connection
    let dbStatus = "unknown";
    let dbLatency = 0;
    
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const dbStart = Date.now();
      try {
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        const { error } = await supabase.from("organizations").select("id").limit(1);
        dbLatency = Date.now() - dbStart;
        dbStatus = error ? "error" : "ok";
      } catch {
        dbStatus = "error";
        dbLatency = Date.now() - dbStart;
      }
    }

    // Check storage
    let storageStatus = "unknown";
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        const { error } = await supabase.storage.listBuckets();
        storageStatus = error ? "error" : "ok";
      } catch {
        storageStatus = "error";
      }
    }

    // Check required env vars
    const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const missingEnvVars = requiredEnvVars.filter(v => !Deno.env.get(v));

    // Token check
    const tokenCheck = {
      agentToken: !!AGENT_TOKEN,
      acceptedByEdge: AGENT_TOKEN ? ["enqueue-job", "ai-job-runner"] : [],
      tokens: {
        AGENT_TOKEN: AGENT_TOKEN ? "configured" : "missing",
      },
      protected: ["enqueue-job", "ai-job-runner", "generate-course"],
      mismatches: [] as string[],
      suggestions: missingEnvVars.length > 0 ? [`Set missing env vars: ${missingEnvVars.join(", ")}`] : [],
    };

    const response = {
      ok: dbStatus === "ok" && missingEnvVars.length === 0,
      timestamp: new Date().toISOString(),
      latency: Date.now() - startTime,
      edge: {
        status: "ok",
        region: Deno.env.get("DENO_REGION") || "unknown",
      },
      database: {
        status: dbStatus,
        latency: dbLatency,
      },
      storage: {
        status: storageStatus,
      },
      tokenCheck,
      data: {
        ok: dbStatus === "ok",
        tokenCheck,
        edge: {
          status: "ok",
        },
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
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

