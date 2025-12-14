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
  const requestId = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req, { "X-Request-Id": requestId }),
    });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return new Response(
      JSON.stringify({ error: message, requestId }),
      { status: message === "Missing organization_id" ? 400 : 401, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }) }
    );
  }

  let body: StartRoundBody;
  try {
    body = await req.json() as StartRoundBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (!body?.courseId || typeof body.courseId !== "string") {
    return new Response(JSON.stringify({ error: "courseId is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (body.level === undefined || typeof body.level !== "number") {
    return new Response(JSON.stringify({ error: "level is required and must be a number" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  const organizationId = requireOrganizationId(auth);
  const userId = auth.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: "User ID is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
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
        return new Response(JSON.stringify({ error: "Failed to create game session", requestId, details: sessionError }), {
          status: 500,
          headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
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

    // Some deployments may not have the newer game_rounds columns / RPC migrations applied.
    // Fallback to a legacy insert (minimal columns) so preview/game flows remain usable.
    let effectiveRound: any = round;
    if (roundError || !effectiveRound) {
      console.error("Failed to create round via RPC:", roundError);
      console.warn("[game-start-round] Falling back to legacy insert into game_rounds");

      const tryInsert = async (payload: Record<string, unknown>) => {
        return await adminSupabase
          .from("game_rounds")
          .insert(payload)
          .select("id, started_at")
          .single();
      };

      // Attempt 1: include newer columns if present
      let insertRes = await tryInsert({
        session_id: sessionId,
        level: body.level,
        content_version: body.contentVersion || "unknown",
        created_by: userId,
      });

      // If schema doesn't support newer columns, retry without them
      if (insertRes.error) {
        const msg = insertRes.error.message || "";
        if (msg.includes("content_version") || msg.includes("created_by") || msg.includes("column")) {
          insertRes = await tryInsert({
            session_id: sessionId,
            level: body.level,
          });
        }
      }

      if (insertRes.error || !insertRes.data) {
        console.error("Legacy insert failed:", insertRes.error);
        return new Response(
          JSON.stringify({
            error: "Failed to create game round",
            requestId,
            rpcError: roundError,
            insertError: insertRes.error,
          }),
          {
            status: 500,
            headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
          }
        );
      }

      effectiveRound = insertRes.data;
    }

    return new Response(
      JSON.stringify({
        sessionId,
        roundId: effectiveRound.id,
        startedAt: effectiveRound.started_at || new Date().toISOString(),
        requestId,
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
      }
    );
  } catch (error) {
    console.error("game-start-round error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", requestId }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }) }
    );
  }
});


