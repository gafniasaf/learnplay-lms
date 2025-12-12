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
  
  // Use raw SQL to insert into ai_course_jobs, bypassing schema cache issues
  const { data: insertResult, error: insertError } = await adminSupabase.rpc('enqueue_ai_job_raw', {
    p_job_type: body.jobType,
    p_payload: payload,
    p_created_by: auth.userId || null
  });

  // Fallback: if RPC doesn't exist, use the original ai_course_jobs with existing columns
  let jobId: string;
  if (insertError) {
    // Try direct insert with columns that exist in original schema
    const courseId = (payload as any).courseId || body.jobType; // Use payload.courseId or jobType as proxy
    const inserted = await adminSupabase
      .from("ai_course_jobs")
      .insert({ 
        course_id: courseId,
        subject: body.jobType,  // Use subject as job_type proxy
        grade: 'smoke-test',
        grade_band: 'K-2',
        items_per_group: 1,
        mode: 'options',
        status: "pending", 
        created_by: auth.userId 
      })
      .select()
      .single();

    if (inserted.error || !inserted.data) {
      return new Response(JSON.stringify({ error: inserted.error?.message || "Failed to enqueue job" }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }
    jobId = inserted.data.id as string;
  } else {
    jobId = insertResult?.id || crypto.randomUUID();
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
