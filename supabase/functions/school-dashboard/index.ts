import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// Create client at top-level (Edge best practice).
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Hybrid auth (agent token OR user session)
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unauthorized";
      return msg.includes("organization_id") ? Errors.invalidRequest(msg, requestId, req) : Errors.invalidAuth(requestId, req);
    }

    const organizationId = auth.organizationId;
    if (!organizationId) return Errors.invalidRequest("Missing organization_id", requestId, req);

    const actorUserId = auth.userId;
    if (!actorUserId) return Errors.invalidRequest("Missing x-user-id for agent auth", requestId, req);

    // Authorization: teacher or school_admin in org
    const { data: orgUser, error: orgErr } = await admin
      .from("organization_users")
      .select("org_role")
      .eq("org_id", organizationId)
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (orgErr) return Errors.internal(orgErr.message, requestId, req);
    if (!orgUser || !["teacher", "school_admin"].includes((orgUser as any).org_role)) {
      return Errors.forbidden("Teacher or admin role required", requestId, req);
    }

    // Classes (org-scoped)
    const { data: classes, error: classesErr } = await admin
      .from("classes")
      .select("id")
      .eq("org_id", organizationId);
    if (classesErr) return Errors.internal(classesErr.message, requestId, req);

    const classIds = (classes || []).map((c: any) => c.id).filter(Boolean) as string[];
    const activeClasses = classIds.length;

    // Students (distinct user_ids across class_members in org)
    let totalStudents = 0;
    if (classIds.length > 0) {
      const { data: classMembers, error: membersErr } = await admin
        .from("class_members")
        .select("user_id")
        .in("class_id", classIds)
        .eq("role", "student");
      if (membersErr) return Errors.internal(membersErr.message, requestId, req);

      const studentIds = new Set((classMembers || []).map((cm: any) => cm.user_id).filter(Boolean));
      totalStudents = studentIds.size;
    }

    // Teachers (organization_users)
    const { count: teachersCount, error: teachersErr } = await admin
      .from("organization_users")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", organizationId)
      .eq("org_role", "teacher");
    if (teachersErr) return Errors.internal(teachersErr.message, requestId, req);

    // Courses visible to this org (org courses + global, excluding deleted/archived)
    const { count: coursesCount, error: coursesErr } = await admin
      .from("course_metadata")
      .select("id", { count: "exact", head: true })
      .or(`organization_id.eq.${organizationId},visibility.eq.global`)
      .is("deleted_at", null)
      .is("archived_at", null);
    if (coursesErr) return Errors.internal(coursesErr.message, requestId, req);

    return {
      ok: true,
      organizationId,
      generatedAt: new Date().toISOString(),
      stats: {
        totalStudents,
        totalTeachers: teachersCount || 0,
        activeClasses,
        coursesAvailable: coursesCount || 0,
      },
    };
  }),
);


