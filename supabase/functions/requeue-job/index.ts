import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type JobTable = "ai_course_jobs" | "ai_media_jobs";

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const body = await req.json();
    const { jobId, jobTable = "ai_course_jobs" } = body as { jobId: string; jobTable?: JobTable };

    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Validate table name to prevent injection
    if (!["ai_course_jobs", "ai_media_jobs"].includes(jobTable)) {
      return new Response(JSON.stringify({ error: "Invalid job table" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Update job status to pending and reset retry count
    const { data, error } = await supabase
      .from(jobTable)
      .update({
        status: "pending",
        retry_count: 0,
        error: null,
        started_at: null,
        completed_at: null,
        last_heartbeat: null,
      })
      .eq("id", jobId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: stdHeaders(req, { "Content-Type": "application/json" }),
        });
      }
      throw error;
    }

    console.log(`[requeue-job] Requeued job ${jobId} in ${jobTable}`);

    return new Response(
      JSON.stringify({
        ok: true,
        job: data,
        message: "Job requeued successfully",
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[requeue-job] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

