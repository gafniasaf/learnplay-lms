import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { emitJobEvent } from "../_shared/job-events.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function courseReality(courseId: string) {
  let hasCourseJson = false;
  let inCatalog = false;

  const { data: files } = await admin.storage.from("courses").list(courseId, { limit: 100, search: "course.json" });
  if (files && Array.isArray(files)) {
    hasCourseJson = files.some((f: any) => (f.name || "") === "course.json");
  }

  const { data: catObj } = await admin.storage.from("courses").download("catalog.json");
  if (catObj) {
    try {
      const txt = await catObj.text();
      const cat = JSON.parse(txt);
      const arr = Array.isArray(cat?.courses) ? cat.courses : [];
      inCatalog = arr.some((c: any) => c?.id === courseId);
    } catch {
      inCatalog = false;
    }
  }

  return { hasCourseJson, inCatalog };
}

serve(
  withCors(async (req: Request) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "POST") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Authorization: agent token OR superadmin user session
    const agentHeader = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
    const expectedAgent = Deno.env.get("AGENT_TOKEN");

    if (!(expectedAgent && agentHeader === expectedAgent)) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return Errors.noAuth(requestId, req);
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authErr } = await userClient.auth.getUser();
      if (authErr || !authData?.user) return Errors.invalidAuth(requestId, req);

      const { data: roles, error: roleErr } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id);
      if (roleErr) return Errors.internal(roleErr.message, requestId, req);
      const ok = Array.isArray(roles) && roles.some((r: any) => r.role === "superadmin");
      if (!ok) return Errors.forbidden("superadmin role required", requestId, req);
    }

    // Find jobs not done/failed
    const { data: jobs, error } = await admin
      .from("ai_course_jobs")
      .select("id, course_id, status, result_path, last_heartbeat, created_at")
      .neq("status", "done")
      .neq("status", "failed")
      .limit(100);

    if (error) return Errors.internal(error.message, requestId, req);

    const results: any[] = [];

    for (const job of jobs || []) {
      const courseId = job.course_id as string;
      const { hasCourseJson, inCatalog } = await courseReality(courseId);
      const realityDone = Boolean(hasCourseJson || inCatalog);

      if (realityDone) {
        const result_path = (job as any).result_path || `${courseId}/course.json`;
        await admin.from("ai_course_jobs").update({ status: "done", result_path }).eq("id", job.id);
        try {
          await emitJobEvent(job.id, "done", 100, "Reconciler: marked done based on reality (storage or catalog)", {
            result_path,
            hasCourseJson,
            inCatalog,
          });
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, action: "marked_done", hasCourseJson, inCatalog });
        continue;
      }

      const heartbeatOrCreated = (job as any).last_heartbeat || (job as any).created_at;
      const updatedAtMs = heartbeatOrCreated ? new Date(heartbeatOrCreated).getTime() : NaN;
      const isStalled = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > 5 * 60 * 1000;

      if (isStalled) {
        await admin.from("ai_course_jobs").update({ status: "failed", error: "Reconciler: job stalled" }).eq("id", job.id);
        try {
          await emitJobEvent(job.id, "failed", 100, "Reconciler: job stalled");
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, action: "marked_failed_stalled" });
      } else {
        try {
          await emitJobEvent(job.id, "heartbeat", 10, "Reconciler heartbeat");
        } catch {
          // best-effort
        }
        results.push({ jobId: job.id, action: "heartbeat" });
      }
    }

    return { ok: true, count: results.length, results };
  }),
);


