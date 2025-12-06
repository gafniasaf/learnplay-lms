import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Per NO-FALLBACK POLICY: Fail if required env vars are missing
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error("❌ VITE_SUPABASE_URL is REQUIRED");
  process.exit(1);
}

const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) {
  console.error("❌ VITE_SUPABASE_ANON_KEY is REQUIRED");
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

const AGENT_HEADERS = {
  "X-Agent-Token": AGENT_TOKEN,
  "X-Organization-Id": ORGANIZATION_ID,
};

const ENQUEUE_URL = `${SUPABASE_URL}/functions/v1/enqueue-job`;
const DOC_SNIPPET =
  "# ACTIE Klinisch Redeneren\n\n" +
  "## Pixel-Perfect HTML Mockups\n\n" +
  "<!DOCTYPE html><html><head><style>body{background:black;color:white;}</style></head><body><header>Mock</header></body></html>";

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: saveData, error: saveError } = await supabase.functions.invoke(
    "save-record",
    {
      body: {
        entity: "PlanBlueprint",
        values: { title: "Doc Import Test", status: "draft" },
      },
      headers: AGENT_HEADERS,
    }
  );

  if (saveError || !saveData?.id) {
    console.error("Failed to create plan", saveError || saveData);
    process.exit(1);
  }

  const planId = saveData.id as string;
  console.log("Plan ID:", planId);

  const response = await fetch(ENQUEUE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...AGENT_HEADERS,
    },
    body: JSON.stringify({
      jobType: "refine_plan",
      payload: {
        planBlueprintId: planId,
        ai_request: DOC_SNIPPET,
      },
    }),
  });

  const jobResult = await response.json();
  console.log("Job Result:", JSON.stringify(jobResult, null, 2));

  const { data: planData, error: planError } = await supabase.functions.invoke(
    "get-record",
    {
      body: {
        entity: "PlanBlueprint",
        id: planId,
      },
      headers: AGENT_HEADERS,
    }
  );

  if (planError) {
    console.error("Failed fetching plan:", planError.message);
    process.exit(1);
  }

  console.log("Plan Fields:", {
    title: planData?.title,
    hasReferenceHtml: Boolean(planData?.reference_html),
    referenceLength: planData?.reference_html?.length || 0,
    keys: Object.keys(planData || {}),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

