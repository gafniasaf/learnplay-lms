// supabase/functions/list-assignments-student/index.ts
// Lists assignments for a student

import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { jsonOk, jsonError, Errors } from "../_shared/error.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(withCors(async (req: Request) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "GET") {
    return Errors.methodNotAllowed(req.method, requestId, req);
  }

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  
  // Get student ID from auth if not provided
  const authHeader = req.headers.get("authorization");
  let resolvedStudentId = studentId;
  
  if (!resolvedStudentId && authHeader) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      resolvedStudentId = user?.id || null;
    } catch (e) {
      console.warn("[list-assignments-student] Failed to get user from token:", e);
    }
  }

  if (!resolvedStudentId) {
    return jsonError("invalid_request", "studentId is required", 400, requestId, req);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Try to get assignments - use multiple query approaches for flexibility
    let assignments: any[] = [];
    
    // First try with student_ids array contains
    try {
      const { data, error } = await supabase
        .from("assignments")
        .select(`
          id,
          course_id,
          title,
          due_at,
          created_at,
          status,
          progress_pct,
          assigned_by,
          assigned_by_role,
          completion_criteria
        `)
        .contains("student_ids", [resolvedStudentId])
        .order("due_at", { ascending: true });

      if (!error && data) {
        assignments = data;
      } else if (error) {
        console.warn("[list-assignments-student] Primary query failed:", error.message);
      }
    } catch (e) {
      console.warn("[list-assignments-student] Primary query exception:", e);
    }

    // If that fails, try student_assignments table
    if (assignments.length === 0) {
      try {
        const { data, error } = await supabase
          .from("student_assignments")
          .select("*")
          .eq("student_id", resolvedStudentId)
          .order("due_at", { ascending: true });

        if (!error && data) {
          assignments = data;
        }
      } catch (e) {
        console.warn("[list-assignments-student] Fallback query failed:", e);
      }
    }

    return jsonOk({
      assignments: assignments || [],
      scope: "student",
    }, requestId, req);
  } catch (e) {
    console.error("[list-assignments-student] Error:", e);
    return jsonError("internal_error", e instanceof Error ? e.message : String(e), 500, requestId, req);
  }
}));
