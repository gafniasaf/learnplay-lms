import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Hybrid auth
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unauthorized";
      return msg.includes("organization_id") ? Errors.invalidRequest(msg, requestId, req) : Errors.invalidAuth(requestId, req);
    }

    const organizationId = requireOrganizationId(auth);
    const actorUserId = auth.userId;
    if (!actorUserId) return Errors.invalidRequest("Missing x-user-id for agent auth", requestId, req);

    const orgIds = [organizationId];
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorization: must be teacher/admin in org
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

    const { data: classes, error: classesErr } = await admin.from("classes").select("id, org_id").in("org_id", orgIds);
    if (classesErr) return Errors.internal(classesErr.message, requestId, req);
    if (!classes || classes.length === 0) return { students: [] };

    const classIds = classes.map((c: any) => c.id);
    const { data: classMembers, error: membersErr } = await admin
      .from("class_members")
      .select("user_id, class_id, role")
      .in("class_id", classIds)
      .eq("role", "student");
    if (membersErr) return Errors.internal(membersErr.message, requestId, req);
    if (!classMembers || classMembers.length === 0) return { students: [] };

    const studentIds = [...new Set(classMembers.map((cm: any) => cm.user_id).filter(Boolean))] as string[];
    const { data: profiles, error: profilesErr } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", studentIds);
    if (profilesErr) return Errors.internal(profilesErr.message, requestId, req);

    const students = studentIds.map((id) => {
      const profile = profiles?.find((p: any) => p.id === id);
      const memberClasses = classMembers.filter((cm: any) => cm.user_id === id).map((cm: any) => cm.class_id);
      return { id, name: profile?.full_name ?? `Student ${id.slice(0, 8)}`, classIds: memberClasses };
    });

    return { students };
  }),
);


