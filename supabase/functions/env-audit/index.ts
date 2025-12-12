import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

// Required environment variables for the system
const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const OPTIONAL_ENV_VARS = [
  "AGENT_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  try {
    const missing: string[] = [];
    const inconsistent: string[] = [];
    const invalid: string[] = [];
    const probes: Record<string, string> = {};

    // Check required env vars
    for (const envVar of REQUIRED_ENV_VARS) {
      const value = Deno.env.get(envVar);
      if (!value) {
        missing.push(envVar);
      } else {
        probes[envVar] = "ok";
      }
    }

    // Check optional env vars
    for (const envVar of OPTIONAL_ENV_VARS) {
      const value = Deno.env.get(envVar);
      probes[envVar] = value ? "ok" : "not_set";
    }

    // Validate SUPABASE_URL format
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (supabaseUrl && !supabaseUrl.startsWith("https://")) {
      invalid.push("SUPABASE_URL (must start with https://)");
    }

    const ok = missing.length === 0 && invalid.length === 0;

    const response = {
      ok,
      data: {
        ok,
        missing,
        inconsistent,
        invalid,
        probes,
      },
      missing,
      inconsistent,
      invalid,
      probes,
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

