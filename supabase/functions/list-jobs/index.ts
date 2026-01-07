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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e || "");
  const m = msg.toLowerCase();
  return (
    m.includes("connection reset") ||
    m.includes("connection error") ||
    m.includes("sendrequest") ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("tls") ||
    m.includes("econnreset") ||
    m.includes("fetch") ||
    m.includes("network")
  );
}

function jsonOk(req: Request, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    // IMPORTANT: Lovable/preview can blank-screen on non-200 responses.
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" }),
  });
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

function isUuid(v: string): boolean {
  // v1–v5 UUID format (case-insensitive)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isTestArtifactId(v: unknown): boolean {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s.startsWith("e2e-") || s.startsWith("it-");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "list-jobs");
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonOk(req, { ok: false, error: { code: "method_not_allowed", message: "Method Not Allowed" }, httpStatus: 405 });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return jsonOk(req, {
      ok: false,
      error: { code: message === "Missing organization_id" ? "missing_organization_id" : "unauthorized", message },
      httpStatus: message === "Missing organization_id" ? 400 : 401,
    });
  }

  const organizationId = requireOrganizationId(auth);
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

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

  try {
    // list-jobs is the Factory queue (ai_agent_jobs).
    // Course/media jobs have dedicated endpoints: list-course-jobs, list-media-jobs.
    //
    // IMPORTANT: avoid `select("*")` here. It can produce large payloads (payload/result JSON) and
    // increases the chance of transient connection resets between Edge ↔ PostgREST.
    const selectCols =
      "id,organization_id,job_type,status,payload,result,created_at,created_by,started_at,completed_at,updated_at,error,retry_count,max_retries,last_heartbeat";
    let q = supabase
      .from("ai_agent_jobs")
      .select(selectCols)
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
      // ai_agent_jobs.id is UUID (no ilike support). If the search token looks like a UUID, do exact match.
      // Otherwise, search job_type only (text).
      if (isUuid(searchToken)) {
        q = q.eq("id", searchToken);
      } else {
        q = q.ilike("job_type", `%${searchToken}%`);
      }
    }

    const MAX_ATTEMPTS = 3;
    let lastErr: unknown = null;
    let jobs: any[] | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await q.order("created_at", { ascending: false }).limit(limit);
        if (res.error) {
          lastErr = res.error;
          jobs = null;
        } else {
          jobs = (res.data as any[]) ?? [];
          lastErr = null;
        }
        break;
      } catch (e) {
        lastErr = e;
        if (!isTransientNetworkError(e) || attempt === MAX_ATTEMPTS) break;
        // Small bounded backoff to ride out Cloudflare/postgrest hiccups.
        await sleep(200 * attempt);
      }
    }

    if (lastErr) {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr || "Unknown error");
      // Lovable-safe: never throw/500 here; report as ok:false so UI can keep rendering.
      return jsonOk(req, {
        ok: false,
        error: { code: "upstream_error", message: msg },
        httpStatus: 502,
        requestId,
      });
    }

    // Hide test artifacts from admin lists (E2E/integration job payloads use prefixed ids).
    const filtered =
      (jobs ?? []).filter((j: any) => {
        const payload = j?.payload && typeof j.payload === "object" ? j.payload : {};
        const bookId = (payload as any).bookId;
        const courseId = (payload as any).course_id ?? (payload as any).courseId;
        return !isTestArtifactId(bookId) && !isTestArtifactId(courseId);
      });

    return jsonOk(req, { ok: true, jobs: filtered, requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || "Unknown error");
    return jsonOk(req, { ok: false, error: { code: "internal_error", message: msg }, httpStatus: 500, requestId });
  }
});
