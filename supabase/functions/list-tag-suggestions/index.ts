import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
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

    const isAgent = auth.type === "agent";
    if (isAgent && !auth.organizationId) {
      return Errors.invalidRequest("Missing x-organization-id for agent auth", requestId, req);
    }

    const organizationId = requireOrganizationId(auth);
    const actorUserId = auth.userId;
    // In preview/dev-agent mode we do NOT require a real user id; agent token is treated as org-admin.
    if (!isAgent && !actorUserId) return Errors.invalidAuth(requestId, req);

    // Only superadmin can view queue across orgs; org_admin can view their org only.
    // In preview/dev-agent mode, agent token is treated as org-admin for the provided org.
    let isSuper = false;
    let orgAdminOrgs = new Set<string>();
    if (!isAgent) {
      const { data: roles, error: roleErr } = await admin.from("user_roles").select("role, organization_id").eq("user_id", actorUserId);
      if (roleErr) return Errors.internal(roleErr.message, requestId, req);

      isSuper = Array.isArray(roles) && roles.some((r: any) => r.role === "superadmin");
      orgAdminOrgs = new Set((roles ?? []).filter((r: any) => r.role === "org_admin").map((r: any) => r.organization_id).filter(Boolean));
      if (!isSuper && orgAdminOrgs.size === 0) return Errors.forbidden("org_admin or superadmin required", requestId, req);
    }

    let q = admin
      .from("tag_approval_queue")
      .select("id, organization_id, course_id, suggested_tags, status, mapped_tag_ids, reviewed_by, reviewed_at, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);

    // In preview agent mode, scope strictly to the provided org.
    if (isAgent) {
      q = q.eq("organization_id", organizationId);
    } else if (isSuper) {
      q = q.eq("organization_id", organizationId);
    } else {
      q = q.in("organization_id", Array.from(orgAdminOrgs));
    }

    const { data: items, error } = await q;
    if (error) return Errors.internal(error.message, requestId, req);

    return { suggestions: items ?? [] };
  }),
);


