import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`❌ ${name} is REQUIRED`);
    process.exit(1);
  }
  return String(v).trim();
}

function getSupabaseUrl(): string {
  const v0 = typeof process.env.VITE_SUPABASE_URL === "string" ? process.env.VITE_SUPABASE_URL.trim() : "";
  if (v0) return v0.replace(/\/$/, "");
  return requireEnv("SUPABASE_URL").replace(/\/$/, "");
}

function stripRuntimeKeys(payload: any, opts: { resetDraft?: boolean; resetOrchestrator?: boolean }): any {
  const next: any = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};

  if (opts.resetDraft) {
    delete next.__draftAttempt;
    delete next.__draftFailureReason;
    delete next.__draftMustFillTitle;
    delete next.__llmTimeoutAttempt;
    // Let the strategy pick a sane default again.
    delete next.sectionMaxTokens;
  }

  if (opts.resetOrchestrator) {
    delete next.orchestratorAttempts;
    delete next.orchestratorStartedAt;
    delete next.orchestratorLastProgressAt;
    // These are derived state; keep pendingSectionJobId if present.
    delete next.__yieldCount;
  }

  return next;
}

async function main() {
  const jobId = String(process.argv[2] || "").trim();
  const mode = String(process.argv[3] || "").trim(); // "section" | "chapter" | "auto"
  if (!jobId) {
    console.error("Usage: npx tsx scripts/books/reset-agent-job.ts <jobId> <section|chapter|auto>");
    process.exit(1);
  }

  const SUPABASE_URL = getSupabaseUrl();
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: getErr } = await supabase
    .from("ai_agent_jobs")
    .select("id, job_type, status, payload")
    .eq("id", jobId)
    .maybeSingle();
  if (getErr) throw new Error(getErr.message);
  if (!row) throw new Error("Job not found");

  const jobType = String((row as any).job_type || "").trim();
  const payload = (row as any).payload;

  const resetDraft = mode === "section" || (mode === "auto" && jobType === "book_generate_section");
  const resetOrchestrator = mode === "chapter" || (mode === "auto" && jobType === "book_generate_chapter");
  if (!resetDraft && !resetOrchestrator) {
    throw new Error(`BLOCKED: Unknown mode '${mode}'. Use section|chapter|auto`);
  }

  const nextPayload = stripRuntimeKeys(payload, { resetDraft, resetOrchestrator });

  const { data: updated, error: upErr } = await supabase
    .from("ai_agent_jobs")
    .update({
      status: "queued",
      error: null,
      retry_count: 0,
      started_at: null,
      completed_at: null,
      last_heartbeat: null,
      payload: nextPayload,
    })
    .eq("id", jobId)
    .select("id, job_type, status")
    .single();
  if (upErr) throw new Error(upErr.message);

  console.log(JSON.stringify({ ok: true, job: updated }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ reset-agent-job failed: ${msg}`);
  process.exit(1);
});


