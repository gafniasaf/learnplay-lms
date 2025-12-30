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

function isMissingJobEventsTable(err: unknown): boolean {
  const msg =
    typeof (err as any)?.message === "string"
      ? String((err as any).message)
      : typeof err === "string"
        ? err
        : "";
  // PostgREST schema cache errors vary by deployment; keep matching permissive.
  return msg.includes("Could not find the table") || msg.includes("job_events");
}

async function tryLoadJobEvents(jobId: string, limit: number): Promise<any[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));

  try {
    const { data: events, error } = await supabase
      .from("job_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .limit(safeLimit);
    if (error) {
      if (isMissingJobEventsTable(error)) return [];
      throw error;
    }
    return Array.isArray(events) ? events : [];
  } catch (e) {
    if (isMissingJobEventsTable(e)) return [];
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
  if (req.method === "OPTIONS") {
    return handleOptions(req, "get-job");
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const eventsLimitRaw = url.searchParams.get("eventsLimit") || url.searchParams.get("events_limit");
  const includeArtifacts =
    (url.searchParams.get("includeArtifacts") || url.searchParams.get("include_artifacts")) === "true";
  if (!id) {
    return new Response(JSON.stringify({ error: "id is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
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

  // Require org context for consistency across Edge functions (even if some legacy tables
  // don't have organization_id columns in PostgREST schema cache yet).
  requireOrganizationId(auth);

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

  const { data: courseJob, error: courseErr } = await courseQuery.maybeSingle();

  if (courseErr && (courseErr as any)?.code !== "PGRST116") {
    return new Response(JSON.stringify({ error: courseErr.message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
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
    if (auth.type === "user" && auth.userId) {
      agentQuery = agentQuery.eq("created_by", auth.userId);
    }

    const { data: agentJob, error: agentErr } = await agentQuery.maybeSingle();

    if (agentErr) {
      return new Response(JSON.stringify({ error: agentErr.message }), {
        status: (agentErr as any)?.code === "PGRST116" ? 404 : 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    if (agentJob) {
      job = agentJob;
      jobSource = "ai_agent_jobs";
    }
  }

  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  let eventsLimit = 0;
  if (eventsLimitRaw) {
    const n = Number(eventsLimitRaw);
    if (Number.isFinite(n)) eventsLimit = Math.max(0, Math.floor(n));
  }
  const events = await tryLoadJobEvents(id, eventsLimit);

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

  return new Response(JSON.stringify({ ok: true, job, events, jobSource, ...(artifacts ? { artifacts } : {}) }), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" }),
  });
});
