// supabase/functions/student-dashboard/index.ts
// Student dashboard endpoint

import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { jsonOk, Errors } from "../_shared/error.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(withCors(async (req: Request) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    // withCors will handle OPTIONS and inject CORS headers.
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") {
    return Errors.methodNotAllowed(req.method, requestId, req);
  }

  try {
    // Auth is REQUIRED: do not leak existence/data for arbitrary studentId
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (e) {
      // IMPORTANT: Lovable preview can blank-screen on non-200 responses.
      // Return a structured failure (withCors converts Errors.* into HTTP 200 + ok:false).
      return Errors.invalidAuth(requestId, req);
    }

    const resolvedStudentId = auth.userId || null;
    if (!resolvedStudentId) {
      return Errors.invalidRequest("studentId is required", requestId, req);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to get assignments - table may not exist
    let assignments: any[] = [];
    try {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .contains("student_ids", [resolvedStudentId])
        .order("due_at", { ascending: true });
      
      if (!error && data) {
        assignments = data;
      }
    } catch (e) {
      console.warn("[student-dashboard] assignments query failed:", e);
    }

    // Try to get student metrics - table may not exist  
    let metrics: any = null;
    try {
      const { data, error } = await supabase
        .from("student_metrics")
        .select("*")
        .eq("student_id", resolvedStudentId)
        .maybeSingle();
      
      if (!error && data) {
        metrics = data;
      }
    } catch (e) {
      console.warn("[student-dashboard] metrics query failed:", e);
    }

    // Calculate performance stats
    const completedAssignments = assignments.filter((a) => a.status === "completed");
    const recentScore = completedAssignments.length > 0
      ? Math.round(completedAssignments.reduce((sum, a) => sum + (a.score || 0), 0) / completedAssignments.length)
      : 0;

    // Try to get recommendations - table may not exist
    let recommendations: any[] = [];
    try {
      const { data, error } = await supabase
        .from("student_recommendations")
        .select("*")
        .eq("student_id", resolvedStudentId)
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (!error && data) {
        recommendations = data;
      }
    } catch (e) {
      console.warn("[student-dashboard] recommendations query failed:", e);
    }

    const dashboardData = {
      studentId: resolvedStudentId,
      assignments: assignments,
      performance: {
        recentScore,
        streakDays: metrics?.streak_days || 0,
        xp: metrics?.xp_total || 0,
      },
      recommendedCourses: recommendations.map((rec) => ({
        courseId: rec.course_id,
        reason: rec.reason,
        createdAt: rec.created_at,
      })),
    };

    return jsonOk(dashboardData, requestId, req);
  } catch (e) {
    console.error("[student-dashboard] Error:", e);
    return Errors.internal(e instanceof Error ? e.message : String(e), requestId, req);
  }
}));
