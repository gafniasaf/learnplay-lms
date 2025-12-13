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

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BodySchema = z.object({
  id: z.string().uuid(),
});

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "POST") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Validate BEFORE auth
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Errors.invalidRequest("Invalid JSON body", requestId, req);
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return Errors.invalidRequest("Missing id", requestId, req);

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

    const { data: item, error: loadErr } = await admin
      .from("tag_approval_queue")
      .select("id, organization_id, status")
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (loadErr) return Errors.internal(loadErr.message, requestId, req);
    if (!item) return Errors.notFound("Tag suggestion", requestId, req);
    if ((item as any).status !== "pending") return Errors.conflict("Suggestion is not pending", requestId, req);

    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role, organization_id")
      .eq("user_id", actorUserId);
    if (roleErr) return Errors.internal(roleErr.message, requestId, req);
    const isSuper = Array.isArray(roles) && roles.some((r: any) => r.role === "superadmin");
    const isOrgAdmin = Array.isArray(roles) && roles.some((r: any) => r.role === "org_admin" && r.organization_id === (item as any).organization_id);
    if (!isSuper && !isOrgAdmin) return Errors.forbidden("org_admin or superadmin required", requestId, req);
    if ((item as any).organization_id !== organizationId && !isSuper) return Errors.forbidden("Suggestion is not in your organization", requestId, req);

    const { error: updErr } = await admin
      .from("tag_approval_queue")
      .update({
        status: "rejected",
        reviewed_by: actorUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (updErr) return Errors.internal(updErr.message, requestId, req);

    return { ok: true };
  }),
);


