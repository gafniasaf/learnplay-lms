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

    // Auth rules:
    // - User-session requests MUST be authorized as an org teacher/school_admin OR a system/org admin role.
    // - Dev-agent preview requests (agent token) are allowed to read this *summary* even when a concrete
    //   user identity isn't available (Lovable iframes often can't persist Supabase sessions reliably).
    if (auth.type === "user") {
      const actorUserId = auth.userId;
      if (!actorUserId) return Errors.invalidAuth(requestId, req);

      // 1) Superadmin (global)
      const { data: superRole, error: superErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", actorUserId)
        .eq("role", "superadmin")
        .maybeSingle();
      if (superErr) return Errors.internal(superErr.message, requestId, req);

      // 2) Org admin (org-scoped)
      const { data: orgAdminRole, error: orgAdminErr } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", actorUserId)
        .eq("organization_id", organizationId)
        .eq("role", "org_admin")
        .maybeSingle();
      if (orgAdminErr) return Errors.internal(orgAdminErr.message, requestId, req);

      // 3) Legacy/global admin via profiles.role
      const { data: profile, error: profileErr } = await admin
        .from("profiles")
        .select("role")
        .eq("id", actorUserId)
        .maybeSingle();
      if (profileErr) return Errors.internal(profileErr.message, requestId, req);

      // 4) Org membership (teacher/school_admin)
      const { data: orgUser, error: orgErr } = await admin
        .from("organization_users")
        .select("org_role")
        .eq("org_id", organizationId)
        .eq("user_id", actorUserId)
        .maybeSingle();
      if (orgErr) return Errors.internal(orgErr.message, requestId, req);

      const orgRole = (orgUser as any)?.org_role as string | undefined;
      const isOrgMemberPrivileged = !!orgRole && ["teacher", "school_admin"].includes(orgRole);
      const isSystemAdmin = (profile as any)?.role === "admin";
      const isRoleAdmin = !!superRole || !!orgAdminRole;

      if (!isOrgMemberPrivileged && !isSystemAdmin && !isRoleAdmin) {
        return Errors.forbidden(
          "Not authorized: requires org role teacher/school_admin or admin role (org_admin/superadmin).",
          requestId,
          req,
        );
      }
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


