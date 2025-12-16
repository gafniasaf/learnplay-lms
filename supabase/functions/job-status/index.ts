import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const QuerySchema = z.object({
  jobId: z.string().uuid(),
});

async function courseReality(admin: any, courseId: string) {
  let courseJsonExists: boolean | null = null;
  let storagePath: string | null = null;

  try {
    const { data: files, error: listErr } = await admin.storage.from("courses").list(courseId, { limit: 100, search: "course.json" });
    if (!listErr) {
      const found = (files ?? []).some((f: any) => (f.name ?? "") === "course.json");
      courseJsonExists = found;
      if (found) storagePath = `${courseId}/course.json`;
    }
  } catch {
    courseJsonExists = null;
  }

  return { courseJsonExists, storagePath };
}

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Validate BEFORE auth
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ jobId: url.searchParams.get("jobId") ?? "" });
    if (!parsed.success) return Errors.invalidRequest("Invalid jobId parameter", requestId, req);

    // Require user session or agent token
    try {
      await authenticateRequest(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unauthorized";
      return Errors.invalidAuth(msg === "Unauthorized: Valid Agent Token or User Session required" ? requestId : requestId, req);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jobId = parsed.data.jobId;

    const { data: job, error: jobErr } = await admin.from("ai_course_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobErr) return Errors.internal(jobErr.message, requestId, req);
    if (!job) return Errors.notFound("Job", requestId, req);

    // job_events is optional in some deployments. When missing, job-status should still work.
    let last: any = null;
    try {
      const { data: events, error: evErr } = await admin
        .from("job_events")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (evErr) {
        const msg = (evErr as any)?.message ?? String(evErr);
        const isMissingTable =
          typeof msg === "string" &&
          (msg.includes("Could not find the table") || msg.includes("job_events"));
        if (!isMissingTable) return Errors.internal(msg, requestId, req);
      } else {
        last = events?.[0] ?? null;
      }
    } catch {
      // ignore; keep last = null
    }
    let state = (job as any).status ?? last?.status ?? "unknown";
    let step = last?.step ?? (state === "done" ? "done" : "generating");
    let progress = typeof last?.progress === "number" ? last.progress : state === "done" ? 100 : state === "failed" ? 100 : 10;

    const courseId = (job as any).course_id as string | undefined;
    let reality = { courseJsonExists: null as null | boolean, storagePath: null as null | string };
    if (courseId) {
      reality = await courseReality(admin, courseId);
      const realityDone = reality.courseJsonExists === true;
      if (realityDone && state !== "done") {
        state = "done";
        step = "done";
        progress = 100;
      }
    }

    return {
      jobId,
      state,
      step,
      progress,
      message: last?.message ?? (job as any).error ?? "",
      lastEventTime: last?.created_at ?? (job as any).updated_at ?? null,
      drift: {
        storage: reality.courseJsonExists === true,
      },
      reality,
    };
  }),
);


