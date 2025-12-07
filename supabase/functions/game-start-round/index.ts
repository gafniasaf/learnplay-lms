import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

// Create admin client for DB operations
const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface StartRoundBody {
  courseId?: string;
  level?: number;
  assignmentId?: string;
  contentVersion?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "game-start-round");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return new Response(
      JSON.stringify({ error: message }),
      { status: message === "Missing organization_id" ? 400 : 401, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }

  let body: StartRoundBody;
  try {
    body = await req.json() as StartRoundBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.courseId || typeof body.courseId !== "string") {
    return new Response(JSON.stringify({ error: "courseId is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (body.level === undefined || typeof body.level !== "number") {
    return new Response(JSON.stringify({ error: "level is required and must be a number" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const organizationId = requireOrganizationId(auth);
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: "User ID is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  try {
    // Create or get active session for this course
    const { data: existingSession } = await adminSupabase
      .from("game_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", body.courseId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    let sessionId: string;
    if (existingSession?.id) {
      sessionId = existingSession.id;
    } else {
      // Create new session
      const { data: newSession, error: sessionError } = await adminSupabase
        .from("game_sessions")
        .insert({
          user_id: userId,
          course_id: body.courseId,
          content_version: body.contentVersion || "unknown",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (sessionError || !newSession) {
        console.error("Failed to create session:", sessionError);
        return new Response(JSON.stringify({ error: "Failed to create game session" }), {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json" }),
        });
      }

      sessionId = newSession.id;
    }

    // Create new round using RPC function (bypasses RLS safely)
    const { data: round, error: roundError } = await adminSupabase.rpc("create_game_round", {
      p_session_id: sessionId,
      p_level: body.level,
      p_content_version: body.contentVersion || "unknown",
      p_user_id: userId,
    });

    if (roundError || !round) {
      console.error("Failed to create round:", roundError);
      return new Response(JSON.stringify({ error: "Failed to create game round" }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    return new Response(
      JSON.stringify({
        sessionId,
        roundId: round.id,
        startedAt: round.started_at || new Date().toISOString(),
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (error) {
    console.error("game-start-round error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

