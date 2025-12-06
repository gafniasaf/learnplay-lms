import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// ALLOW_ANON removed - per IgniteZero rules: no silent fallbacks

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ListParams {
  status?: string;
  sinceHours?: number;
  limit?: number;
  offset?: number;
  search?: string;
  jobId?: string;
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    // Parse parameters from query string or body
    let params: ListParams = {};
    
    if (req.method === "GET") {
      const url = new URL(req.url);
      params = {
        status: url.searchParams.get("status") || undefined,
        sinceHours: url.searchParams.get("sinceHours") ? Number(url.searchParams.get("sinceHours")) : undefined,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
        offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
        search: url.searchParams.get("search") || url.searchParams.get("q") || undefined,
        jobId: url.searchParams.get("jobId") || undefined,
      };
    } else {
      try {
        params = await req.json();
      } catch {
        params = {};
      }
    }

    const { status, sinceHours, limit = 50, offset = 0, search, jobId } = params;

    // Build query
    let query = supabase
      .from("ai_course_jobs")
      .select("*", { count: "exact" });

    // Filter by status
    if (status) {
      query = query.eq("status", status);
    }

    // Filter by time range
    if (sinceHours && sinceHours > 0) {
      const sinceIso = new Date(Date.now() - sinceHours * 3600_000).toISOString();
      query = query.gte("created_at", sinceIso);
    }

    // Filter by job ID (exact match)
    if (jobId) {
      query = query.eq("id", jobId);
    }

    // Search in subject or prompt
    if (search && !jobId) {
      query = query.or(`subject.ilike.%${search}%,prompt.ilike.%${search}%`);
    }

    // Pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + Math.min(limit, 100) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("[list-course-jobs] Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        jobs: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[list-course-jobs] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

