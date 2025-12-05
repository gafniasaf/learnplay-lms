import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://xlslksprdjsxawvcikfk.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || "";

if (!SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE ANON KEY (set VITE_SUPABASE_ANON_KEY)");
  process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY for plan persistence");
  process.exit(1);
}
if (!AGENT_TOKEN || !ORGANIZATION_ID) {
  console.error("Missing AGENT_TOKEN or ORGANIZATION_ID for agent-scoped Edge calls.");
  process.exit(1);
}

const AGENT_HEADERS = {
  "X-Agent-Token": AGENT_TOKEN,
  "X-Organization-Id": ORGANIZATION_ID,
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  },
});

const ENQUEUE_URL = `${SUPABASE_URL}/functions/v1/enqueue-job`;
const SAVE_PLAN_URL = `${SUPABASE_URL}/functions/v1/save-plan`;

const SAMPLE_HTML = `<!DOCTYPE html>
<style>
  .mockup-app { padding: 32px; font-family: system-ui; }
  .cta-row { display: flex; gap: 12px; }
  button[data-cta-id] { padding: 12px 20px; border-radius: 999px; border: none; }
</style>
<div class="mockup-app" data-plan="export-flow">
  <header>
    <h1>CTA Console</h1>
    <p>Golden Plan export probe.</p>
  </header>
  <div class="cta-row">
    <button data-cta-id="start-sim" data-action="start">Start Sim</button>
    <button data-cta-id="end-case" data-action="finish">Finish Case</button>
    <button data-cta-id="new-session" data-action="refresh">New Session</button>
    <button data-cta-id="export-plan" data-action="export">Export Plan</button>
  </div>
</div>`;

async function createPlan() {
  const { data, error } = await supabase.functions.invoke("save-record", {
    body: {
      entity: "PlanBlueprint",
      values: {
        title: "Export Flow Probe",
        status: "draft",
        ai_score: 45,
        ai_status_report: "Ready for export + guard validation",
        current_mockup_html: SAMPLE_HTML,
        has_mockups: true,
        features: ["CTA coverage", "Session resume"],
      },
    },
    headers: AGENT_HEADERS,
  });

  if (error || !data?.id) {
    throw new Error(`Failed to create export probe plan: ${error?.message ?? data}`);
  }

  return data.id as string;
}

async function enqueueJob(jobType: string, payload: Record<string, unknown>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...AGENT_HEADERS,
  };

  const response = await fetch(ENQUEUE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobType, payload }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Job ${jobType} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchPlan(planId: string) {
  const { data, error } = await adminClient.functions.invoke("get-record", {
    body: { entity: "PlanBlueprint", id: planId },
  });

  if (error || !data) {
    throw new Error(`Failed to fetch plan ${planId}: ${error?.message ?? "unknown error"}`);
  }

  return data as Record<string, any>;
}

async function persistPlan(planId: string, planData: Record<string, any>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...AGENT_HEADERS,
  };

  const response = await fetch(SAVE_PLAN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: planId, data: planData }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to persist plan ${planId}: (${response.status}) ${text}`);
  }
}

async function main() {
  console.log("📦 Starting export + guard regression…");
  const planId = await createPlan();
  console.log(`📝 Created plan ${planId}`);

  const compileResult = await enqueueJob("compile_mockups", {
    planBlueprintId: planId,
    ai_request: "Compile the latest mockup for export verification.",
  });

  const compilePayload = compileResult?.result;
  if (!compilePayload?.success) {
    throw new Error(`compile_mockups reported failure: ${JSON.stringify(compilePayload)}`);
  }
  if (!Array.isArray(compilePayload.files_generated) || compilePayload.files_generated.length === 0) {
    throw new Error("compile_mockups did not return generated files");
  }
  console.log("✅ compile_mockups succeeded with files:", compilePayload.files_generated.join(", "));

  const guardResult = await enqueueJob("guard_plan", {
    planBlueprintId: planId,
    ai_request: "Run guard rails after mockup compilation.",
  });

  const guardPayload = guardResult?.result;
  const guardSummary =
    guardPayload?.summary ||
    guardPayload?.raw ||
    guardPayload?.findings ||
    JSON.stringify(guardPayload);
  if (typeof guardSummary !== "string" || guardSummary.length === 0) {
    throw new Error("guard_plan did not return a readable summary");
  }
  console.log("🛡️ guard_plan summary snippet:", guardSummary.slice(0, 200));

  const plan = await fetchPlan(planId);
  plan.last_guard_result = guardSummary;
  plan.ai_status_report = `Guard check: ${guardSummary.slice(0, 180)}`;
  plan.updated_at = new Date().toISOString();
  console.log("📝 Persisting plan keys:", Object.keys(plan));
  await persistPlan(planId, plan);

  let updatedPlan: Record<string, any> | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await fetchPlan(planId);
    if (typeof snapshot.last_guard_result === "string" && snapshot.last_guard_result.length > 0) {
      updatedPlan = snapshot;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!updatedPlan || (updatedPlan.last_guard_result || "").slice(0, 50) !== guardSummary.slice(0, 50)) {
    throw new Error("Plan did not retain guard summary after persistence");
  }
  console.log("📗 Guard summary persisted to plan record.");

  console.log("🎉 Export + guard regression passed.");
}

main().catch((err) => {
  console.error("💥 export flow regression failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});


