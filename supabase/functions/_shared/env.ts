// supabase/functions/_shared/env.ts
// Environment variable validation utilities

import { Errors } from "./error.ts";

/**
 * Required environment variables
 */
export interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/**
 * Validate required environment variables
 * @param required - Array of required env var names
 * @param reqId - Optional request ID for error tracking
 * @returns Error response if validation fails, null if ok
 */
export function validateEnv(
  required: Array<keyof EnvConfig>,
  reqId?: string
): Response | null {
  const missing: string[] = [];

  for (const key of required) {
    const value = Deno.env.get(key);
    if (!value || value.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[${reqId || "unknown"}] Missing required environment variables: ${missing.join(", ")}`
    );
    
    return new Response(
      JSON.stringify({
        error: {
          code: "config_error",
          message: `Server misconfiguration: Missing required environment variables: ${missing.join(", ")}`,
        },
        requestId: reqId || "unknown",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      }
    );
  }

  return null;
}

/**
 * Get environment variable with validation
 * @throws Error if variable is missing
 */
export function requireEnv(key: keyof EnvConfig): string {
  const value = Deno.env.get(key);
  if (!value || value.trim() === "") {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}


