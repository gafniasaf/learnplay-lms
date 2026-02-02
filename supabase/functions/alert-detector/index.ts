import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonOk(req: Request, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" }),
  });
}

function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value ? Number(value) : NaN;
  const num = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(num, min), max);
}

function isoNow(): string {
  return new Date().toISOString();
}

async function countByStatus(opts: {
  table: string;
  organizationId: string;
  status: string;
  sinceIso?: string;
  timeField?: string;
}): Promise<number> {
  const { table, organizationId, status, sinceIso, timeField = "updated_at" } = opts;
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("status", status);
  if (sinceIso) {
    query = query.gte(timeField, sinceIso);
  }
  query = query.eq("organization_id", organizationId);
  const res = await query;
  if (!res.error && typeof res.count === "number") return res.count;

  // Fallback: table may not have organization_id
  const fallback = await supabase.from(table).select("id", { count: "exact", head: true }).eq("status", status);
  if (fallback.error) return 0;
  return typeof fallback.count === "number" ? fallback.count : 0;
}

async function countStuckJobs(opts: {
  table: string;
  organizationId: string;
  statuses: string[];
  staleMs: number;
}): Promise<number> {
  const { table, organizationId, statuses, staleMs } = opts;
  const cutoff = Date.now() - staleMs;
  let query = supabase
    .from(table)
    .select("id,last_heartbeat,started_at,created_at,status")
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(500)
    .eq("organization_id", organizationId);

  let res = await query;
  if (res.error) {
    // Fallback for tables without organization_id
    query = supabase
      .from(table)
      .select("id,last_heartbeat,started_at,created_at,status")
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(500);
    res = await query;
  }

  if (res.error || !Array.isArray(res.data)) return 0;
  return res.data.filter((row: any) => {
    const ts = row?.last_heartbeat || row?.started_at || row?.created_at;
    const t = ts ? Date.parse(String(ts)) : NaN;
    return Number.isFinite(t) && t < cutoff;
  }).length;
}

