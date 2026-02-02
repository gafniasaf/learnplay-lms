import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonOk(req: Request, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" }),
  });
}

function parseBool(value: string | null, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  return value === "true" || value === "1";
}

function parseIntSafe(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  const num = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(num, min), max);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "list-alerts");
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonOk(req, { ok: false, error: { code: "method_not_allowed", message: "Method Not Allowed" }, httpStatus: 405 });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    return jsonOk(req, { ok: false, error: { code: "unauthorized", message: error instanceof Error ? error.message : "Unauthorized" } });
  }

  const organizationId = requireOrganizationId(auth);

  let params: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      params = await req.json();
    } catch {
      params = {};
    }
  } else {
    const url = new URL(req.url);
    params = Object.fromEntries(url.searchParams.entries());
  }

  const includeResolved =
    typeof params.includeResolved === "boolean"
      ? params.includeResolved
      : parseBool(typeof params.includeResolved === "string" ? params.includeResolved : null, false);
  const limit = parseIntSafe(
    typeof params.limit === "number" ? String(params.limit) : typeof params.limit === "string" ? params.limit : null,
    50,
    1,
    200,
  );

  let query = supabase
    .from("alerts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!includeResolved) {
    query = query.is("resolved_at", null);
  }

  const { data, error } = await query;
  if (error) {
    return jsonOk(req, { ok: false, error: { code: "query_failed", message: error.message } });
  }

  return jsonOk(req, { ok: true, alerts: data || [] });
});
