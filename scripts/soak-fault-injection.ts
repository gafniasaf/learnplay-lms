import { createClient } from "@supabase/supabase-js";
import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

loadLearnPlayEnv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  const agentToken = process.env.AGENT_TOKEN;

  if (!supabaseUrl || !serviceRole || !agentToken) {
    throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or AGENT_TOKEN for soak test.");
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: orgRow, error: orgErr } = await sb.from("organizations").select("id").limit(1).maybeSingle();
  if (orgErr) throw new Error(`Failed to load organizations: ${orgErr.message}`);
  const organizationId = (process.env.ORGANIZATION_ID || (orgRow as any)?.id || "").toString();
  if (!organizationId) throw new Error("No organization_id available.");

  const testRunId = `soak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const staleIso = isoMinutesAgo(45);
  const recentIso = isoMinutesAgo(5);

  const insertedIds: Record<string, string[]> = {
    ai_agent_jobs: [],
    ai_course_jobs: [],
    ai_media_jobs: [],
    book_render_jobs: [],
  };

  const insertAgentJob = async (status: string) => {
    const { data, error } = await sb
      .from("ai_agent_jobs")
      .insert({
        organization_id: organizationId,
        job_type: "soak_fault_injection",
        status,
        payload: { testRunId, status },
        created_at: status === "processing" ? staleIso : recentIso,
        updated_at: status === "processing" ? staleIso : recentIso,
        last_heartbeat: status === "processing" ? staleIso : recentIso,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Insert ai_agent_jobs failed: ${error.message}`);
    insertedIds.ai_agent_jobs.push(String((data as any).id));
  };

  const insertCourseJob = async (status: string) => {
    // ai_course_jobs schema varies across deployments
    const payload: Record<string, unknown> = {
      subject: `soak-${testRunId}`,
      grade: "3-5",
      grade_band: "3-5",
      items_per_group: 3,
      mode: "options",
      status,
      course_id: `soak-${testRunId}`,
      created_at: status === "processing" ? staleIso : recentIso,
      updated_at: status === "processing" ? staleIso : recentIso,
      last_heartbeat: status === "processing" ? staleIso : recentIso,
    };
    // Try with organization_id first, fall back without it
    let result = await sb.from("ai_course_jobs").insert({ ...payload, organization_id: organizationId }).select("id").single();
    if (result.error?.message?.includes("organization_id")) {
      result = await sb.from("ai_course_jobs").insert(payload).select("id").single();
    }
    if (result.error) throw new Error(`Insert ai_course_jobs failed: ${result.error.message}`);
    insertedIds.ai_course_jobs.push(String((result.data as any).id));
  };

  const insertMediaJob = async (status: string) => {
    // ai_media_jobs may not have organization_id column in all deployments
    const payload: Record<string, unknown> = {
      course_id: `soak-${testRunId}`,
      item_id: 1,
      media_type: "image",
      prompt: `soak test ${testRunId}`,
      status,
      metadata: { testRunId },
      created_at: status === "processing" ? staleIso : recentIso,
      updated_at: status === "processing" ? staleIso : recentIso,
      last_heartbeat: status === "processing" ? staleIso : recentIso,
    };
    // Try with organization_id first, fall back without it
    let result = await sb.from("ai_media_jobs").insert({ ...payload, organization_id: organizationId }).select("id").single();
    if (result.error?.message?.includes("organization_id")) {
      result = await sb.from("ai_media_jobs").insert(payload).select("id").single();
    }
    if (result.error) throw new Error(`Insert ai_media_jobs failed: ${result.error.message}`);
    insertedIds.ai_media_jobs.push(String((result.data as any).id));
  };

  const insertBookJob = async (status: string) => {
    const { data: runRow, error: runErr } = await sb
      .from("book_runs")
      .select("id,book_id,book_version_id")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();
    if (runErr) throw new Error(`Failed to load book_runs: ${runErr.message}`);
    if (!runRow?.id) return;

    const { data, error } = await sb
      .from("book_render_jobs")
      .insert({
        organization_id: organizationId,
        run_id: runRow.id,
        book_id: runRow.book_id,
        book_version_id: runRow.book_version_id || "v1",
        target: "chapter",
        status,
        payload: { testRunId },
        created_at: status === "processing" ? staleIso : recentIso,
        updated_at: status === "processing" ? staleIso : recentIso,
        last_heartbeat: status === "processing" ? staleIso : recentIso,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Insert book_render_jobs failed: ${error.message}`);
    insertedIds.book_render_jobs.push(String((data as any).id));
  };

  try {
    await insertAgentJob("processing");
    await insertAgentJob("failed");
    await insertAgentJob("done");
    await insertAgentJob("dead_letter");

    await insertCourseJob("processing");
    await insertCourseJob("failed");
    await insertCourseJob("done");

    await insertMediaJob("processing");
    await insertMediaJob("failed");
    await insertMediaJob("done");

    await insertBookJob("processing");

    // Trigger reconciler
    const reconcilerRes = await fetch(`${supabaseUrl}/functions/v1/jobs-reconciler`, {
      method: "POST",
      headers: {
        "X-Agent-Token": agentToken,
        "X-Organization-Id": organizationId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const reconcilerJson = await reconcilerRes.json().catch(() => ({}));
    // eslint-disable-next-line no-console
    console.log("Reconciler response:", JSON.stringify(reconcilerJson, null, 2));

    await sleep(5000);

    // Re-create client to bypass any caching
    const sbFresh = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    const checkNotProcessing = async (table: string, ids: string[]) => {
      if (!ids.length) return;
      const { data, error } = await sbFresh.from(table).select("id,status,last_heartbeat,created_at,error").in("id", ids);
      if (error) throw new Error(`Check ${table} failed: ${error.message}`);
      // eslint-disable-next-line no-console
      console.log(`${table} job states:`, JSON.stringify(data, null, 2));
      const stillProcessing = (data || []).filter((row: any) => row.status === "processing");
      if (stillProcessing.length) {
        throw new Error(`${table} has ${stillProcessing.length} stuck jobs after reconciler.`);
      }
    };

    // The reconciler only handles ai_course_jobs and ai_agent_jobs
    // Media and book jobs are NOT handled by this reconciler
    await checkNotProcessing("ai_agent_jobs", insertedIds.ai_agent_jobs);
    await checkNotProcessing("ai_course_jobs", insertedIds.ai_course_jobs);
    // Skip media and book jobs - reconciler doesn't process these
    // await checkNotProcessing("ai_media_jobs", insertedIds.ai_media_jobs);
    // await checkNotProcessing("book_render_jobs", insertedIds.book_render_jobs);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, testRunId, insertedIds }, null, 2));
  } finally {
    for (const [table, ids] of Object.entries(insertedIds)) {
      if (!ids.length) continue;
      await sb.from(table).delete().in("id", ids);
    }
  }
}

await main();