async function upsertAlert(opts: {
  organizationId: string;
  alertKey: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const now = isoNow();
  const { organizationId, alertKey, type, severity, message, meta } = opts;
  const existing = await supabase
    .from("alerts")
    .select("id,count")
    .eq("organization_id", organizationId)
    .eq("alert_key", alertKey)
    .maybeSingle();

  if (existing.data?.id) {
    const count = typeof existing.data.count === "number" ? existing.data.count + 1 : 1;
    await supabase
      .from("alerts")
      .update({ message, severity, meta: meta ?? {}, count, last_seen_at: now, resolved_at: null })
      .eq("id", existing.data.id);
    return;
  }

  await supabase.from("alerts").insert({
    organization_id: organizationId,
    alert_key: alertKey,
    type,
    severity,
    message,
    meta: meta ?? {},
    count: 1,
    last_seen_at: now,
  });
}

async function resolveInactive(opts: { organizationId: string; activeKeys: string[] }): Promise<void> {
  const now = isoNow();
  const { organizationId, activeKeys } = opts;
  let query = supabase
    .from("alerts")
    .update({ resolved_at: now })
    .eq("organization_id", organizationId)
    .is("resolved_at", null);
  if (activeKeys.length) {
    const list = activeKeys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(",");
    query = query.not("alert_key", "in", `(${list})`);
  }
  await query;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "alert-detector");
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonOk(req, { ok: false, error: { code: "method_not_allowed", message: "Method Not Allowed" }, httpStatus: 405 });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    return jsonOk(req, { ok: false, error: { code: "unauthorized", message: error instanceof Error ? error.message : "Unauthorized" } });
  }

  const organizationId = requireOrganizationId(auth);

  let params: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      params = await req.json();
    } catch {
      params = {};
    }
  } else {
    const url = new URL(req.url);
    params = Object.fromEntries(url.searchParams.entries());
  }

  const windowMinutes = parseNumber(
    typeof params.windowMinutes === "number"
      ? String(params.windowMinutes)
      : typeof params.windowMinutes === "string"
        ? params.windowMinutes
        : null,
    60,
    15,
    24 * 60,
  );
  const stuckMinutes = parseNumber(
    typeof params.stuckMinutes === "number"
      ? String(params.stuckMinutes)
      : typeof params.stuckMinutes === "string"
        ? params.stuckMinutes
        : null,
    20,
    5,
    240,
  );
  const failureThreshold = parseNumber(
    typeof params.failureThreshold === "number"
      ? String(params.failureThreshold)
      : typeof params.failureThreshold === "string"
        ? params.failureThreshold
        : null,
    0.3,
    0.05,
    0.9,
  );
  const minSamples = parseNumber(
    typeof params.minSamples === "number"
      ? String(params.minSamples)
      : typeof params.minSamples === "string"
        ? params.minSamples
        : null,
    5,
    1,
    200,
  );
  const deadLetterThreshold = parseNumber(
    typeof params.deadLetterThreshold === "number"
      ? String(params.deadLetterThreshold)
      : typeof params.deadLetterThreshold === "string"
        ? params.deadLetterThreshold
        : null,
    1,
    1,
    1000,
  );

  const windowIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const staleMs = stuckMinutes * 60 * 1000;

  const activeKeys: string[] = [];

  const stuckAgent = await countStuckJobs({
    table: "ai_agent_jobs",
    organizationId,
    statuses: ["processing", "queued"],
    staleMs,
  });
  if (stuckAgent > 0) {
    const alertKey = `stuck_agent_${organizationId}`;
    await upsertAlert({
      organizationId,
      alertKey,
      type: "stuck_agent_jobs",
      severity: stuckAgent > 5 ? "critical" : "warning",
      message: `${stuckAgent} agent jobs appear stuck for ${stuckMinutes}m+`,
      meta: { count: stuckAgent, stuckMinutes },
    });
    activeKeys.push(alertKey);
  }

  const stuckCourse = await countStuckJobs({
    table: "ai_course_jobs",
    organizationId,
    statuses: ["processing"],
    staleMs,
  });
  if (stuckCourse > 0) {
    const alertKey = `stuck_course_${organizationId}`;
    await upsertAlert({
      organizationId,
      alertKey,
      type: "stuck_course_jobs",
      severity: stuckCourse > 3 ? "critical" : "warning",
      message: `${stuckCourse} course jobs appear stuck for ${stuckMinutes}m+`,
      meta: { count: stuckCourse, stuckMinutes },
    });
    activeKeys.push(alertKey);
  }

  const stuckMedia = await countStuckJobs({
    table: "ai_media_jobs",
    organizationId,
    statuses: ["processing"],
    staleMs,
  });
  if (stuckMedia > 0) {
    const alertKey = `stuck_media_${organizationId}`;
    await upsertAlert({
      organizationId,
      alertKey,
      type: "stuck_media_jobs",
      severity: stuckMedia > 10 ? "critical" : "warning",
      message: `${stuckMedia} media jobs appear stuck for ${stuckMinutes}m+`,
      meta: { count: stuckMedia, stuckMinutes },
    });
    activeKeys.push(alertKey);
  }

  const stuckBook = await countStuckJobs({
    table: "book_render_jobs",
    organizationId,
    statuses: ["processing"],
    staleMs,
  });
  if (stuckBook > 0) {
    const alertKey = `stuck_book_${organizationId}`;
    await upsertAlert({
      organizationId,
      alertKey,
      type: "stuck_book_jobs",
      severity: stuckBook > 3 ? "critical" : "warning",
      message: `${stuckBook} book render jobs appear stuck for ${stuckMinutes}m+`,
      meta: { count: stuckBook, stuckMinutes },
    });
    activeKeys.push(alertKey);
  }

  const jobTypes = [
    { table: "ai_agent_jobs", label: "agent" },
    { table: "ai_course_jobs", label: "course" },
    { table: "ai_media_jobs", label: "media" },
    { table: "book_render_jobs", label: "book" },
  ];

  for (const job of jobTypes) {
    const failed = await countByStatus({
      table: job.table,
      organizationId,
      status: "failed",
      sinceIso: windowIso,
      timeField: "completed_at",
    });
    const done = await countByStatus({
      table: job.table,
      organizationId,
      status: "done",
      sinceIso: windowIso,
      timeField: "completed_at",
    });
    const dead = await countByStatus({
      table: job.table,
      organizationId,
      status: "dead_letter",
      sinceIso: windowIso,
      timeField: "updated_at",
    });

    const total = failed + done;
    if (dead >= deadLetterThreshold) {
      const alertKey = `dead_letter_${job.label}_${organizationId}`;
      await upsertAlert({
        organizationId,
        alertKey,
        type: "dead_letter_spike",
        severity: dead > 5 ? "critical" : "warning",
        message: `${dead} ${job.label} jobs hit dead_letter in the last ${windowMinutes}m`,
        meta: { table: job.table, count: dead, windowMinutes },
      });
      activeKeys.push(alertKey);
    }

    if (total >= minSamples) {
      const ratio = total > 0 ? failed / total : 0;
      if (ratio >= failureThreshold) {
        const alertKey = `failure_rate_${job.label}_${organizationId}`;
        await upsertAlert({
          organizationId,
          alertKey,
          type: "failure_rate_spike",
          severity: ratio > 0.6 ? "critical" : "warning",
          message: `${job.label} failure rate ${(ratio * 100).toFixed(0)}% over last ${windowMinutes}m`,
          meta: { table: job.table, failed, done, ratio, windowMinutes },
        });
        activeKeys.push(alertKey);
      }
    }
  }

  await resolveInactive({ organizationId, activeKeys });

  // Send Slack notification for critical alerts
  const slackWebhook = Deno.env.get("SLACK_WEBHOOK_URL");
  if (slackWebhook && activeKeys.length > 0) {
    // Fetch the active critical alerts to send to Slack
    const { data: criticalAlerts } = await supabase
      .from("alerts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("severity", "critical")
      .is("resolved_at", null)
      .in("alert_key", activeKeys);

    if (criticalAlerts && criticalAlerts.length > 0) {
      try {
        const edgeFunctionUrl = Deno.env.get("SUPABASE_URL");
        const agentToken = Deno.env.get("AGENT_TOKEN");
        if (edgeFunctionUrl && agentToken) {
          await fetch(`${edgeFunctionUrl}/functions/v1/slack-notify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Agent-Token": agentToken,
            },
            body: JSON.stringify({ alerts: criticalAlerts }),
          });
        }
      } catch {
        // Best effort - don't fail the detector if Slack fails
      }
    }
  }

  return jsonOk(req, { ok: true, active: activeKeys, windowMinutes, stuckMinutes });
});
