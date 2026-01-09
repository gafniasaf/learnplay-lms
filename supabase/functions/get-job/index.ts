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

function jsonOk(req: Request, body: unknown): Response {
  // IMPORTANT: avoid non-200 responses to prevent blank screens in preview environments.
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" }),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string")
        ? String((e as any).message)
        : String(e || "");
  const m = msg.toLowerCase();
  return (
    m.includes("connection reset") ||
    m.includes("connection error") ||
    m.includes("connection lost") ||
    m.includes("network") ||
    m.includes("econnreset") ||
    m.includes("sendrequest") ||
    m.includes("timed out") ||
    m.includes("timeout")
  );
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  const max = Math.min(5, Math.max(1, Math.floor(attempts)));
  let lastErr: unknown = null;
  for (let i = 1; i <= max; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientNetworkError(e) || i === max) break;
      await sleep(150 * i);
    }
  }
  throw lastErr;
}

function isMissingEventsTable(err: unknown): boolean {
  const msg =
    typeof (err as any)?.message === "string"
      ? String((err as any).message)
      : typeof err === "string"
        ? err
        : "";
  // PostgREST schema cache errors vary by deployment; keep matching permissive.
  return (
    msg.includes("Could not find the table") ||
    msg.includes("job_events") ||
    msg.includes("agent_job_events")
  );
}

async function tryLoadCourseJobEvents(jobId: string, limit: number): Promise<any[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));

  try {
    const { data: events, error } = await withRetry(() =>
      supabase
        .from("job_events")
        .select("id,job_id,seq,step,status,progress,message,meta,created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(safeLimit),
    );
    if (error) {
      if (isMissingEventsTable(error)) return [];
      throw error;
    }
    return Array.isArray(events) ? events : [];
  } catch (e) {
    if (isMissingEventsTable(e)) return [];
    throw e;
  }
}

async function tryLoadAgentJobEvents(jobId: string, limit: number): Promise<any[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));

  try {
    const { data: events, error } = await withRetry(() =>
      supabase
        .from("agent_job_events")
        .select("id,job_id,seq,step,status,progress,message,meta,created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(safeLimit),
    );
    if (error) {
      if (isMissingEventsTable(error)) return [];
      throw error;
    }
    return Array.isArray(events) ? events : [];
  } catch (e) {
    if (isMissingEventsTable(e)) return [];
    throw e;
  }
}

