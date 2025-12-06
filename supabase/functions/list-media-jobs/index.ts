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
    const courseId = url.searchParams.get("courseId");
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") || "20");

    let query = supabase
      .from("ai_media_jobs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 100));

    if (courseId) {
      query = query.eq("course_id", courseId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      // Table might not exist
      if (error.code === "42P01") {
        return new Response(
          JSON.stringify({ ok: true, jobs: [], total: 0 }),
          {
            status: 200,
            headers: stdHeaders(req, { "Content-Type": "application/json" }),
          }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        jobs: data ?? [],
        total: count ?? 0,
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[list-media-jobs] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

