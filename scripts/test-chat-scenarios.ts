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

if (false) { // Removed check - already validated above
  console.error("Missing AGENT_TOKEN or ORGANIZATION_ID. These env vars are required for Edge Function access.");
  process.exit(1);
}

const AGENT_HEADERS = {
  "X-Agent-Token": AGENT_TOKEN,
  "X-Organization-Id": ORGANIZATION_ID,
};

const ENQUEUE_URL = `${SUPABASE_URL}/functions/v1/enqueue-job`;

type JobPayload = {
  summary: string;
  suggested_actions?: string;
  updated_plan_fields?: {
    ai_score?: number;
    ai_next_step?: string;
    ai_status_report?: string;
    status?: string;
  };
};

const RUN_HTML_ONLY = process.env.CHAT_SCENARIOS_HTML_ONLY === "true";

async function main() {
  console.log("🤖 Starting Robust User Persona Test Suite…\n");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Create plan via save-record to get canonical ID
  const { data: saveData, error: saveError } = await supabase.functions.invoke("save-record", {
    body: {
      entity: "PlanBlueprint",
      values: {
        title: "Automated Scenario Plan",
        status: "draft",
      },
    },
    headers: AGENT_HEADERS,
  });

  if (saveError || !saveData?.id) {
    console.error("❌ Failed to create plan:", saveError || saveData);
    process.exit(1);
  }

  const planId = saveData.id as string;
  console.log(`📝 Created plan: ${planId}`);

  // Helper to send chat message through enqueue-job (refine_plan)
  async function chat(message: string, validator?: (payload: JobPayload) => void) {
    console.log(`\n👤 User: "${message}"`);
    process.stdout.write("   AI is thinking…");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...AGENT_HEADERS,
    };

    const response = await fetch(ENQUEUE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jobType: "refine_plan",
        payload: {
          planBlueprintId: planId,
          ai_request: message,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`\n❌ API Error (${response.status}): ${text}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log(`\n🧪 Raw result: ${JSON.stringify(result, null, 2)}`);
    const jobResult = result?.result as JobPayload | undefined;
    const aiSummary = jobResult?.summary;
    if (!aiSummary) {
      console.error("\n⚠️ No summary returned by job:", result);
      process.exit(1);
    }

    console.log(`\n🤖 AI: "${aiSummary.split("\n")[0]}..."`);
    if (validator) {
      try {
        validator(jobResult);
      } catch (err) {
        console.error("   ❌ Validation failed:", err instanceof Error ? err.message : err);
        console.error("   Full AI response:", aiSummary);
        process.exit(1);
      }
    }

    console.log("   ✅ Validation passed");
  }

  // Scenario steps
  await chat("yo", (payload) => {
    if (!payload.summary?.length) {
      throw new Error("Expected summary text from assistant");
    }
    if (payload.updated_plan_fields?.status !== "draft") {
      throw new Error('Expected plan status to remain "draft" on greeting');
    }
  });

  await chat("a simple calculator", (payload) => {
    const nextStep = payload.updated_plan_fields?.ai_next_step || "";
    if (!nextStep.includes("?")) {
      throw new Error("Expected ai_next_step to ask a clarifying question");
    }
  });

  await chat("yes build it", (payload) => {
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    const askedForDesign = nextStep.includes("design") || nextStep.includes("vibe");
    const startedMockup = payload.mockup_generated === true;
    const mentionsMock = nextStep.includes("mock");
    const clarifiesFeatures =
      nextStep.includes("feature") ||
      nextStep.includes("function") ||
      nextStep.includes("operation") ||
      nextStep.includes("addition") ||
      nextStep.includes("calculator");
    if (!askedForDesign && !startedMockup && !mentionsMock && !clarifiesFeatures) {
      throw new Error("Expected assistant to either gather design/feature details or start mockup");
    }
  });

  await chat("make buttons bigger", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    const mentionsMock = nextStep.includes("mock") || summary.includes("mock");
    const asksVibe = nextStep.includes("look") || nextStep.includes("vibe");
    const mentionsButtons = summary.includes("button") || nextStep.includes("button");
    if (!mentionsMock && !asksVibe && !mentionsButtons) {
      throw new Error('Expected assistant to acknowledge button update, design follow-up, or mockup');
    }
  });

  await chat("change the html so the header matches ENI blue (#0082c6)", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    if (!summary.includes("html") && !summary.includes("header") && !nextStep.includes("header")) {
      throw new Error("Expected assistant to acknowledge header/html change");
    }
  });

  await chat(
    "make sure the menu shows Welcome, Intake, Lesson, Info, and Simulation pages",
    (payload) => {
      const summary = payload.summary?.toLowerCase() || "";
      const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
      const mentionsMenu =
        summary.includes("menu") ||
        summary.includes("page") ||
        nextStep.includes("menu") ||
        nextStep.includes("page");
      if (!mentionsMenu) {
        throw new Error("Expected assistant to reference menu/page coverage");
      }
    }
  );

  if (!RUN_HTML_ONLY) {
    await chat("can you revert to the previous version before the big buttons?", (payload) => {
      const summary = payload.summary?.toLowerCase() || "";
      const status = payload.updated_plan_fields?.ai_status_report?.toLowerCase() || "";
      if (!summary.includes("revert") && !status.includes("revert")) {
        throw new Error("Expected assistant to acknowledge a revert request");
      }
    });
  }

  if (!RUN_HTML_ONLY) {
    await chat("suggest improvements before we ship", (payload) => {
      const summary = payload.summary?.toLowerCase() || "";
      const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
      const mentionsImprovements =
        summary.includes("improvement") ||
        summary.includes("suggestion") ||
        summary.includes("suggest") ||
        summary.includes("fine-tune") ||
        summary.includes("tweak") ||
        summary.includes("how about") ||
        summary.includes("maybe") ||
        summary.includes("user experience") ||
        summary.includes("refine") ||
        nextStep.includes("improvement") ||
        nextStep.includes("suggestion") ||
        nextStep.includes("suggest") ||
        nextStep.includes("fine-tune") ||
        nextStep.includes("tweak") ||
        nextStep.includes("refine");
      if (!mentionsImprovements) {
        throw new Error("Expected assistant to suggest improvements before shipping");
      }
    });
  }

  const referenceHtml = `<section class="eni-panel">
  <header>ENI Reference</header>
  <p>Use the medical gradients and pill buttons from this block.</p>
</section>`;
const ACTIE_DOC_SNIPPET = `# ACTIE Klinisch Redeneren - Technische Documentatie

## Pixel-Perfect HTML Mockups
Het project bevat pixel-perfecte HTML mockups van alle pagina's in de \`/mockups\` directory.

<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ACTIE Klinisch Redeneren - Welkom</title>
  <style>
    body { background: hsl(0, 0%, 98%); font-family: system-ui; }
    .card { max-width: 42rem; margin: 2rem auto; padding: 2rem; background: white; border-radius: 12px; }
    .title { color: #0082c6; }
  </style>
</head>
<body>
  <div class="card">
    <h1 class="title">ACTIE Klinisch Redeneren</h1>
    <p>Welkom bij de simulatie.</p>
  </div>
</body>
</html>
`;

const PARTIAL_HTML_SNIPPET = `Here is a quick header layout:
<section class="hero">
  <h1>Adaptive LMS</h1>
  <p>Personalized learning paths.</p>
</section>
But I didn't include the rest of the pages yet.`;
  await chat(
    `replicate the style from this html snippet:\n${referenceHtml}`,
    (payload) => {
      const summary = payload.summary?.toLowerCase() || "";
      const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
      if (!summary.includes("style") && !summary.includes("html") && !nextStep.includes("style")) {
        throw new Error("Expected assistant to acknowledge style replication");
      }
    }
  );

  await chat("Give me a progress update (%) and refresh the plan markdown summary.", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const aiScore = payload.updated_plan_fields?.ai_score;
    if (typeof aiScore !== "number") {
      throw new Error("Expected ai_score to be present for progress update");
    }
    const hasMarkdown =
      summary.includes("plan updated") ||
      summary.includes("title:") ||
      summary.includes("app name");
    if (!hasMarkdown) {
      throw new Error("Expected markdown-style plan recap in summary");
    }
  });

  if (RUN_HTML_ONLY) {
    console.log("\nℹ️ CHAT_SCENARIOS_HTML_ONLY=true – skipping remaining persona scenarios.");
    return;
  }

  await chat("I'm back after a break—remind me what we built and what step is next.", (payload) => {
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    if (!nextStep.includes("next") && !nextStep.includes("continue")) {
      throw new Error("Expected ai_next_step to describe the upcoming step when resuming");
    }
  });

  await chat("Trigger the export CTA so I can download the Golden Plan artifacts.", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    const mentionsExport =
      summary.includes("export") ||
      summary.includes("download") ||
      summary.includes("cta") ||
      nextStep.includes("export") ||
      nextStep.includes("download");
    if (!mentionsExport) {
      throw new Error("Expected assistant to mention export/download status");
    }
  });

  await chat("Run the guard plan checks and tell me if everything passes.", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    const mentionsGuard =
      summary.includes("guard") ||
      summary.includes("cta") ||
      summary.includes("verify") ||
      summary.includes("check");
    const nextMentionsGuard =
      nextStep.includes("guard") ||
      nextStep.includes("cta") ||
      nextStep.includes("check");
    if (!mentionsGuard && !nextMentionsGuard) {
      throw new Error("Expected assistant to report guard plan status");
    }
  });

  await chat("this looks like shit", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const hasEmpathy =
      summary.includes("sorry") ||
      summary.includes("fix") ||
      summary.includes("improve") ||
      summary.includes("polish") ||
      summary.includes("tweak") ||
      summary.includes("no worries");
    if (!hasEmpathy) {
      throw new Error("Expected assistant to respond constructively to negative feedback");
    }
  });

  await chat("this is frustrating", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    if (
      !summary.includes("understand") &&
      !summary.includes("sorry") &&
      !summary.includes("got you") &&
      !summary.includes("i get it")
    ) {
      throw new Error("Expected assistant to acknowledge user frustration");
    }
  });

  await chat("how long will this take?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const mentionsTiming =
      summary.includes("minutes") ||
      summary.includes("step") ||
      summary.includes("once") ||
      summary.includes("after");
    if (!mentionsTiming) {
      throw new Error("Expected assistant to describe timeline or remaining steps");
    }
  });

  await chat("will this mock be fully functional?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const mentionsLimit =
      summary.includes("not") ||
      summary.includes("won't") ||
      summary.includes("placeholder") ||
      summary.includes("blocked");
    if (!summary.includes("mock") || !mentionsLimit) {
      throw new Error("Expected assistant to clarify limitations of the mock");
    }
  });

  await chat("Can i run this app on mobile?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    if (!summary.includes("mobile") && !summary.includes("responsive") && !summary.includes("browser")) {
      throw new Error("Expected assistant to explain mobile expectations");
    }
  });

  await chat("What is the golden plan?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const mentionsDefinition =
      summary.includes("checklist") ||
      summary.includes("blueprint") ||
      summary.includes("roadmap") ||
      summary.includes("checkpoint");
    if (!summary.includes("golden plan") || !mentionsDefinition) {
      throw new Error("Expected assistant to define the Golden Plan");
    }
  });

  await chat("How do i give instructions to Cursor when you are done?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    if (!summary.includes("cursor") || (!summary.includes("hand") && !summary.includes("handoff") && !summary.includes("instruction"))) {
      throw new Error("Expected assistant to explain how to brief Cursor");
    }
  });

  await chat("When can we start building?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const mentionsReadiness =
      summary.includes("after") ||
      summary.includes("once") ||
      summary.includes("finish");
    const mentionsGate =
      summary.includes("cta") ||
      summary.includes("test") ||
      summary.includes("mockup") ||
      summary.includes("verify");
    if (!mentionsReadiness || !mentionsGate) {
      throw new Error("Expected assistant to tie build start to CTA/tests readiness");
    }
  });

  await chat("What do you think of the plan so far?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    if (!summary.includes("%") && !summary.includes("percent") && !summary.includes("score")) {
      throw new Error("Expected assistant to report progress/score when asked for opinion");
    }
  });

  await chat("Can I build this in Shopify?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    if (!summary.includes("shopify") || (!summary.includes("not") && !summary.includes("outside") && !summary.includes("integration"))) {
      throw new Error("Expected assistant to clarify Shopify integration limitations");
    }
  });

  await chat("Can you create a business plan for me?", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    if (!summary.includes("business plan") || (!summary.includes("can't") && !summary.includes("not"))) {
      throw new Error("Expected assistant to outline scope when business plan is requested");
    }
  });

  await chat(ACTIE_DOC_SNIPPET, (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const mentionsHtml = summary.includes("html");
    const mentionsOwnership = summary.includes("baseline") || summary.includes("your html") || summary.includes("reference html");
    if (!mentionsHtml || !mentionsOwnership) {
      throw new Error("Expected assistant to acknowledge adopting the provided HTML baseline");
    }
  });

  await chat(PARTIAL_HTML_SNIPPET, (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    if (
      !summary.includes("missing") &&
      !summary.includes("more detail") &&
      !summary.includes("which section") &&
      !summary.includes("need the rest")
    ) {
      throw new Error("Expected assistant to ask for missing sections before building");
    }
  });

  await chat("I know it's only 30% done but export it now anyway.", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    const blocksExport =
      summary.includes("finish") ||
      summary.includes("complete") ||
      summary.includes("cta") ||
      summary.includes("need") ||
      nextStep.includes("finish") ||
      nextStep.includes("complete");
    if (!blocksExport) {
      throw new Error("Expected assistant to explain why export must wait");
    }
  });

  await chat("The start simulation CTA still feels dead even if you say it's wired.", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const mentionsCta = summary.includes("cta") || summary.includes("button");
    const mentionsTest = summary.includes("test") || summary.includes("validate") || summary.includes("mock");
    if (!mentionsCta || !mentionsTest) {
      throw new Error("Expected assistant to reference CTA validation when user disagrees");
    }
  });

  await chat("just make it better", (payload) => {
    const nextStep = payload.updated_plan_fields?.ai_next_step || "";
    if (!nextStep.includes("?") && !nextStep.toLowerCase().includes("tell me")) {
      throw new Error("Expected assistant to ask for more info when instructions are vague");
    }
  });

  await chat("Just follow your own recommendations and finish 100% yourself.", (payload) => {
    const summary = payload.summary?.toLowerCase() || "";
    const nextStep = payload.updated_plan_fields?.ai_next_step?.toLowerCase() || "";
    const mentionsPercent = summary.includes("%") || summary.includes("100");
    const mentionsProcess =
      nextStep.includes("verify") ||
      nextStep.includes("guard") ||
      nextStep.includes("cta") ||
      summary.includes("guard") ||
      summary.includes("cta");
    if (!mentionsPercent || !mentionsProcess) {
      throw new Error("Expected assistant to talk about completion percentage and remaining process");
    }
  });

  console.log("\n🎉 ALL CHAT SCENARIOS PASSED");
}

main().catch((err) => {
  console.error("💥 Test suite crashed:", err);
  process.exit(1);
});

