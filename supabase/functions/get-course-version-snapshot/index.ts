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
  courseId: z.string().min(1),
  version: z.coerce.number().int().min(1),
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
      courseId: url.searchParams.get("courseId") ?? "",
      version: url.searchParams.get("version") ?? "",
    });
    if (!parsed.success) return Errors.invalidRequest("Invalid courseId/version", requestId, req);
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

    // Authorization: require editor/org_admin/superadmin role on this course's org
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: meta, error: metaErr } = await admin
      .from("course_metadata")
      .select("organization_id")
      .eq("id", parsed.data.courseId)
      .maybeSingle();
    if (metaErr) return Errors.internal(metaErr.message, requestId, req);
    if (!meta) return Errors.notFound("Course", requestId, req);
    if ((meta as any).organization_id !== organizationId) return Errors.forbidden("Course is not in your organization", requestId, req);

    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actorUserId)
      .eq("organization_id", meta.organization_id);
    if (roleErr) return Errors.internal(roleErr.message, requestId, req);

    const allowed = Array.isArray(roles) && roles.some((r: any) => ["org_admin", "editor", "superadmin"].includes(r.role));
    if (!allowed) return Errors.forbidden("Editor/org_admin role required", requestId, req);

    const { courseId, version } = parsed.data;
    const { data: v, error: vErr } = await admin
      .from("course_versions")
      .select("*")
      .eq("course_id", courseId)
      .eq("version", version)
      .maybeSingle();
    if (vErr) return Errors.internal(vErr.message, requestId, req);
    if (!v) return Errors.notFound("Course version", requestId, req);

    // Prefer JSON snapshot columns when available; fall back to storage_path download.
    const snapshot = (v as any).snapshot ?? (v as any).metadata_snapshot ?? null;
    if (snapshot) {
      return { snapshot, metadata_snapshot: (v as any).metadata_snapshot ?? null };
    }

    const storagePath = (v as any).storage_path as string | undefined;
    if (!storagePath) {
      return Errors.internal("Course version exists but no snapshot/storage_path available", requestId, req);
    }

    const { data: file, error: dlErr } = await admin.storage.from("courses").download(storagePath);
    if (dlErr || !file) return Errors.internal(dlErr?.message || "Failed to download snapshot", requestId, req);

    const text = await file.text();
    const json = text ? JSON.parse(text) : null;
    if (!json) return Errors.internal("Snapshot file is empty", requestId, req);

    return { snapshot: json };
  }),
);