async function tryDownloadJson(path: string): Promise<unknown | null> {
  try {
    const { data: file, error } = await supabase.storage.from("courses").download(path);
    if (error || !file) return null;
    const text = await file.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

serve(async (req: Request): Promise<Response> => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, "get-job");
  }

  if (req.method !== "GET") {
    return jsonOk(req, {
      ok: false,
      error: { code: "method_not_allowed", message: "Method Not Allowed" },
      httpStatus: 405,
      requestId,
    });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const eventsLimitRaw = url.searchParams.get("eventsLimit") || url.searchParams.get("events_limit");
  const includeArtifacts =
    (url.searchParams.get("includeArtifacts") || url.searchParams.get("include_artifacts")) === "true";
  if (!id) {
    return jsonOk(req, {
      ok: false,
      error: { code: "invalid_request", message: "id is required" },
      httpStatus: 400,
      requestId,
    });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return jsonOk(req, {
      ok: false,
      error: {
        code: message === "Missing organization_id" ? "missing_organization_id" : "unauthorized",
        message,
      },
      httpStatus: message === "Missing organization_id" ? 400 : 401,
      requestId,
    });
  }

  // Require org context for consistency across Edge functions (even if some legacy tables
  // don't have organization_id columns in PostgREST schema cache yet).
  let organizationId = "";
  try {
    organizationId = requireOrganizationId(auth);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Missing organization_id";
    return jsonOk(req, {
      ok: false,
      error: { code: "missing_organization_id", message },
      httpStatus: 400,
      requestId,
    });
  }

  // Prefer ai_course_jobs (current pipeline), fall back to ai_agent_jobs (legacy).
  let job: any | null = null;
  let jobSource: "ai_course_jobs" | "ai_agent_jobs" | null = null;

  // IMPORTANT: Do not filter by organization_id at query-time here.
  // Some deployments may not expose newer columns via PostgREST schema cache immediately.
  // Instead, enforce visibility via auth type:
  // - User auth: only allow jobs created by that user
  // - Agent auth: trusted internal caller (worker/tests)
  let courseQuery = supabase
    .from("ai_course_jobs")
    .select("*")
    .eq("id", id);
  if (auth.type === "user" && auth.userId) {
    courseQuery = courseQuery.eq("created_by", auth.userId);
  }

  let courseJob: any | null = null;
  let courseErr: any | null = null;
  try {
    const res = await withRetry(() => courseQuery.maybeSingle());
    courseJob = (res as any)?.data ?? null;
    courseErr = (res as any)?.error ?? null;
  } catch (e) {
    if (isTransientNetworkError(e)) {
      const message = e instanceof Error ? e.message : String(e || "Network connection lost");
      return jsonOk(req, {
        ok: false,
        error: { code: "transient_network", message: message || "Network connection lost" },
        httpStatus: 503,
        requestId,
      });
    }
    const message = e instanceof Error ? e.message : String(e || "Unknown error");
    return jsonOk(req, {
      ok: false,
      error: { code: "internal_error", message },
      httpStatus: 500,
      requestId,
    });
  }

  if (courseErr && (courseErr as any)?.code !== "PGRST116") {
    const isTransient = isTransientNetworkError(courseErr);
    return jsonOk(req, {
      ok: false,
      error: {
        code: isTransient ? "transient_network" : "upstream_error",
        message: safeStr((courseErr as any)?.message) || "Failed to load course job",
      },
      httpStatus: isTransient ? 503 : 502,
      requestId,
    });
  }

  if (courseJob) {
    job = courseJob;
    jobSource = "ai_course_jobs";
  } else {
    let agentQuery = supabase
      .from("ai_agent_jobs")
      .select("*")
      .eq("id", id);

    let agentJob: any | null = null;
    let agentErr: any | null = null;
    try {
      const res = await withRetry(() => agentQuery.maybeSingle());
      agentJob = (res as any)?.data ?? null;
      agentErr = (res as any)?.error ?? null;
    } catch (e) {
      if (isTransientNetworkError(e)) {
        const message = e instanceof Error ? e.message : String(e || "Network connection lost");
        return jsonOk(req, {
          ok: false,
          error: { code: "transient_network", message: message || "Network connection lost" },
          httpStatus: 503,
          requestId,
        });
      }
      const message = e instanceof Error ? e.message : String(e || "Unknown error");
      return jsonOk(req, {
        ok: false,
        error: { code: "internal_error", message },
        httpStatus: 500,
        requestId,
      });
    }

    if (agentErr) {
      const isNotFound = (agentErr as any)?.code === "PGRST116";
      const isTransient = isTransientNetworkError(agentErr);
      const message = safeStr((agentErr as any)?.message) || (isNotFound ? "Job not found" : "Failed to load job");
      return jsonOk(req, {
        ok: false,
        error: {
          code: isTransient ? "transient_network" : isNotFound ? "not_found" : "upstream_error",
          message,
        },
        httpStatus: isTransient ? 503 : isNotFound ? 404 : 502,
        requestId,
      });
    }

    if (agentJob) {
      // Enforce org isolation for ai_agent_jobs even when using service role.
      // Do NOT rely on query-time filters (schema-cache drift).
      if (auth.type === "user") {
        const jobOrgId = (agentJob as any).organization_id as string | null | undefined;
        if (!jobOrgId || jobOrgId !== organizationId) {
          return jsonOk(req, {
            ok: false,
            error: { code: "not_found", message: "Job not found" },
            httpStatus: 404,
            requestId,
          });
        }
      }
      job = agentJob;
      jobSource = "ai_agent_jobs";
    }
  }

  if (!job) {
    return jsonOk(req, {
      ok: false,
      error: { code: "not_found", message: "Job not found" },
      httpStatus: 404,
      requestId,
    });
  }

  let eventsLimit = 0;
  if (eventsLimitRaw) {
    const n = Number(eventsLimitRaw);
    if (Number.isFinite(n)) eventsLimit = Math.max(0, Math.floor(n));
  }
  const events =
    await (async () => {
      try {
        return jobSource === "ai_agent_jobs"
          ? await tryLoadAgentJobEvents(id, eventsLimit)
          : await tryLoadCourseJobEvents(id, eventsLimit);
      } catch (e) {
        if (isTransientNetworkError(e)) {
          const message = e instanceof Error ? e.message : String(e || "Network connection lost");
          return jsonOk(req, {
            ok: false,
            error: { code: "transient_network", message: message || "Network connection lost" },
            httpStatus: 503,
            requestId,
          });
        }
        const message = e instanceof Error ? e.message : String(e || "Unknown error");
        return jsonOk(req, {
          ok: false,
          error: { code: "internal_error", message },
          httpStatus: 500,
          requestId,
        });
      }
    })();

  // If the events loader returned a Response (transient/internal), return it directly.
  if (events instanceof Response) return events;

  let artifacts: Record<string, unknown> | undefined = undefined;
  if (includeArtifacts) {
    const summaryPath = `debug/jobs/${id}/summary.json`;
    const validationPath = `debug/jobs/${id}/validation_issues.json`;
    const summary = await tryDownloadJson(summaryPath);
    const validation = await tryDownloadJson(validationPath);
    artifacts = {
      summary,
      validationIssues: validation,
    };
  }

  return jsonOk(req, { ok: true, job, events, jobSource, ...(artifacts ? { artifacts } : {}), requestId });
});
