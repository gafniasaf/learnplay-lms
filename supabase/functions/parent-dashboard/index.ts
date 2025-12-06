// Lightweight parent dashboard implementation without auth for dev live data.
// Uses service role (verify_jwt=false) and returns basic metrics from new tables/views.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

// Top-level client per runbook
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, crypto.randomUUID());
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const url = new URL(req.url);
    const parentId = url.searchParams.get("parentId") || undefined;

    // Fetch children via view (added by migrations)
    const query = supabase.from("parent_child_details").select("*");
    if (parentId) query.eq("parent_id", parentId);
    const { data: childDetails, error } = await query;
    if (error) throw error;

    const children = await Promise.all(
      (childDetails || []).map(async (child: any) => {
        const { data: upcomingAssignments } = await supabase
          .from("student_assignments")
          .select("id, title, course_id, due_at, status, progress_pct")
          .eq("student_id", child.student_id)
          .in("status", ["not_started", "in_progress"])
          .order("due_at", { ascending: true })
          .limit(3);

        const overdueCount = child.overdue_assignments_count || 0;
        const goalsBehindCount = child.goals_behind_count || 0;

        return {
          studentId: child.student_id,
          studentName: child.student_name || "Unknown",
          linkStatus: child.link_status,
          linkedAt: child.linked_at,
          metrics: {
            streakDays: child.streak_days || 0,
            xpTotal: child.xp_total || 0,
            lastLoginAt: child.last_login_at,
            recentActivityCount: child.recent_activity_count || 0,
          },
          upcomingAssignments: {
            count: child.upcoming_assignments_count || 0,
            items: (upcomingAssignments || []).map((a: any) => ({
              id: a.id,
              title: a.title,
              courseId: a.course_id,
              dueAt: a.due_at,
              status: a.status,
              progressPct: a.progress_pct,
            })),
          },
          alerts: {
            overdueAssignments: overdueCount,
            goalsBehind: goalsBehindCount,
            needsAttention: overdueCount > 0 || goalsBehindCount > 0,
          },
        };
      })
    );

    const totalAlerts = children.reduce(
      (sum, child) => sum + child.alerts.overdueAssignments + child.alerts.goalsBehind,
      0
    );
    const averageStreak =
      children.length > 0
        ? Math.round(children.reduce((sum, c) => sum + c.metrics.streakDays, 0) / children.length)
        : 0;
    const totalXp = children.reduce((sum, c) => sum + c.metrics.xpTotal, 0);

    return new Response(
      JSON.stringify({
        parentId: parentId || (childDetails?.[0]?.parent_id ?? "unknown"),
        children,
        summary: {
          totalChildren: children.length,
          totalAlerts,
          averageStreak,
          totalXp,
        },
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parent-dashboard] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
