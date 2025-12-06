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
    const childId = url.searchParams.get("childId") || undefined;
    if (!childId) {
      return new Response(JSON.stringify({ error: "childId is required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Approximate topics from assignments as individual topic items
    const { data, error } = await supabase
      .from("student_assignments")
      .select("id, title, course_id, status, progress_pct, due_at")
      .eq("student_id", childId)
      .order("due_at", { ascending: true });
    if (error) throw error;

    const topics = (data || []).map((t: any) => ({
      id: t.id,
      topic: t.title,
      courseId: t.course_id,
      masteryPct: t.progress_pct ?? 0,
      status: t.status,
      dueAt: t.due_at,
    }));

    return new Response(JSON.stringify({ childId, topics }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parent-topics] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
