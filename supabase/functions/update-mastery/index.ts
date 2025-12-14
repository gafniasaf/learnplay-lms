import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface UpdateMasteryBody {
  studentId: string;
  koId: string;
  exerciseScore: number;
  weight?: number;
}

/**
 * Calculate new mastery using ELO-style formula
 * Formula: newMastery = oldMastery + K * (exerciseScore - expectedScore)
 * where expectedScore = oldMastery (assuming mastery predicts performance)
 */
function calculateNewMastery(oldMastery: number, exerciseScore: number, weight: number = 1.0): number {
  const K = 0.1 * weight; // Learning rate
  const expectedScore = oldMastery;
  const newMastery = oldMastery + K * (exerciseScore - expectedScore);
  
  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, newMastery));
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "update-mastery");
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

  let body: UpdateMasteryBody;
  try {
    body = await req.json() as UpdateMasteryBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.studentId || typeof body.studentId !== "string") {
    return new Response(JSON.stringify({ error: "studentId is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.koId || typeof body.koId !== "string") {
    return new Response(JSON.stringify({ error: "koId is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (body.exerciseScore === undefined || typeof body.exerciseScore !== "number") {
    return new Response(JSON.stringify({ error: "exerciseScore is required and must be a number" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const organizationId = requireOrganizationId(auth);
  const weight = body.weight || 1.0;

  try {
    // Get existing mastery state
    const { data: existing, error: fetchError } = await adminSupabase
      .from("mastery_states")
      .select("*")
      .eq("student_id", body.studentId)
      .eq("ko_id", body.koId)
      .single();

    const oldMastery = existing?.mastery || 0;
    const evidenceCount = existing?.evidence_count || 0;
    const newMastery = calculateNewMastery(oldMastery, body.exerciseScore, weight);
    const newEvidenceCount = evidenceCount + 1;
    const now = new Date().toISOString();

    // Upsert mastery state
    const { error: upsertError } = await adminSupabase
      .from("mastery_states")
      .upsert({
        student_id: body.studentId,
        ko_id: body.koId,
        mastery: newMastery,
        evidence_count: newEvidenceCount,
        last_practiced: now,
        last_updated: now,
        first_practiced: existing?.first_practiced || now,
        organization_id: organizationId,
      }, {
        onConflict: "student_id,ko_id",
      });

    if (upsertError) {
      console.error("[update-mastery] Upsert error:", upsertError);
      // If table doesn't exist, return calculated result anyway (graceful degradation)
      return new Response(
        JSON.stringify({
          oldMastery,
          newMastery,
          evidenceCount: newEvidenceCount,
        }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    return new Response(
      JSON.stringify({
        oldMastery,
        newMastery,
        evidenceCount: newEvidenceCount,
      }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (error) {
    console.error("update-mastery error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});


