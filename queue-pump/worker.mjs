/**
 * Agent Queue Pump (non-local worker)
 *
 * Runs a single-worker loop that repeatedly calls:
 *   POST {SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent
 *
 * This keeps BookGen and other ai_agent_jobs progressing continuously without relying on a developer laptop.
 *
 * Required env:
 * - SUPABASE_URL
 * - AGENT_TOKEN
 * - ORGANIZATION_ID
 *
 * Optional env:
 * - QUEUE_PUMP_IDLE_SLEEP_MS (default 10000)
 * - QUEUE_PUMP_TICK_SLEEP_MS (default 250)
 * - QUEUE_PUMP_HTTP_TIMEOUT_MS (default 1800000)  // 30 minutes
 * - QUEUE_PUMP_LOG_EVERY (default 10)
 */

function requireEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) {
    console.error(`❌ BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

function parseIntEnv(name, def, min, max) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

async function pumpOnce({ supabaseUrl, headers, timeoutMs }) {
  const url = `${supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
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
  const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const idleSleepMs = parseIntEnv("QUEUE_PUMP_IDLE_SLEEP_MS", 10_000, 1_000, 120_000);
  const tickSleepMs = parseIntEnv("QUEUE_PUMP_TICK_SLEEP_MS", 250, 0, 5_000);
  const timeoutMs = parseIntEnv("QUEUE_PUMP_HTTP_TIMEOUT_MS", 30 * 60 * 1000, 10_000, 45 * 60 * 1000);
  const logEvery = parseIntEnv("QUEUE_PUMP_LOG_EVERY", 10, 1, 10_000);

  const headers = {
    "X-Agent-Token": AGENT_TOKEN,
    "X-Organization-Id": ORG_ID,
    Accept: "application/json",
  };

  let processedCount = 0;
  let idleCount = 0;

  console.log(`[queue-pump] started (idleSleepMs=${idleSleepMs}, tickSleepMs=${tickSleepMs}, timeoutMs=${timeoutMs})`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const out = await pumpOnce({ supabaseUrl: SUPABASE_URL, headers, timeoutMs });
      const processed = out?.processed === true;
      if (!processed) {
        idleCount += 1;
        if (idleCount % 6 === 1) console.log("[queue-pump] idle: no pending agent jobs; sleeping…");
        await sleep(idleSleepMs);
        continue;
      }

      idleCount = 0;
      processedCount += 1;

      const jobId = typeof out?.jobId === "string" ? out.jobId : "";
      const jobType = typeof out?.jobType === "string" ? out.jobType : "";
      const status = typeof out?.status === "string" ? out.status : "";
      const yielded = out?.yielded === true;

      if (yielded || processedCount % logEvery === 0) {
        console.log(
          `[queue-pump] processed=${processedCount} last=${jobType || "job"} ${jobId ? jobId : ""} status=${status || "?"}${
            yielded ? " (yield)" : ""
          }`,
        );
      }

      if (tickSleepMs > 0) await sleep(tickSleepMs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[queue-pump] error: ${msg}`);
      await sleep(5_000);
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[queue-pump] fatal: ${msg}`);
  process.exit(1);
});


