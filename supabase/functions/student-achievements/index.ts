import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { Errors } from "../_shared/error.ts";
import { formatValidationError } from "../_shared/validation.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { withCors } from "../_shared/cors.ts";

const QuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  status: z.enum(["earned", "in_progress", "locked"]).optional(),
});

interface Achievement {
  id: string;
  student_id: string;
  badge_code: string;
  title: string;
  description: string;
  status: "earned" | "in_progress" | "locked";
  progress_pct: number;
  earned_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AchievementsResponse {
  achievements: Achievement[];
  summary: {
    total: number;
    earned: number;
    inProgress: number;
    locked: number;
  };
}

serve(withCors(async (req) => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  
  if (req.method !== "GET") {
    return Errors.methodNotAllowed(req.method, requestId, req);
  }

  const bad = checkOrigin(req);
  if (bad) return bad;
  
  try {
    console.log("[student-achievements] Request received");

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

    // Check for agent token first (backend/automation calls)
    const agentToken = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
    const expectedAgentToken = Deno.env.get("AGENT_TOKEN");
    const isAgentAuth = expectedAgentToken && agentToken === expectedAgentToken;
    
    let userId: string;
    let supabase;
    
    if (isAgentAuth) {
      // Agent auth - use service role for data access
      supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      // For agent calls, studentId from query params or x-user-id header is required
      const xUserId = req.headers.get("x-user-id") ?? req.headers.get("X-User-Id");
      if (!studentId && !xUserId) {
        return Errors.invalidRequest("studentId required for agent auth", requestId, req);
      }
      userId = studentId || xUserId!;
    } else {
      // User auth - require Authorization header
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return Errors.noAuth(requestId, req);
      }

      supabase = createClient(
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
        console.error("[student-achievements] Auth error:", authError);
        return Errors.invalidAuth(requestId, req);
      }
      userId = authData.user.id;
    }
    
    // Determine target student: if studentId provided, use it (RLS will enforce access)
    // Otherwise, default to the authenticated user's own achievements
    const targetStudentId = studentId || userId;

    console.log(`[student-achievements] Fetching achievements for student: ${targetStudentId}`);

    // Build query
    let query = supabase
      .from("student_achievements")
      .select("*")
      .eq("student_id", targetStudentId)
      .order("status", { ascending: true }) // earned, in_progress, locked
      .order("earned_at", { ascending: false, nullsFirst: false });

    // Apply status filter if provided
    if (status) {
      query = query.eq("status", status);
    }

    const { data: achievements, error: achievementsError } = await query;

    if (achievementsError) {
      console.error("[student-achievements] Query error:", achievementsError);
      return Errors.internal("Failed to fetch achievements", requestId, req);
    }

    // Calculate summary statistics
    const summary = {
      total: achievements.length,
      earned: achievements.filter(a => a.status === "earned").length,
      inProgress: achievements.filter(a => a.status === "in_progress").length,
      locked: achievements.filter(a => a.status === "locked").length,
    };

    const response: AchievementsResponse = {
      achievements: achievements || [],
      summary,
    };

    console.log(`[student-achievements] ✓ Returning ${achievements.length} achievements`);

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[student-achievements] Error:", errorMessage);
    return Errors.internal(errorMessage, requestId, req);
  }
}));
