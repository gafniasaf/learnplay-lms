import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  const reqId = req.headers.get("x-request-id") || crypto.randomUUID();

  if (req.method === "OPTIONS") return handleOptions(req, reqId);
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId");
    if (!studentId) {
      return new Response(JSON.stringify({ error: "studentId required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from("student_assignments")
      .select("*")
      .eq("student_id", studentId)
      .order("due_at", { ascending: true, nullsFirst: false });

    if (assignmentsError) {
      return new Response(JSON.stringify({ error: assignmentsError.message }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { data: metrics, error: metricsError } = await supabase
      .from("student_metrics")
      .select("*")
      .eq("student_id", studentId)
      .maybeSingle();

    if (metricsError && metricsError.code !== "PGRST116") {
      return new Response(JSON.stringify({ error: metricsError.message }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const completedAssignments =
      assignments?.filter((a) => a.status === "completed" && a.score !== null) || [];
    const recentScore =
      completedAssignments.length > 0
        ? Math.round(
            completedAssignments.reduce((sum, a) => sum + (a.score || 0), 0) /
              completedAssignments.length
          )
        : 0;

    const { data: recommendations, error: recError } = await supabase
      .from("student_recommendations")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recError) {
      return new Response(JSON.stringify({ error: recError.message }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const dashboardData = {
      assignments: assignments || [],
      performance: {
        recentScore,
        streakDays: metrics?.streak_days || 0,
        xp: metrics?.xp_total || 0,
      },
      recommendedCourses: (recommendations || []).map((rec) => ({
        courseId: rec.course_id,
        reason: rec.reason,
        createdAt: rec.created_at,
      })),
    };

    return new Response(JSON.stringify(dashboardData), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
