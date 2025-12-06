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
  if (req.method === "OPTIONS") return handleOptions(req, crypto.randomUUID());
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    const url = new URL(req.url);
    const allowAnon = Deno.env.get("ALLOW_ANON") === "true";
    const devChildId = Deno.env.get("DEV_CHILD_ID") || "b2ed7195-4202-405b-85e4-608944a27837";
    const childId = url.searchParams.get("childId") || (allowAnon ? devChildId : undefined);
    if (!childId) {
      return new Response(JSON.stringify({ error: "childId is required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { data, error } = await supabase
      .from("student_assignments")
      .select("course_id, status, progress_pct, due_at")
      .eq("student_id", childId);
    if (error) throw error;

    const byCourse: Record<string, { count: number; sum: number; overdue: boolean }> = {};
    (data || []).forEach((a: any) => {
      const key = a.course_id || "unknown";
      if (!byCourse[key]) byCourse[key] = { count: 0, sum: 0, overdue: false };
      byCourse[key].count += 1;
      byCourse[key].sum += a.progress_pct ?? 0;
      if (a.status === "overdue") byCourse[key].overdue = true;
    });

    const subjects = Object.entries(byCourse).map(([courseId, agg]) => ({
      subject: courseId,
      masteryPct: agg.count > 0 ? Math.round(agg.sum / agg.count) : 0,
      trend: "stable" as const,
      alertFlag: agg.overdue,
    }));

    const summary = {
      totalSubjects: subjects.length,
      improving: 0,
      stable: subjects.length,
      declining: 0,
    };

    return new Response(JSON.stringify({ childId, subjects, summary }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parent-subjects] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
