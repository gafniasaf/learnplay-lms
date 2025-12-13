import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Validate BEFORE auth
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return Errors.invalidRequest("Invalid limit parameter", requestId, req);
    }

    // Hybrid auth (agent token or user session)
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unauthorized";
      return msg.includes("organization_id") ? Errors.invalidRequest(msg, requestId, req) : Errors.invalidAuth(requestId, req);
    }

    const organizationId = requireOrganizationId(auth);
    const actorUserId = auth.userId;
    if (!actorUserId) {
      return Errors.invalidRequest("Missing x-user-id for agent auth", requestId, req);
    }

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

    const { data: assignments, error } = await admin
      .from("assignments")
      .select("id, org_id, course_id, title, due_at, created_at, created_by")
      .eq("org_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit);

    if (error) {
      console.error("[list-assignments] Query error:", error, { requestId });
      return Errors.internal(error.message, requestId, req);
    }

    return { assignments: assignments ?? [], scope: "teacher" };
  }),
);


