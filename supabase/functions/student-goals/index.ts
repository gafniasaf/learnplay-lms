import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { Errors } from "../_shared/error.ts";
import { formatValidationError } from "../_shared/validation.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { withCors } from "../_shared/cors.ts";

const QuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  status: z.enum(["on_track", "behind", "completed"]).optional(),
});

const PatchBodySchema = z.object({
  progress_minutes: z.number().int().min(0).optional(),
  status: z.enum(["on_track", "behind", "completed"]).optional(),
  teacher_note: z.string().optional(),
});

interface Goal {
  id: string;
  student_id: string;
  title: string;
  target_minutes: number;
  progress_minutes: number;
  due_at: string | null;
  status: "on_track" | "behind" | "completed";
  teacher_note: string | null;
  created_at: string;
  updated_at: string;
}

interface GoalsResponse {
  goals: Goal[];
  summary: {
    total: number;
    onTrack: number;
    behind: number;
    completed: number;
  };
}

serve(withCors(async (req) => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  
  const bad = checkOrigin(req);
  if (bad) return bad;
  
  try {
    // Check for Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Errors.noAuth(requestId, req);
    }

    // Create Supabase client with auth
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: authData, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authData?.user) {
      console.error("[student-goals] Auth error:", authError);
      return Errors.invalidAuth(requestId, req);
    }

    const userId = authData.user.id;

    // Handle GET request
    if (req.method === "GET") {
      console.log("[student-goals] GET request received");

      // Parse and validate query parameters
      const url = new URL(req.url);
      const params = {
        studentId: url.searchParams.get("studentId") || undefined,
        status: url.searchParams.get("status") || undefined,
      };

      const parsed = QuerySchema.safeParse(params);
      if (!parsed.success) {
        return Errors.invalidRequest(formatValidationError(parsed.error), requestId, req);
      }

      const { studentId, status } = parsed.data;
      
      // Determine target student
      const targetStudentId = studentId || userId;

      console.log(`[student-goals] Fetching goals for student: ${targetStudentId}`);

      // Build query
      let query = supabase
        .from("student_goals")
        .select("*")
        .eq("student_id", targetStudentId)
        .order("status", { ascending: true }) // completed, on_track, behind
        .order("due_at", { ascending: true, nullsFirst: false });

      // Apply status filter if provided
      if (status) {
        query = query.eq("status", status);
      }

      const { data: goals, error: goalsError } = await query;

      if (goalsError) {
        console.error("[student-goals] Query error:", goalsError);
        return Errors.internal("Failed to fetch goals", requestId, req);
      }

      // Calculate summary statistics
      const summary = {
        total: goals.length,
        onTrack: goals.filter(g => g.status === "on_track").length,
        behind: goals.filter(g => g.status === "behind").length,
        completed: goals.filter(g => g.status === "completed").length,
      };

      const response: GoalsResponse = {
        goals: goals || [],
        summary,
      };

      console.log(`[student-goals] ✓ Returning ${goals.length} goals`);

      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle PATCH request (update goal)
    if (req.method === "PATCH") {
      console.log("[student-goals] PATCH request received");

      // Extract goal ID from URL path
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const goalId = pathParts[pathParts.length - 1];

      if (!goalId || goalId === "student-goals") {
        return Errors.invalidRequest("Goal ID required in path", requestId, req);
      }

      // Parse and validate request body
      const body = await req.json();
      const parsed = PatchBodySchema.safeParse(body);
      
      if (!parsed.success) {
        return Errors.invalidRequest(formatValidationError(parsed.error), requestId, req);
      }

      const updates = parsed.data;

      console.log(`[student-goals] Updating goal ${goalId}:`, updates);

      // Check if user is a teacher (has permission to update status/teacher_note)
      const { data: orgUsers } = await supabase
        .from("organization_users")
        .select("org_role")
        .eq("user_id", userId)
        .in("org_role", ["teacher", "school_admin"]);

      const isTeacher = orgUsers && orgUsers.length > 0;

      // Students can only update progress_minutes, not status or teacher_note
      if (!isTeacher && (updates.status || updates.teacher_note !== undefined)) {
        return Errors.forbidden("Only teachers can update goal status or notes", requestId, req);
      }

      // Update the goal
      const { data: updatedGoal, error: updateError } = await supabase
        .from("student_goals")
        .update(updates)
        .eq("id", goalId)
        .select()
        .single();

      if (updateError) {
        console.error("[student-goals] Update error:", updateError);
        return Errors.internal("Failed to update goal", requestId, req);
      }

      console.log(`[student-goals] ✓ Goal ${goalId} updated successfully`);

      return new Response(JSON.stringify(updatedGoal), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return Errors.methodNotAllowed(req.method, requestId, req);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[student-goals] Error:", errorMessage);
    return Errors.internal(errorMessage, requestId, req);
  }
}));
