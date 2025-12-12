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
    // Get parent ID from query param or x-user-id header (DEV MODE)
    const parentIdParam = url.searchParams.get("parentId");
    const xUserId = req.headers.get("x-user-id") ?? req.headers.get("X-User-Id");
    const parentId = parentIdParam || xUserId || undefined;
    if (!parentId) {
      return new Response(JSON.stringify({ error: "parentId is required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { data, error } = await supabase
      .from("parent_child_details")
      .select("*")
      .eq("parent_id", parentId);
    if (error) throw error;

    const children = (data || []).map((c: any) => ({
      studentId: c.student_id,
      studentName: c.student_name || "Unknown",
      linkStatus: c.link_status,
      linkedAt: c.linked_at,
      streakDays: c.streak_days || 0,
      xpTotal: c.xp_total || 0,
      recentActivityCount: c.recent_activity_count || 0,
    }));

    return new Response(
      JSON.stringify({ parentId, children, total: children.length }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[parent-children] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});
