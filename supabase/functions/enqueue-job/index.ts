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
  runSync?: boolean; // Force synchronous execution (for testing/short jobs)
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

  // We currently support the primary factory job used by the UI: ai_course_generate.
  // (Other job types have dedicated endpoints.)
  if (body.jobType !== "ai_course_generate") {
    return new Response(JSON.stringify({ error: `Unsupported jobType: ${body.jobType}` }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  // Derive required fields from payload (accept a couple legacy key names)
  const courseId =
    (typeof (payload as any).course_id === "string" && (payload as any).course_id) ||
    (typeof (payload as any).courseId === "string" && (payload as any).courseId) ||
    null;
  const subject =
    (typeof (payload as any).subject === "string" && (payload as any).subject) || null;
  const gradeBand =
    (typeof (payload as any).grade_band === "string" && (payload as any).grade_band) ||
    (typeof (payload as any).gradeBand === "string" && (payload as any).gradeBand) ||
    (typeof (payload as any).grade === "string" && (payload as any).grade) ||
    null;
  const mode =
    (payload as any).mode === "numeric" ? "numeric" : (payload as any).mode === "options" ? "options" : null;
  const itemsPerGroup =
    typeof (payload as any).items_per_group === "number"
      ? (payload as any).items_per_group
      : typeof (payload as any).itemsPerGroup === "number"
        ? (payload as any).itemsPerGroup
        : null;

  if (!courseId) {
    return new Response(JSON.stringify({ error: "course_id is required in payload" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
  if (!subject) {
    return new Response(JSON.stringify({ error: "subject is required in payload" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
  if (!gradeBand) {
    return new Response(JSON.stringify({ error: "grade_band (or grade) is required in payload" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
  if (!mode) {
    return new Response(JSON.stringify({ error: "mode is required in payload (options|numeric)" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  // Use DB RPC (avoids PostgREST schema cache issues when columns were added recently).
  // NOTE: The RPC does not currently persist organization_id/created_by; that is acceptable for now
  // because list-course-jobs/admin processing uses service-role access.
  const { data: jobId, error: enqueueErr } = await adminSupabase.rpc("enqueue_ai_job", {
    p_subject: subject,
    p_format: "practice",
    p_course_id: courseId,
    p_extra: {
      items_per_group: itemsPerGroup ?? 12,
      mode,
      grade_band: gradeBand,
      grade: typeof (payload as any).grade === "string" ? (payload as any).grade : undefined,
      organization_id: organizationId, // best-effort; ignored by RPC but useful for future-proofing
    },
  });

  if (enqueueErr || !jobId) {
    return new Response(JSON.stringify({ error: enqueueErr?.message || "Failed to enqueue job" }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  // Job is now queued with status "pending"
  // A separate worker (pg_cron / background job) will pick it up and run it
  // This prevents Edge Function timeouts for long-running AI tasks
  
  // For short jobs, we can optionally run them inline
  // Use runSync=true in body to force sync execution
  const SHORT_RUNNING_JOBS = ['smoke-test', 'marketing'];
  const runInline = body.runSync === true || SHORT_RUNNING_JOBS.includes(body.jobType);
  
  if (runInline) {
    await adminSupabase
      .from("ai_course_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId);

    try {
      const result = await runJob(body.jobType, payload, jobId);
      await adminSupabase
        .from("ai_course_jobs")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", jobId);

      return new Response(JSON.stringify({ ok: true, jobId, status: "completed", result }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await adminSupabase
        .from("ai_course_jobs")
        .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
        .eq("id", jobId);

      return new Response(JSON.stringify({ ok: false, jobId, status: "failed", error: message }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }
  }
  
  // For long-running jobs like ai_course_generate, return immediately
  // The job will be processed by a background worker
  console.log(`[enqueue-job] Job ${jobId} queued for async processing: ${body.jobType}`);
  
  return new Response(JSON.stringify({ 
    ok: true, 
    jobId, 
    status: "queued",
    message: "Job queued for processing. Poll /list-course-jobs to track status."
  }), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" }),
  });
});
