import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Per NO-FALLBACK POLICY: Fail if required env vars are missing
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error("❌ VITE_SUPABASE_URL or SUPABASE_URL is REQUIRED");
  process.exit(1);
}

const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) {
  console.error("❌ VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is REQUIRED");
  process.exit(1);
}

const AGENT_TOKEN = process.env.AGENT_TOKEN;
if (!AGENT_TOKEN) {
  console.error("❌ AGENT_TOKEN is REQUIRED");
  process.exit(1);
}

const ORGANIZATION_ID = process.env.ORGANIZATION_ID;
if (!ORGANIZATION_ID) {
  console.error("❌ ORGANIZATION_ID is REQUIRED");
  process.exit(1);
}
if (!AGENT_TOKEN || !ORGANIZATION_ID) {
  console.error("Missing AGENT_TOKEN or ORGANIZATION_ID for Edge access.");
  process.exit(1);
}

const AGENT_HEADERS = {
  "X-Agent-Token": AGENT_TOKEN,
  "X-Organization-Id": ORGANIZATION_ID,
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ENQUEUE_URL = `${SUPABASE_URL}/functions/v1/enqueue-job`;

async function main() {
  console.log("🛡️ Starting guard_plan regression…");

  const { data: saveData, error: saveError } = await supabase.functions.invoke(
    "save-record",
    {
      body: {
        entity: "PlanBlueprint",
        values: {
          title: "Guard Plan Probe",
          status: "draft",
          ai_status_report: "Awaiting guard run",
        },
      },
      headers: AGENT_HEADERS,
    }
  );

  if (saveError || !saveData?.id) {
    console.error("❌ Failed to create plan:", saveError || saveData);
    process.exit(1);
  }

  const planId = saveData.id as string;
  console.log(`📝 Created plan: ${planId}`);

  const payload = {
    planBlueprintId: planId,
    ai_request:
      "Please check this plan for compliance issues: ensure CTA coverage and no missing guard rails.",
  };

  const response = await fetch(ENQUEUE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...AGENT_HEADERS,
    },
    body: JSON.stringify({
      jobType: "guard_plan",
      payload,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ guard_plan API error (${response.status}): ${text}`);
    process.exit(1);
  }

  const result = await response.json();
  const guardResult = result?.result;

  if (!guardResult) {
    console.error("❌ guard_plan returned empty result:", result);
    process.exit(1);
  }

  const summary =
    guardResult.summary ||
    guardResult.raw ||
    guardResult.findings ||
    JSON.stringify(guardResult);

  if (!summary || typeof summary !== "string") {
    console.error("❌ guard_plan did not return readable output:", guardResult);
    process.exit(1);
  }

  console.log("✅ guard_plan result snippet:");
  console.log(summary.slice(0, 500));
}

main().catch((err) => {
  console.error("💥 guard_plan regression crashed:", err);
  process.exit(1);
});

