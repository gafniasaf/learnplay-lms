import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import { requireEnv } from "../_shared/env.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const BodySchema = z.object({
  subject: z.string().min(1),
  itemsPerGroup: z.number().int().min(4).max(20).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 40);
}

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
    if (!parsed.success) return Errors.invalidRequest("Missing subject", requestId, req);

    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch {
      return Errors.invalidAuth(requestId, req);
    }

    const organizationId = requireOrganizationId(auth);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorization: must be teacher/admin in org (or agent)
    if (auth.type === "user" && auth.userId) {
      const { data: orgUser, error: orgErr } = await admin
        .from("organization_users")
        .select("org_role")
        .eq("org_id", organizationId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (orgErr) return Errors.internal(orgErr.message, requestId, req);
      if (!orgUser || !["teacher", "school_admin"].includes((orgUser as any).org_role)) {
        return Errors.forbidden("Teacher or admin role required", requestId, req);
      }
    }

    const subject = parsed.data.subject.trim();
    const itemsPerGroup = parsed.data.itemsPerGroup ?? 8;

    const base = slugify(`remediate-${subject}`) || "remediation";
    const suffix = crypto.randomUUID().slice(0, 8);
    const courseId = `${base}-${suffix}`;

    const inserted = await admin
      .from("ai_course_jobs")
      .insert({
        course_id: courseId,
        subject,
        grade_band: "All Grades",
        grade: null,
        items_per_group: itemsPerGroup,
        mode: "options",
        status: "pending",
        created_by: auth.userId ?? null,
      })
      .select("id")
      .single();

    if (inserted.error || !inserted.data?.id) {
      return Errors.internal(inserted.error?.message || "Failed to enqueue remediation job", requestId, req);
    }

    return { ok: true, jobId: inserted.data.id, courseId, subject, itemsPerGroup };
  }),
);


