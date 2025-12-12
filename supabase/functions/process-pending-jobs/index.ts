import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runJob } from "../ai-job-runner/runner.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Process pending jobs - called by pg_cron or manually
 * This picks up jobs with status="pending" and processes them
 */
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "process-pending-jobs");
  }

  // Allow both GET (for cron) and POST (for manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: stdHeaders(req) });
  }

  // Optional: verify agent token for security
  const agentToken = req.headers.get("x-agent-token");
  const expectedToken = Deno.env.get("AGENT_TOKEN") || "learnplay-agent-token";
  if (agentToken !== expectedToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, 
      headers: stdHeaders(req, { "Content-Type": "application/json" }) 
    });
  }

  try {
    // Fetch pending jobs (limit to 5 to prevent timeout)
    const { data: pendingJobs, error: fetchError } = await adminSupabase
      .from("ai_course_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);

    if (fetchError) {
      throw new Error(`Failed to fetch pending jobs: ${fetchError.message}`);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return new Response(JSON.stringify({ 
        ok: true, 
        message: "No pending jobs",
        processed: 0
      }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" })
      });
    }

    console.log(`[process-pending-jobs] Processing ${pendingJobs.length} pending jobs`);

    const results = [];

    for (const job of pendingJobs) {
      const jobId = job.id;
      // Reconstruct jobType and payload from stored data
      const jobType = job.subject || "ai_course_generate"; // subject was used as job_type proxy
      const payload = {
        course_id: job.course_id,
        subject: job.subject,
        grade: job.grade,
        grade_band: job.grade_band,
        items_per_group: job.items_per_group,
        mode: job.mode,
        ...((job as any).payload || {})
      };

      console.log(`[process-pending-jobs] Processing job ${jobId}: ${jobType}`);

      // Mark as processing
      await adminSupabase
        .from("ai_course_jobs")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", jobId);

      try {
        const result = await runJob(jobType, payload, jobId);
        
        await adminSupabase
          .from("ai_course_jobs")
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("id", jobId);

        results.push({ jobId, status: "done", result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        
        await adminSupabase
          .from("ai_course_jobs")
          .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
          .eq("id", jobId);

        results.push({ jobId, status: "failed", error: message });
      }
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      processed: results.length,
      results 
    }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" })
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[process-pending-jobs] Error:", message);
    
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" })
    });
  }
});

