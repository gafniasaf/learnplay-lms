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

    const { data, error } = await supabase
      .from("student_goals")
      .select("id, title, target_minutes, progress_minutes, due_at, status, teacher_note, updated_at, created_at")
      .eq("student_id", childId)
      .order("due_at", { ascending: true });
    if (error) throw error;

    const goals = (data || []).map((g: any) => ({
      id: g.id,
      title: g.title,
      targetMinutes: g.target_minutes,
      progressMinutes: g.progress_minutes,
      dueAt: g.due_at,
      status: g.status,
      teacherNote: g.teacher_note,
      updatedAt: g.updated_at,
      createdAt: g.created_at,
    }));

    return new Response(JSON.stringify({ childId, goals }), {
      status: 200,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parent-goals] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
