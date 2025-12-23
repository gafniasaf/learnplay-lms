import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  const expectedToken = Deno.env.get("AGENT_TOKEN");
  if (!expectedToken) {
    return new Response(JSON.stringify({ error: "BLOCKED: AGENT_TOKEN is required" }), { 
      status: 500, 
      headers: stdHeaders(req, { "Content-Type": "application/json" }) 
    });
  }
  if (agentToken !== expectedToken) {
    // IMPORTANT: avoid non-200 to prevent Lovable blank screens.
    return new Response(JSON.stringify({ ok: false, error: { code: "unauthorized", message: "Unauthorized" }, httpStatus: 401 }), { 
      status: 200, 
      headers: stdHeaders(req, { "Content-Type": "application/json" }) 
    });
  }

  try {
    const url = new URL(req.url);
    const jobIdParam = url.searchParams.get("jobId") || undefined;
    const mediaNRaw = url.searchParams.get("mediaN") || url.searchParams.get("media_n") || undefined;
    const mediaN = (() => {
      const n = mediaNRaw ? Number(mediaNRaw) : 3;
      if (!Number.isFinite(n)) return 3;
      return Math.min(Math.max(Math.floor(n), 0), 25);
    })();

    const runMediaRunner = async () => {
      if (mediaN <= 0) return null;
      try {
        const mediaUrl = `${SUPABASE_URL}/functions/v1/media-runner?n=${encodeURIComponent(String(mediaN))}`;
        const mediaResp = await fetch(mediaUrl, {
          method: "POST",
          headers: { "x-agent-token": expectedToken, "Content-Type": "application/json" },
        });
        const mediaJson = await mediaResp.json().catch(() => null);
        return { ok: mediaResp.ok, status: mediaResp.status, body: mediaJson };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, status: 0, error: msg };
      }
    };

    // Fetch pending jobs (limit to 5 to prevent timeout)
    let query = adminSupabase
      .from("ai_course_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5);

    if (jobIdParam) {
      query = query.eq("id", jobIdParam);
    }

    const { data: pendingJobs, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch pending jobs: ${fetchError.message}`);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      const media = await runMediaRunner();
      return new Response(JSON.stringify({ 
        ok: true, 
        message: "No pending jobs",
        processed: 0,
        media
      }), {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" })
      });
    }

    console.log(`[process-pending-jobs] Processing ${pendingJobs.length} pending jobs`);

    const results = [];

    for (const job of pendingJobs) {
      const jobId = job.id;
      console.log(`[process-pending-jobs] Processing job ${jobId}: generate-course`);

      // Mark as processing
      await adminSupabase
        .from("ai_course_jobs")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", jobId);

      try {
        // IMPORTANT:
        // The ONLY supported course generation path is the `generate-course` Edge Function,
        // because it persists `courses/<course_id>/course.json` AND upserts `course_metadata`.
        // The auto-generated ai-job-runner strategy is NOT authoritative for persistence.
        const genUrl = `${SUPABASE_URL}/functions/v1/generate-course?jobId=${encodeURIComponent(jobId)}`;
        const genResp = await fetch(genUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: job.subject,
            gradeBand: job.grade_band,
            grade: job.grade,
            itemsPerGroup: job.items_per_group,
            levelsCount: (job as any).levels_count || undefined,
            mode: job.mode,
          }),
        });

        const genJson = await genResp.json().catch(() => null);

        // Lovable-safe semantics: generate-course may return 200 with { success:false } on failures.
        if (!genResp.ok || genJson?.success === false) {
          const msg = genJson?.error?.message || genJson?.error || `generate-course failed (${genResp.status})`;
          await adminSupabase
            .from("ai_course_jobs")
            .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
            .eq("id", jobId);
          results.push({ jobId, status: "failed", error: msg });
          continue;
        }

        // Ensure job row reflects completion and includes a canonical result_path for debuggability.
        const courseId = String(job.course_id || "");
        const resultPath =
          typeof genJson?.result_path === "string"
            ? genJson.result_path
            : (courseId ? `${courseId}/course.json` : null);

        const update: Record<string, unknown> = {
          status: "done",
          completed_at: new Date().toISOString(),
        };
        if (resultPath) update.result_path = resultPath;

        await adminSupabase.from("ai_course_jobs").update(update).eq("id", jobId);

        results.push({ jobId, status: "done", courseId: job.course_id, resultPath });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        
        await adminSupabase
          .from("ai_course_jobs")
          .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
          .eq("id", jobId);

        results.push({ jobId, status: "failed", error: message });
      }
    }

    const media = await runMediaRunner();
    return new Response(JSON.stringify({ 
      ok: true, 
      processed: results.length,
      results,
      media
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

