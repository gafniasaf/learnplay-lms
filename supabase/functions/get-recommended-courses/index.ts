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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "get-recommended-courses");
  }

  if (req.method !== "GET") {
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

  const url = new URL(req.url);
  const koId = url.searchParams.get("koId");
  const studentId = url.searchParams.get("studentId");
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  if (!koId || !studentId) {
    return new Response(JSON.stringify({ error: "koId and studentId are required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const organizationId = requireOrganizationId(auth);

  try {
    // Query courses that have exercises mapped to this KO
    // Note: This assumes course_ko_scope table exists
    const { data: courseScopes, error: queryError } = await adminSupabase
      .from("course_ko_scope")
      .select(`
        course_id,
        relevance,
        exercise_count,
        courses:course_id (id, title)
      `)
      .eq("ko_id", koId)
      .order("relevance", { ascending: false })
      .limit(limit);

    if (queryError) {
      // If tables don't exist, return empty list
      console.warn("[get-recommended-courses] Query error (tables may not exist):", queryError);
      return new Response(
        JSON.stringify([]),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    // Transform to RecommendedCourse format
    const recommendedCourses = (courseScopes || []).map((scope: any) => {
      const course = scope.courses || {};
      return {
        courseId: scope.course_id,
        courseTitle: course.title || 'Unknown Course',
        exerciseCount: scope.exercise_count || 0,
        relevance: scope.relevance || 0.5,
        completionPct: 0, // Would need to query student progress
        lastPracticed: undefined,
      };
    });

    return new Response(
      JSON.stringify(recommendedCourses),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (error) {
    console.error("get-recommended-courses error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});


