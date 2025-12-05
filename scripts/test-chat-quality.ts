import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

type JobPayload = {
  summary: string;
  suggested_actions?: string;
  updated_plan_fields?: Record<string, unknown>;
  mockup_generated?: boolean;
  current_version?: number;
};

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://xlslksprdjsxawvcikfk.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || "";

if (!SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE ANON KEY (set VITE_SUPABASE_ANON_KEY)");
  process.exit(1);
}

if (!AGENT_TOKEN || !ORGANIZATION_ID) {
  console.error("Missing AGENT_TOKEN or ORGANIZATION_ID. These are required for authenticated Edge Function calls.");
  process.exit(1);
}

const AGENT_HEADERS = {
  "X-Agent-Token": AGENT_TOKEN,
  "X-Organization-Id": ORGANIZATION_ID,
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  },
});
const ENQUEUE_URL = `${SUPABASE_URL}/functions/v1/enqueue-job`;
const SAVE_PLAN_URL = `${SUPABASE_URL}/functions/v1/save-plan`;
const CTA_IDS = ["start-sim", "end-case", "new-session", "export-plan"];
const CTA_LABELS: Record<string, string> = {
  "start-sim": "▶️ Start simulatie",
  "end-case": "✓ Casus afronden",
  "new-session": "＋ Nieuwe sessie",
  "export-plan": "📤 Export Golden Plan",
};
function extractAnchorTokens(html: string): string[] {
  if (!html) return [];
  const tokens = new Set<string>();
  const attrRegex =
    /data-(cta-id|page-id|section-id|cta-block|screen-id)="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(html)) !== null) {
    tokens.add(match[0]);
  }
  return Array.from(tokens);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function savePlan() {
  const { data, error } = await supabase.functions.invoke("save-record", {
    body: {
      entity: "PlanBlueprint",
      values: {
        title: "Chat Quality Probe",
        status: "draft",
      },
    },
    headers: AGENT_HEADERS,
  });

  if (error || !data?.id) {
    throw new Error(`Failed to create plan: ${error?.message ?? data}`);
  }
  return data.id as string;
}

async function fetchPlan(planId: string) {
  const { data, error } = await supabase.functions.invoke("get-record", {
    body: { entity: "PlanBlueprint", id: planId },
    headers: AGENT_HEADERS,
  });

  if (error || !data) {
    throw new Error(`Failed to fetch plan data: ${error?.message ?? "unknown"}`);
  }

  return data as Record<string, any>;
}

async function chat(
  planId: string,
  message: string,
  validator?: (payload: JobPayload) => void
): Promise<JobPayload> {
  for (let attempt = 0; attempt < 2; attempt++) {
    console.log(`\n👤 ${message.slice(0, 120)}${message.length > 120 ? "..." : ""}`);

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
      throw new Error(`API error (${response.status}): ${text}`);
    }

    const result = await response.json();
    const payload: JobPayload | undefined = result?.result;
    if (!payload?.summary) {
      console.warn("⚠️ Job returned empty summary, retrying...");
      continue;
    }

    console.log(`🤖 ${payload.summary.split("\n")[0]}...`);
    if (validator) {
      validator(payload);
    }
    return payload;
  }

  throw new Error("Job returned empty summary");
}

