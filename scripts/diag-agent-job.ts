import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

// Load env from local files (gitignored) without printing secret values.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`❌ ${name} is REQUIRED - set env var before running`);
    process.exit(1);
  }
  return v.trim();
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function shortBody(body: unknown): string {
  try {
    const s = typeof body === "string" ? body : JSON.stringify(body);
    return s.length > 600 ? `${s.slice(0, 600)}…` : s;
  } catch {
    return "(unserializable body)";
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; ok: boolean; json: any; text: string }> {
  const resp = await fetch(url, init);
  const text = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: resp.status, ok: resp.ok, json, text };
}

async function main() {
  const jobId = (process.argv[2] || "").trim();
  if (!jobId) {
    console.error("Usage: npx tsx scripts/diag-agent-job.ts <jobId>");
    process.exit(1);
  }

  const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_ANON_KEY") || getEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`[diag-agent-job] SUPABASE_URL=${SUPABASE_URL}`);
  console.log(`[diag-agent-job] jobId=${jobId}`);

  // 1) Inspect job state via get-job (agent auth)
  {
    const url = `${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=200`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Agent-Token": AGENT_TOKEN,
      "X-Organization-Id": ORGANIZATION_ID,
    };
    if (SUPABASE_ANON_KEY) headers["apikey"] = SUPABASE_ANON_KEY;

    const res = await fetchJson(url, { method: "GET", headers });
    const j = res.json;
    const job = j?.job || null;
    const eventsArr = Array.isArray(j?.events) ? j.events : null;
    const eventsCount = eventsArr ? eventsArr.length : null;
    const lastEvents =
      eventsArr && eventsArr.length
        ? eventsArr
            .slice(-6)
            .map((e: any) => ({
              seq: e?.seq ?? e?.id ?? null,
              step: e?.step ?? null,
              status: e?.status ?? null,
              progress: e?.progress ?? null,
              message: typeof e?.message === "string" ? (e.message.length > 160 ? `${e.message.slice(0, 160)}…` : e.message) : null,
            }))
        : null;
    const result = job?.result && typeof job.result === "object" ? job.result : null;
    const resultSummary =
      result && typeof result === "object"
        ? {
            ok: (result as any).ok,
            bookId: (result as any).bookId,
            bookVersionId: (result as any).bookVersionId,
            firstChapterJobId: (result as any).firstChapterJobId,
            chapterCount: (result as any).chapterCount,
            done: (result as any).done,
          }
        : null;
    console.log("[diag-agent-job] get-job:", {
      httpStatus: res.status,
      ok: !!j?.ok,
      jobSource: j?.jobSource,
      job: job
        ? {
            id: job.id,
            job_type: job.job_type,
            status: job.status,
            created_at: job.created_at,
            started_at: job.started_at,
            completed_at: job.completed_at,
            last_heartbeat: job.last_heartbeat,
            retry_count: job.retry_count,
            max_retries: job.max_retries,
            error: job.error,
          }
        : null,
      result: resultSummary,
      eventsCount,
      lastEvents,
    });
    if (!res.ok) {
      console.log("[diag-agent-job] get-job raw:", shortBody(res.json ?? res.text));
    }
  }

  // 2) Try the worker endpoint the same way pg_cron would (no auth headers)
  {
    const url = `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`;
    const res = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    console.log("[diag-agent-job] ai-job-runner (no auth):", {
      httpStatus: res.status,
      ok: res.ok,
      body: res.json ?? shortBody(res.text),
    });
  }

  // 3) Try the worker endpoint with apikey (common gateway requirement)
  if (SUPABASE_ANON_KEY) {
    const url = `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`;
    const res = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: "{}",
    });
    console.log("[diag-agent-job] ai-job-runner (apikey):", {
      httpStatus: res.status,
      ok: res.ok,
      body: res.json ?? shortBody(res.text),
    });
  }

  // 4) Try the worker endpoint with service role (if available)
  if (SUPABASE_SERVICE_ROLE_KEY) {
    const url = `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`;
    const res = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: "{}",
    });
    console.log("[diag-agent-job] ai-job-runner (service role):", {
      httpStatus: res.status,
      ok: res.ok,
      body: res.json ?? shortBody(res.text),
    });
  }

  // 5) Try the legacy cron target (process-pending-jobs) for agent jobs
  {
    const url = `${SUPABASE_URL}/functions/v1/process-pending-jobs?agentN=1&agentJobId=${encodeURIComponent(jobId)}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
    };
    if (SUPABASE_ANON_KEY) {
      headers["apikey"] = SUPABASE_ANON_KEY;
      headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const res = await fetchJson(url, { method: "POST", headers, body: "{}" });
    console.log("[diag-agent-job] process-pending-jobs:", {
      httpStatus: res.status,
      ok: res.ok,
      body: res.json ?? shortBody(res.text),
    });
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("❌ diag-agent-job failed:", msg);
  process.exit(1);
});


