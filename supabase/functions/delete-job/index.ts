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

  if (req.method !== "POST" && req.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    let jobId: string | undefined;
    let jobTable: JobTable = "ai_course_jobs";

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      jobId = url.searchParams.get("id") || url.searchParams.get("jobId") || undefined;
      jobTable = (url.searchParams.get("table") as JobTable) || "ai_course_jobs";
    } else {
      const body = await req.json();
      jobId = body.jobId;
      jobTable = body.jobTable || "ai_course_jobs";
    }

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

    // Delete the job
    const { error } = await supabase
      .from(jobTable)
      .delete()
      .eq("id", jobId);

    if (error) {
      throw error;
    }

    console.log(`[delete-job] Deleted job ${jobId} from ${jobTable}`);

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Job deleted successfully",
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[delete-job] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});


