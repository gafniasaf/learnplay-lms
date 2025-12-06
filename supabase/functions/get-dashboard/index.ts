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
    const teacherId = url.searchParams.get("teacherId");
    if (!teacherId) {
      return new Response(JSON.stringify({ error: "teacherId required" }), {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const { count: sessionsCount } = await supabase
      .from("game_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", teacherId);

    const { data: userSessions } = await supabase
      .from("game_sessions")
      .select("id")
      .eq("user_id", teacherId);

    const sessionIds = userSessions?.map((s) => s.id) || [];

    const { data: roundsList } = await supabase
      .from("game_rounds")
      .select("*")
      .in("session_id", sessionIds.length > 0 ? sessionIds : ["00000000-0000-0000-0000-000000000000"])
      .order("started_at", { ascending: false })
      .limit(20);

    const roundsCount = roundsList?.length || 0;
    const lastRound = roundsList?.[0] || null;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const roundIds = roundsList?.map((r) => r.id) || [];

    const { count: attempts7dCount } = await supabase
      .from("game_attempts")
      .select("*", { count: "exact", head: true })
      .in("round_id", roundIds.length > 0 ? roundIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("created_at", sevenDaysAgo.toISOString());

    const dashboardData = {
      role: "teacher",
      stats: {
        sessions: sessionsCount || 0,
        rounds: roundsCount,
        attempts7d: attempts7dCount || 0,
        lastPlayedAt: lastRound?.started_at ?? null,
        lastFinalScore: lastRound?.final_score ?? null,
      },
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