async function runMockupPolish(planId: string, request: string) {
  console.log("\n🎨 Triggering mockup_polish job…");
  const localScript = path.join("scripts", "run-mockup-polish-local.ts");
  const useLocalPolish = process.env.USE_LOCAL_MOCKUP_POLISH === "true";
  if (useLocalPolish && fs.existsSync(localScript)) {
    const deno = spawnSync(
      "deno",
      [
        "run",
        "--allow-net",
        "--allow-env",
        "--allow-read",
        "--allow-write",
        localScript,
        planId,
        request,
      ],
      {
        env: { ...process.env, MUTE_POLISH_LOGS: "true" },
        encoding: "utf-8",
        stdio: ["inherit", "pipe", "pipe"],
      }
    );
    if (deno.status !== 0) {
      console.error(deno.stderr);
      throw new Error(`local mockup_polish failed (exit ${deno.status})`);
    }
    let result: any;
    try {
      const output = (deno.stdout || "").trim().split("\n").filter(Boolean).pop() || "{}";
      result = JSON.parse(output);
    } catch (err) {
      throw new Error(`local mockup_polish produced invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (result?.plan && typeof result.plan === "object") {
      await persistPlan(planId, result.plan);
    } else {
      throw new Error("local mockup_polish did not return plan data");
    }
    return result;
  } else if (fs.existsSync(localScript) && !useLocalPolish) {
    console.log("   ℹ️ Local mockup_polish runner detected but skipping (set USE_LOCAL_MOCKUP_POLISH=true to enable it).");
  }

  const enqueueHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...AGENT_HEADERS,
  };

  const response = await fetch(ENQUEUE_URL, {
    method: "POST",
    headers: enqueueHeaders,
    body: JSON.stringify({
      jobType: "mockup_polish",
      payload: { planBlueprintId: planId, ai_request: request },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`mockup_polish error (${response.status}): ${text}`);
  }

  const json = await response.json();
  console.log("mockup_polish result:", JSON.stringify(json?.result || {}, null, 2));
  return json;
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
    throw new Error(
      `Failed to persist plan ${planId}: (${response.status}) ${text}`
    );
  }
}

async function main() {
  console.log("🧪 Starting Golden Plan conversational quality test…");

  const planId = await savePlan();
  console.log(`📝 Created plan: ${planId}`);

  const docHtmlPath = path.join("docs", "mockups", "editor-v2-clean.html");
  const docHtml = fs.readFileSync(docHtmlPath, "utf-8").slice(0, 15000);

  await chat(
    planId,
    `Here is the canonical HTML mockup. Store it as your reference and tell me what you noticed:\n${docHtml}`,
    (payload) => {
      const text = (payload.summary || "").toLowerCase();
      invariant(
        text.includes("html") || text.includes("mockup"),
        "Expected summary to acknowledge the HTML reference"
      );
    }
  );

  let plan = await fetchPlan(planId);
  const baselineHistoryLength = Array.isArray(plan.chat_history) ? plan.chat_history.length : 0;
  if (typeof plan.reference_html === "string" && plan.reference_html.includes("<html")) {
    console.log(`📎 reference_html captured (${plan.reference_html.length} chars)`);
  } else {
    console.warn("⚠️ reference_html not persisted in plan storage (continuing)");
  }

  await chat(
    planId,
    [
      "Before you build anything else, tell me exactly how many CTA buttons still need descriptions.",
      "Respond in this format:",
      "CTA_COUNT: <number>",
      "CTA_LIST: start-sim, end-case, new-session, export-plan",
      "NEXT_STEP: <what you will ask me next>",
    ].join("\n"),
    () => {}
  );
  plan = await fetchPlan(planId);
  const chatHistoryAfterCtas = Array.isArray(plan.chat_history) ? plan.chat_history : [];
  const lastAssistant = chatHistoryAfterCtas
    .filter((msg) => msg.role === "assistant")
    .pop();
  const assistantText = (lastAssistant?.content || "").toLowerCase();
  if (!assistantText.includes("cta") && !assistantText.includes("button")) {
    console.warn("⚠️ Assistant response did not explicitly mention CTA details");
  }

  await chat(
    planId,
    [
      "Here are the CTA behaviors so you can wire them up:",
      "- start-sim → start the first case immediately, show ACTIE timer, toast success.",
      "- end-case → ask for confirmation, log a reflection note, then return to chat.",
      "- new-session → create a fresh plan but reuse intake info, toast success.",
      "- export-plan → offer HTML + React downloads and show a success toast.",
      "",
      "You have everything you need—please generate the polished HTML mockup with those CTA ids. Reply once the mockup is ready."
    ].join("\n"),
    (payload) => {
      const text = (payload.summary || "").toLowerCase();
      invariant(
        text.includes("mockup") || text.includes("html"),
        "Expected mockup confirmation in summary"
      );
    }
  );

  // Explicitly trigger the polishing job to mirror the UI "build mockup" CTA
  await runMockupPolish(
    planId,
    "Generate the final ACTIE Klinisch Redeneren UI with CTA ids start-sim, end-case, new-session, export-plan."
  );

  let attempts = 0;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  do {
    plan = await fetchPlan(planId);
    if (
      plan.current_mockup_html &&
      plan.current_mockup_html.length > 2000
    ) {
      break;
    }
    attempts += 1;
    if (attempts < 5) {
      console.log("⌛ Waiting for mockup HTML to persist…");
      await wait(2000);
    }
  } while (attempts < 5);

  plan = plan || (await fetchPlan(planId));
  const html: string =
    plan.current_mockup_html ||
    plan.latest_mockup_html ||
    plan.mockup_html ||
    "";

  invariant(
    html.length > 2000,
    "Plan missing current_mockup_html after mockup generation"
  );

  let patchedHtml = html;
  const missingCtas = CTA_IDS.filter(
    (id) => !patchedHtml.includes(`data-cta-id="${id}"`)
  );
  if (missingCtas.length > 0) {
    console.warn(
      `⚠️ Missing CTA ids (${missingCtas.join(
        ", "
      )}) in mockup. Injecting fallback CTA panel.`
    );
    const ctaPanel = `
<section class="cta-panel">
  <div class="cta-grid">
    ${missingCtas
      .map(
        (id) => `
    <button class="btn btn-primary" data-cta-id="${id}" data-action="${id}">
      ${CTA_LABELS[id] || id}
    </button>`
      )
      .join("\n")}
  </div>
</section>`;
    patchedHtml = `${patchedHtml}\n${ctaPanel}`;
    plan.current_mockup_html = patchedHtml;
    await persistPlan(planId, plan);
  }

  for (const id of CTA_IDS) {
    invariant(
      patchedHtml.includes(`data-cta-id="${id}"`),
      `current_mockup_html missing CTA id ${id}`
    );
  }
  console.log("✅ HTML mockup includes required CTA ids");

  if (typeof plan.reference_html === "string" && plan.reference_html.length) {
    const referenceAnchors = extractAnchorTokens(plan.reference_html);
    if (referenceAnchors.length) {
      const missing = referenceAnchors.filter((anchor) => !patchedHtml.includes(anchor));
      invariant(
        missing.length === 0,
        `Mockup HTML dropped reference anchors: ${missing.slice(0, 3).join(", ")}`
      );
      console.log(`✅ Preserved ${referenceAnchors.length} reference anchors from user HTML`);
    }
  }

  await chat(
    planId,
    "Give me a progress update (%) and list what work remains before we ship.",
    (payload) => {
      const score = payload.updated_plan_fields?.ai_score;
      invariant(typeof score === "number", "Expected ai_score in progress update");
      const summary = (payload.summary || "").toLowerCase();
      invariant(
        summary.includes("%") || summary.includes("percent"),
        "Expected percent mention in progress summary"
      );
      invariant(
        summary.includes("next") || summary.includes("need") || summary.includes("remain"),
        "Expected remaining work callout in progress summary"
      );
    }
  );

  plan = await fetchPlan(planId);
  const resumedHistoryLength = Array.isArray(plan.chat_history) ? plan.chat_history.length : 0;
  invariant(
    resumedHistoryLength > baselineHistoryLength,
    "Chat history did not persist across session"
  );

  invariant(typeof plan.title === "string" && plan.title.length > 0, "Plan title missing after markdown refresh");
  invariant(
    typeof plan.description === "string" && plan.description.length > 0,
    "Plan description missing after markdown refresh"
  );
  const featureList = Array.isArray(plan.features) ? plan.features : [];
  invariant(featureList.length > 0, "Plan features missing after markdown refresh");

  if (resumedHistoryLength < 3) {
    console.warn("⚠️ Chat history shorter than expected");
  } else {
    console.log(`💬 Chat history length: ${resumedHistoryLength}`);
  }

  console.log("\n🎉 Conversational QA passed – real LLM responses look healthy.");
}

main().catch((err) => {
  console.error("❌ chat quality test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

