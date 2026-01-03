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

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "list-jobs");
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return new Response(
      JSON.stringify({ error: message }),
      { status: message === "Missing organization_id" ? 400 : 401, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }

  const organizationId = requireOrganizationId(auth);

  // Parse filters from either query params (GET) or JSON body (POST).
  const url = new URL(req.url);
  const qp = url.searchParams;

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      const parsed = await req.json();
      body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      body = {};
    }
  }

  const limitRaw = (body.limit ?? qp.get("limit")) as unknown;
  const statusRaw = (body.status ?? qp.get("status")) as unknown;
  const sinceHoursRaw = (body.sinceHours ?? body.since_hours ?? qp.get("sinceHours") ?? qp.get("since_hours")) as unknown;
  const searchRaw = (body.search ?? body.q ?? qp.get("search") ?? qp.get("q")) as unknown;
  const jobTypeRaw = (body.jobType ?? body.job_type ?? qp.get("jobType") ?? qp.get("job_type")) as unknown;

  let limit = safeNumber(limitRaw) ?? 20;
  limit = Math.min(100, Math.max(1, Math.floor(limit)));

  const status = safeStr(statusRaw).trim();
  const jobType = safeStr(jobTypeRaw).trim();

  const sinceHours = safeNumber(sinceHoursRaw);
  const sinceMs =
    sinceHours && sinceHours > 0
      ? Date.now() - sinceHours * 60 * 60 * 1000
      : null;

  const search = safeStr(searchRaw).trim();
  // Keep search safe for PostgREST filter syntax (this is a best-effort filter for admin scanning).
  const searchToken = search.replace(/[^\w\-:]/g, "").trim();

  // list-jobs is the Factory queue (ai_agent_jobs).
  // Course/media jobs have dedicated endpoints: list-course-jobs, list-media-jobs.
  let q = supabase
    .from("ai_agent_jobs")
    .select("*")
    .eq("organization_id", organizationId);

  if (status) {
    q = q.eq("status", status);
  }
  if (jobType) {
    q = q.eq("job_type", jobType);
  }
  if (sinceMs) {
    q = q.gte("created_at", new Date(sinceMs).toISOString());
  }
  if (searchToken) {
    q = q.or(`id.ilike.*${searchToken}*,job_type.ilike.*${searchToken}*`);
  }

  const { data: jobs, error } = await q.order("created_at", { ascending: false }).limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  return new Response(JSON.stringify({ ok: true, jobs: jobs ?? [] }), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" }),
  });
});
