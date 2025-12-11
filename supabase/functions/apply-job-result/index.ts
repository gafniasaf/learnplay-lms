// supabase/functions/apply-job-result/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { handleRequest } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}
if (!AGENT_TOKEN) {
  throw new Error("AGENT_TOKEN is required");
}

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("X-Agent-Token") || "";
  return header && header === AGENT_TOKEN;
}

Deno.serve(withCors(async (req: Request) => {
  const reqId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return Errors.methodNotAllowed(req.method, reqId, req) as any;
  }

  const rl = rateLimit(req);
  if (rl) return rl;

  if (!isAuthorized(req)) {
    return Errors.invalidAuth(reqId, req) as any;
  }

  // Make AGENT token visible for tests (no-op in prod)
  (globalThis as any).__AGENT_TOKEN__ = AGENT_TOKEN;

  // Delegate to testable portable handler
  return await handleRequest(req);
}));


