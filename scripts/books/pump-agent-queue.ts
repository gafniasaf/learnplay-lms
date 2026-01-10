import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pumpOnce(opts: { supabaseUrl: string; headers: Record<string, string>; timeoutMs: number }) {
  const url = `${opts.supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...opts.headers, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ worker: true, queue: "agent" }),
      signal: ac.signal,
    });
    const text = await res.text().catch(() => "");
    const json = text ? safeJsonParse(text) : null;
    if (!res.ok) {
      const msg = json?.error?.message || json?.error || `${res.status}`;
      throw new Error(`HTTP ${res.status} from ai-job-runner: ${msg}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  if (!SUPABASE_URL) {
    console.error("BLOCKED: SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
    process.exit(1);
  }

  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const headers = {
    "X-Agent-Token": AGENT_TOKEN,
    "X-Organization-Id": ORG_ID,
    Accept: "application/json",
  };

  let processedCount = 0;
  let idleCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const out = await pumpOnce({ supabaseUrl: SUPABASE_URL, headers, timeoutMs: 30 * 60 * 1000 });
      const processed = out?.processed === true;
      if (!processed) {
        idleCount += 1;
        if (idleCount % 6 === 1) {
          console.log("[pump] idle: no pending agent jobs; sleeping…");
        }
        await sleep(10_000);
        continue;
      }

      idleCount = 0;
      processedCount += 1;

      const jobId = typeof out?.jobId === "string" ? out.jobId : "";
      const jobType = typeof out?.jobType === "string" ? out.jobType : "";
      const status = typeof out?.status === "string" ? out.status : "";
      const yielded = out?.yielded === true;

      if (yielded || processedCount % 10 === 0) {
        console.log(`[pump] processed=${processedCount} last=${jobType || "job"} ${jobId ? jobId : ""} status=${status || "?"}${yielded ? " (yield)" : ""}`);
      }

      await sleep(250);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[pump] error: ${msg}`);
      await sleep(5_000);
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[pump] fatal: ${msg}`);
  process.exit(1);
});


