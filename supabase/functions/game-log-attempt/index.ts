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

interface LogAttemptBody {
  roundId?: string;
  itemId?: number;
  itemKey?: string;
  selectedIndex?: number;
  isCorrect?: boolean;
  latencyMs?: number;
  finalize?: boolean;
  idempotencyKey?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "game-log-attempt");
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

  let body: LogAttemptBody;
  try {
    body = await req.json() as LogAttemptBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.roundId || typeof body.roundId !== "string") {
    return new Response(JSON.stringify({ error: "roundId is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (body.itemId === undefined || typeof body.itemId !== "number") {
    return new Response(JSON.stringify({ error: "itemId is required and must be a number" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (body.isCorrect === undefined || typeof body.isCorrect !== "boolean") {
    return new Response(JSON.stringify({ error: "isCorrect is required and must be a boolean" }), {
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
    // Verify round belongs to user
    const { data: round, error: roundError } = await adminSupabase
      .from("game_rounds")
      .select(`
        id,
        session_id,
        base_score,
        mistakes,
        game_sessions!inner(user_id)
      `)
      .eq("id", body.roundId)
      .single();

    if (roundError || !round) {
      return new Response(JSON.stringify({ error: "Round not found" }), {
        status: 404,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    const session = (round as any).game_sessions;
    if (session.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized: Round does not belong to user" }), {
        status: 403,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Check for duplicate attempt using idempotency key
    if (body.idempotencyKey) {
      const { data: existing } = await adminSupabase
        .from("game_attempts")
        .select("id")
        .eq("round_id", body.roundId)
        .eq("item_id", body.itemId)
        .eq("selected_index", body.selectedIndex ?? -1)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        // Return existing attempt ID (idempotent)
        return new Response(
          JSON.stringify({
            attemptId: existing.id,
            roundId: body.roundId,
            duplicate: true,
          }),
          {
            status: 200,
            headers: stdHeaders(req, { "Content-Type": "application/json" }),
          }
        );
      }
    }

    // Insert attempt
    const { data: attempt, error: attemptError } = await adminSupabase
      .from("game_attempts")
      .insert({
        round_id: body.roundId,
        item_id: body.itemId,
        selected_index: body.selectedIndex ?? -1,
        correct: body.isCorrect,
        latency_ms: body.latencyMs ?? 0,
      })
      .select("id")
      .single();

    if (attemptError || !attempt) {
      console.error("Failed to insert attempt:", attemptError);
      return new Response(JSON.stringify({ error: "Failed to log attempt" }), {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      });
    }

    // Update round stats
    const currentBaseScore = (round.base_score as number) || 0;
    const currentMistakes = (round.mistakes as number) || 0;
    const newBaseScore = body.isCorrect ? currentBaseScore + 1 : currentBaseScore;
    const newMistakes = body.isCorrect ? currentMistakes : currentMistakes + 1;

    await adminSupabase
      .from("game_rounds")
      .update({
        base_score: newBaseScore,
        mistakes: newMistakes,
      })
      .eq("id", body.roundId);

    // If finalize is true, calculate final score and end the round
    let finalResult = undefined;
    if (body.finalize) {
      const { data: allAttempts } = await adminSupabase
        .from("game_attempts")
        .select("id, correct")
        .eq("round_id", body.roundId);

      const distinctItems = new Set(allAttempts?.map(a => a.id) || []).size;
      const totalCorrect = allAttempts?.filter(a => a.correct).length || 0;
      const totalAttempts = allAttempts?.length || 0;
      const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

      // Calculate elapsed time (approximate from attempts)
      const elapsedSeconds = Math.max(1, Math.floor((allAttempts?.length || 1) * 2)); // Rough estimate

      const finalScore = newBaseScore;

      await adminSupabase
        .from("game_rounds")
        .update({
          ended_at: new Date().toISOString(),
          final_score: finalScore,
          distinct_items: distinctItems,
          elapsed_seconds: elapsedSeconds,
        })
        .eq("id", body.roundId);

      finalResult = {
        finalScore,
        accuracy,
        endedAt: new Date().toISOString(),
      };
    }

    return new Response(
      JSON.stringify({
        attemptId: attempt.id,
        roundId: body.roundId,
        final: finalResult,
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      }
    );
  } catch (error) {
    console.error("game-log-attempt error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

