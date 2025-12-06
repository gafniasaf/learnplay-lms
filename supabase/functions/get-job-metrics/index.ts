import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const url = new URL(req.url);
    const sinceHours = Number(url.searchParams.get("sinceHours") || "24");
    const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString();

    // Get status counts for course jobs
    const { data: courseJobs, error: courseError } = await supabase
      .from("ai_course_jobs")
      .select("status, processing_duration_ms")
      .gte("created_at", sinceIso);

    if (courseError) throw courseError;

    // Aggregate by status
    const statusCounts: Record<string, number> = {};
    const processingTimes: number[] = [];

    (courseJobs || []).forEach((job: any) => {
      statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
      if (job.processing_duration_ms) {
        processingTimes.push(job.processing_duration_ms);
      }
    });

    // Calculate stats
    const totalJobs = courseJobs?.length || 0;
    const avgProcessingMs = processingTimes.length > 0
      ? Math.round(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length)
      : 0;
    const maxProcessingMs = processingTimes.length > 0 ? Math.max(...processingTimes) : 0;

    // Try to get media job counts too
    let mediaStatusCounts: Record<string, number> = {};
    try {
      const { data: mediaJobs } = await supabase
        .from("ai_media_jobs")
        .select("status")
        .gte("created_at", sinceIso);

      (mediaJobs || []).forEach((job: any) => {
        mediaStatusCounts[job.status] = (mediaStatusCounts[job.status] || 0) + 1;
      });
    } catch {
      // Media jobs table may not exist
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sinceHours,
        courseJobs: {
          total: totalJobs,
          byStatus: statusCounts,
          avgProcessingMs,
          maxProcessingMs,
        },
        mediaJobs: {
          total: Object.values(mediaStatusCounts).reduce((a, b) => a + b, 0),
          byStatus: mediaStatusCounts,
        },
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[get-job-metrics] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

