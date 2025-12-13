import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { runJob } from "../ai-job-runner/runner.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "POST") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Validate BEFORE auth
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Errors.invalidRequest("Invalid JSON body", requestId, req);
    }
    const n = typeof body?.n === "number" ? Math.min(10, Math.max(1, Math.floor(body.n))) : 3;

    // Authorization: require agent token OR superadmin user session
    const agentHeader = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
    const expectedAgent = Deno.env.get("AGENT_TOKEN");

    let userId: string | null = null;
    if (!(expectedAgent && agentHeader === expectedAgent)) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return Errors.noAuth(requestId, req);

      const anonKey = requireEnv("SUPABASE_ANON_KEY");
      const userClient = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: authData, error: authErr } = await userClient.auth.getUser();
      if (authErr || !authData?.user) return Errors.invalidAuth(requestId, req);
      userId = authData.user.id;

      const { data: roles, error: roleErr } = await admin.from("user_roles").select("role").eq("user_id", userId);
      if (roleErr) return Errors.internal(roleErr.message, requestId, req);
      const ok = Array.isArray(roles) && roles.some((r: any) => r.role === "superadmin");
      if (!ok) return Errors.forbidden("superadmin role required", requestId, req);
    }

    const { data: pendingJobs, error: fetchErr } = await admin
      .from("ai_course_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(n);

    if (fetchErr) return Errors.internal(fetchErr.message, requestId, req);
    if (!pendingJobs || pendingJobs.length === 0) return { ok: true, processed: 0, results: [] };

    const results: any[] = [];

    for (const job of pendingJobs) {
      const jobId = job.id;
      await admin.from("ai_course_jobs").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", jobId);

      const jobType = "ai_course_generate";
      const payload = {
        course_id: job.course_id,
        subject: job.subject,
        grade: job.grade,
        grade_band: job.grade_band,
        items_per_group: job.items_per_group,
        mode: job.mode,
        ...((job as any).payload || {}),
      };

      try {
        const result = await runJob(jobType, payload, jobId);
        await admin.from("ai_course_jobs").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", jobId);
        results.push({ jobId, status: "done", result });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await admin.from("ai_course_jobs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", jobId);
        results.push({ jobId, status: "failed", error: message });
      }
    }

    return { ok: true, processed: results.length, results };
  }),
);


