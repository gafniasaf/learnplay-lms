import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runJob } from "../ai-job-runner/runner.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

// Create admin client for DB operations
const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface EnqueueBody {
  jobType?: string;
  payload?: Record<string, unknown>;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "enqueue-job");
  }

  if (req.method !== "POST") {
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

  let body: EnqueueBody;
  try {
    body = await req.json() as EnqueueBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.jobType || typeof body.jobType !== "string") {
    return new Response(JSON.stringify({ error: "jobType is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const payload = body.payload ?? {};
  const organizationId = requireOrganizationId(auth);
  const inserted = await adminSupabase
    .from("ai_agent_jobs")
    .insert({ job_type: body.jobType, status: "queued", payload, organization_id: organizationId })
    .select()
    .single();

  if (inserted.error || !inserted.data) {
    return new Response(JSON.stringify({ error: inserted.error?.message || "Failed to enqueue job" }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const jobId = inserted.data.id as string;

  await adminSupabase
    .from("ai_agent_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const result = await runJob(body.jobType, payload, jobId);
    await adminSupabase
      .from("ai_agent_jobs")
      .update({ status: "completed", result, finished_at: new Date().toISOString() })
      .eq("id", jobId);

    return new Response(JSON.stringify({ ok: true, jobId, status: "completed", result }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await adminSupabase
      .from("ai_agent_jobs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", jobId);

    return new Response(JSON.stringify({ ok: false, jobId, status: "failed", error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
