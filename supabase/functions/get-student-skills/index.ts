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

interface GetStudentSkillsBody {
  studentId: string;
  domain?: string;
  status?: 'all' | 'locked' | 'in-progress' | 'mastered';
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "get-student-skills");
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

  let body: GetStudentSkillsBody;
  try {
    body = await req.json() as GetStudentSkillsBody;
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

  const organizationId = requireOrganizationId(auth);

  try {
    // Query mastery_states joined with knowledge_objectives
    // Note: This assumes tables exist. If not, return empty result for now.
    let query = adminSupabase
      .from("mastery_states")
      .select(`
        *,
        knowledge_objectives (*)
      `)
      .eq("student_id", body.studentId);

    // Apply domain filter if provided
    if (body.domain) {
      query = query.eq("knowledge_objectives.domain", body.domain);
    }

    const { data: masteryStates, error: queryError } = await query;

    if (queryError) {
      // If tables don't exist, return empty result (graceful degradation)
      console.warn("[get-student-skills] Query error (tables may not exist):", queryError);
      return new Response(
        JSON.stringify({ skills: [], totalCount: 0 }),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    // Transform to MasteryStateWithKO format
    const skills = (masteryStates || []).map((ms: any) => {
      const ko = ms.knowledge_objectives || {};
      const mastery = ms.mastery || 0;
      
      // Determine status based on mastery
      let status: 'locked' | 'in-progress' | 'mastered' = 'locked';
      if (mastery >= 0.8) {
        status = 'mastered';
      } else if (mastery > 0) {
        status = 'in-progress';
      }

      // Calculate days since last practice
      const lastPracticed = ms.last_practiced || ms.last_updated || ms.created_at;
      const daysSince = lastPracticed 
        ? Math.floor((Date.now() - new Date(lastPracticed).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        studentId: ms.student_id,
        koId: ms.ko_id,
        mastery,
        evidenceCount: ms.evidence_count || 0,
        lastUpdated: ms.last_updated || ms.created_at,
        firstPracticed: ms.first_practiced || ms.created_at,
        ko: {
          id: ko.id || ms.ko_id,
          name: ko.name || 'Unknown Skill',
          description: ko.description,
          domain: ko.domain || 'unknown',
          topicClusterId: ko.topic_cluster_id,
          prerequisites: ko.prerequisites || [],
          examples: ko.examples || [],
          difficulty: ko.difficulty,
          levelScore: ko.level_score,
          status: ko.status || 'published',
          createdAt: ko.created_at || new Date().toISOString(),
          updatedAt: ko.updated_at || new Date().toISOString(),
        },
        status,
        daysSinceLastPractice: daysSince,
      };
    });

    // Apply status filter
    let filteredSkills = skills;
    if (body.status && body.status !== 'all') {
      filteredSkills = skills.filter(s => s.status === body.status);
    }

    // Apply search query filter
    if (body.searchQuery) {
      const query = body.searchQuery.toLowerCase();
      filteredSkills = filteredSkills.filter(s =>
        s.ko.name.toLowerCase().includes(query) ||
        s.ko.description?.toLowerCase().includes(query)
      );
    }

    // Apply pagination
    const totalCount = filteredSkills.length;
    const limit = body.limit || 50;
    const offset = body.offset || 0;
    const paginatedSkills = filteredSkills.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({ skills: paginatedSkills, totalCount }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (error) {
    console.error("get-student-skills error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});
