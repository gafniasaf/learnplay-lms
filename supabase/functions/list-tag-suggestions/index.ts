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

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

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

    // Only superadmin can view queue across orgs; org_admin can view their org only
    const { data: roles, error: roleErr } = await admin.from("user_roles").select("role, organization_id").eq("user_id", actorUserId);
    if (roleErr) return Errors.internal(roleErr.message, requestId, req);

    const isSuper = Array.isArray(roles) && roles.some((r: any) => r.role === "superadmin");
    const orgAdminOrgs = new Set((roles ?? []).filter((r: any) => r.role === "org_admin").map((r: any) => r.organization_id).filter(Boolean));
    if (!isSuper && orgAdminOrgs.size === 0) return Errors.forbidden("org_admin or superadmin required", requestId, req);

    let q = admin
      .from("tag_approval_queue")
      .select("id, organization_id, course_id, suggested_tags, status, mapped_tag_ids, reviewed_by, reviewed_at, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);

    if (isSuper) {
      // superadmin can query all orgs; still allow filtering to current org for agent runs
      q = q.eq("organization_id", organizationId);
    } else {
      q = q.in("organization_id", Array.from(orgAdminOrgs));
    }

    const { data: items, error } = await q;
    if (error) return Errors.internal(error.message, requestId, req);

    return { suggestions: items ?? [] };
  }),
);


