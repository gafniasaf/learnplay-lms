import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { getRequestId } from "../_shared/log.ts";
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

serve(withCors(async (req: Request): Promise<any> => {
  const reqId = getRequestId(req);

  if (req.method !== "POST") {
    return Errors.methodNotAllowed(req.method, reqId, req);
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch {
    return Errors.invalidAuth(reqId, req);
  }

  let body: GetStudentSkillsBody;
  try {
    body = (await req.json()) as GetStudentSkillsBody;
  } catch {
    return Errors.invalidRequest("Invalid JSON body", reqId, req);
  }

  if (!body?.studentId || typeof body.studentId !== "string") {
    return Errors.missingFields(["studentId"], reqId, req);
  }

  // Enforce org boundary (required for agent auth; user auth has org embedded in metadata)
  try {
    requireOrganizationId(auth);
  } catch {
    return Errors.invalidRequest("Missing organization_id", reqId, req);
  }

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
      // IgniteZero: fail loudly. Returning empty results hides missing migrations/schema.
      console.error("[get-student-skills] Query error:", queryError);
      return Errors.internal(
        "BLOCKED: Unable to query student skills. Ensure Knowledge Map schema is applied (mastery_states + knowledge_objectives) and RLS/permissions are correct.",
        reqId,
        req
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

    return { ok: true, skills: paginatedSkills, totalCount, requestId: reqId };
  } catch (error) {
    console.error("get-student-skills error:", error);
    return Errors.internal(error instanceof Error ? error.message : "Unknown error", reqId, req);
  }
}));
