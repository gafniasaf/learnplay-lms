// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

type Mode =
  | "genesis"
  | "evolution"
  | "decode"
  | "consult"
  | "mockup"
  | "mockup-lane"
  | "mockup-critique"
  | "discovery"
  | "analyze-document"
  | "health-check";

const MOCKUP_STANDARD = `
IGNITE MOCKUP SPEC (ALWAYS FOLLOW THIS ORDER)
1. Hero: headline, subcopy, dual CTA (primary + ghost).
2. Pillars: 3-4 feature cards or timeline tied to plan steps.
3. Credibility strip: metrics, guardrails, or proof badges.
4. CTA footer: remind the primary entity/action ("Launch Campaign", "Approve Brief").

VISUAL RULES
- Canvas: slate-950 background, cards with border-slate-800, 32px gutters minimum.
- Typo: bold display font for hero, mono labels for metadata, body width <= 600px.
- Palette: emerald→cyan primary gradient, optional amber/purple accent for warnings.
- Copy: use real manifest nouns/verbs from the prompt, never lorem ipsum.
- Interactions: buttons >= 56px height, hover scale <= 1.01, include iconography where helpful.
- Interlinking: use 'href="[lane-id]"' for internal navigation.
`;

const OPENAI_MODEL =
  Deno.env.get("ARCHITECT_LLM_MODEL") ??
  Deno.env.get("OPENAI_MODEL") ??
  "gpt-4o";

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|timeout|aborted/i.test(message);
}

interface FetchRetryOptions {
  attempts?: number;
  timeoutMs?: number;
  requestLabel?: string;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchRetryOptions = {},
) {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 45000;
  const label = options.requestLabel ?? "fetch";
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);

      if (
        !response.ok &&
        RETRYABLE_STATUS_CODES.has(response.status) &&
        attempt < attempts
      ) {
        console.warn(
          `[architect-advisor][${label}] HTTP ${response.status} on attempt ${attempt}. Retrying...`,
        );
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(250 * attempt);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= attempts || !isRetryableError(error)) {
        throw error;
      }
      console.warn(
        `[architect-advisor][${label}] ${error instanceof Error ? error.message : error} on attempt ${attempt}. Retrying...`,
      );
      await sleep(250 * attempt);
    }
  }

  throw lastError ?? new Error("fetchWithRetry failed");
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AdvisorRequestBody {
  prompt?: string;
  messages?: ChatMessage[];
  mode?: Mode;
  manifest?: unknown;
  context?: unknown; // Context for consult mode (the current plan)
  laneId?: string;
  pageSpec?: string;
  validationHints?: string[];
  ownerId?: string;
  sessionId?: string;
  sections?: Array<{ heading: string; preview: string }>;
  lanes?: Array<{
    id?: string;
    title?: string;
    instructions?: string;
    validationHints?: string[];
    html?: string;
    source?: string;
    diagnostics?: string[];
  }>;
  otherLanes?: Array<{ id: string; title: string }>; // Topology awareness
}

interface GuardrailOptions {
  sourceText?: string;
}

interface MockupLaneValidation {
  passed: boolean;
  missing: string[];
}

async function logConsultInteraction(entry: {
  mode: string;
  prompt: ChatMessage[];
  response: string;
  context?: unknown;
  projectName?: string;
  ownerId?: string;
  sessionId?: string;
}) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;

  try {
    await fetch(`${url}/rest/v1/consult_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        mode: entry.mode,
        prompt: entry.prompt,
        response: entry.response,
        context: entry.context,
        metadata: {
          ...(entry.projectName ? { project_name: entry.projectName } : {}),
          ...(entry.ownerId ? { owner_id: entry.ownerId } : {}),
          ...(entry.sessionId ? { session_id: entry.sessionId } : {}),
        },
      }),
    });
  } catch (error) {
    console.warn("[consult_logs] failed to write entry", error);
  }
}

async function logPlanSnapshot(entry: {
  projectName?: string;
  prompt?: string;
  plan?: Record<string, unknown>;
  markdown?: string;
  summary?: string;
  ownerId?: string;
  sessionId?: string;
}) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !serviceKey || !entry.plan) return;

  try {
    await fetch(`${url}/rest/v1/architect_plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        project_name: entry.projectName,
        prompt: entry.prompt,
        plan: entry.plan,
        markdown_plan: entry.markdown,
        summary: entry.summary,
        metadata: {
          ...(entry.ownerId ? { owner_id: entry.ownerId } : {}),
          ...(entry.sessionId ? { session_id: entry.sessionId } : {}),
        },
      }),
    });
  } catch (error) {
    console.warn("[architect_plans] failed to log snapshot", error);
  }
}

async function callOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  opts?: { jsonOutput?: boolean },
) {
  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    messages,
  };

  if (opts?.jsonOutput) {
    (body as any).response_format = { type: "json_object" };
  }

  const response = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    {
      attempts: 3,
      timeoutMs: 60000,
      requestLabel: "openai",
    },
  );

  const json = await response.json();

  if (!response.ok) {
    const message = json?.error?.message ?? "OpenAI API error";
    throw new Error(message);
  }

  const content: string = json?.choices?.[0]?.message?.content ?? "";
  return content;
}

const CRITIC_SNIPPET_LEN = 160;

function truncateSnippet(value: string, length = CRITIC_SNIPPET_LEN) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item))
    .filter(Boolean)
    .slice(0, 5);
}

function buildCriticFallback(reason: string) {
  return {
    verdict: "needs_revision",
    missing_screens: [],
    redundant_screens: [],
    journey_issues: [],
    suggestions: [reason],
  };
}

function normalizeCriticPayload(raw: string) {
  try {
    const parsed = JSON.parse(raw ?? "{}");
    const verdict =
      parsed?.verdict === "approved" || parsed?.verdict === "needs_revision"
        ? parsed.verdict
        : "needs_revision";
    return {
      verdict,
      missing_screens: toStringList(parsed?.missing_screens),
      redundant_screens: toStringList(parsed?.redundant_screens),
      journey_issues: toStringList(parsed?.journey_issues),
      suggestions: toStringList(parsed?.suggestions),
    };
  } catch (error) {
    const reason = `[mockup-critique] parse error: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.warn(reason, truncateSnippet(raw || ""));
    return buildCriticFallback(reason);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "architect-advisor");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY secret for architect-advisor" }),
      {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }

  let body: AdvisorRequestBody;
  try {
    body = await req.json() as AdvisorRequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }

  const mode: Mode = body.mode ?? "genesis";
  // Fallback to constructing a single message if "messages" array isn't provided (backward compat)
  const prompt = body.prompt ?? "";
  const messages = body.messages ?? (prompt ? [{ role: "user", content: prompt }] : []);
  const userMessageText = messages
    .filter((msg) => msg.role === "user" && typeof msg.content === "string")
    .map((msg) => msg.content)
    .join("\n");
  const contextText =
    typeof body.context === "string"
      ? body.context
      : body.context
        ? JSON.stringify(body.context)
        : "";
  const sourceTextForGuardrails = [prompt, userMessageText, contextText]
    .filter((chunk) => typeof chunk === "string" && chunk.trim().length > 0)
    .join("\n");

  if (mode === "health-check") {
    return new Response(
      JSON.stringify({ ok: true, timestamp: Date.now() }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }

  if (messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "Missing prompt or messages" }),
      {
        status: 400,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const logPrefix = `[architect-advisor][${requestId}]`;
  console.log(
    `${logPrefix} start mode=${mode} promptChars=${prompt.length} sections=${Array.isArray(body.sections) ? body.sections.length : 0} otherLanes=${Array.isArray(body.otherLanes) ? body.otherLanes.length : 0}`,
  );

  try {
    let systemPrompt = "";
    let jsonOutput = false;
    let fullMessagesForMode: ChatMessage[] | undefined;

    if (mode === "analyze-document") {
      const sections = Array.isArray(body.sections) ? body.sections : [];
      const sectionList = sections
        .map((s: any, idx: number) => `${idx + 1}. "${s.heading}" — ${s.preview.slice(0, 150)}...`)
        .join('\n');

      systemPrompt = `You are a Document Analyzer for the Ignite Zero factory. Your job is to classify sections of a technical document.

### TASK
The user has pasted a document with multiple sections. Some sections are **UI Screens** (pages to build), others are **Documentation** (context/metadata).

### INPUT
${sectionList}

### OUTPUT (JSON)
Return a JSON object with a "sections" array:
{
  "sections": [
    { 
      "heading": "Login Screen", 
      "type": "ui_page", 
      "reason": "Describes a user-facing login form.",
      "validationHints": ["Email Input", "Password Input", "Sign In Button", "Forgot Password Link"]
    },
    { 
      "heading": "System Overview", 
      "type": "documentation", 
      "reason": "High-level architecture explanation, not a screen." 
    }
  ]
}

### CLASSIFICATION RULES (STRICT)
Mark as **ui_page** ONLY if the section:
- Describes a specific user-facing screen, form, dashboard, or interactive view.
- Contains UI element descriptions (buttons, inputs, tables, charts, navigation).
- Uses words like "screen", "page", "interface", "dashboard", "form", "login", "settings", "panel", "view".
- Describes what a user SEES and DOES (not what the system IS).

Mark as **documentation** if the section:
- Explains architecture, tech stack, database schema, API reference, deployment, testing, or system design.
- Is a table of contents, glossary, appendix, or meta-explanation.
- Lists requirements, roles, capabilities, or features WITHOUT describing the UI layout.
- Uses words like "overview", "architecture", "schema", "reference", "deployment", "considerations", "methodology", "requirements", "roles", "capabilities".

### VALIDATION HINTS
For each "ui_page", list 3-5 specific elements or features described in the text that must be present in the mockup.
- If the text says "includes a hero section with a CTA", add "Hero Section", "CTA Button".
- If the text is vague, infer standard elements for that page type (e.g., for a Dashboard: "Stats Grid", "Recent Activity").
- Do NOT use generic terms like "Main Content" unless absolutely necessary. Be specific to the domain.

### CRITICAL EXAMPLES
- "## Welcome Screen" → ui_page (actual screen)
- "## Core Requirements" → documentation (spec list, not a screen)
- "## User Roles" → documentation (role definitions, not a screen)
- "## Inhoudsopgave" (Table of Contents) → documentation
- "## Admin Login" → ui_page (login form)
- "## Database Schema" → documentation (tech spec)
- "## Analytics Dashboard" (describes charts and metrics) → ui_page (actual screen)
- "## System Overview" → documentation (high-level explanation)
- "## Pixel-Perfect HTML Mockups" (explaining that mockups exist) → documentation
- "## 1. welcome-page.html - Welkomstscherm" (describing a specific page) → ui_page

### EDGE CASES
- If a section says "This screen shows revenue charts..." → ui_page (it's describing a screen).
- If a section says "The system uses PostgreSQL..." → documentation (it's describing the system).
- If unsure, bias toward **documentation** to avoid generating useless lanes.

Return ONLY the JSON object. No markdown fences, no explanations.`;
      jsonOutput = true;
    } else if (mode === "discovery") {
      // Discovery mode - Product Manager
      systemPrompt = `You are a Senior Product Manager. Your goal is to gather requirements to build a precise Ignite Zero system.

    ### YOUR GOAL
    Ask clarifying questions to flesh out the user's idea. Focus on:
    1.  **Domain Logic:** What are the core entities? (e.g. "Students", "Invoices").
    2.  **UX Preferences:** Who is the user? What is the main dashboard view?
    3.  **Scale:** Is this high-volume (needs async jobs) or low-volume (simple CRUD)?

    ### INTERACTION STYLE
    *   **Be Curious:** Ask 3-5 high-impact questions.
    *   **Be Concise:** Don't overwhelm the user.
    *   **Do NOT Plan Yet:** Do not generate a manifest or code. Just gather info.
    *   **Signal Readiness:** When you have enough info (usually after 2-3 turns), explicitly ask: "I have enough information. Ready to generate the plan?"`;
      jsonOutput = false;
    } else if (mode === "mockup") {
      systemPrompt = `You are The Mockup Artist for Ignite Zero. Convert the plan summary into a single HTML document that Cursor can follow verbatim.

      ${MOCKUP_STANDARD}

      EXECUTION CHECKLIST
      - Return ONLY raw HTML (no markdown fences) with <html>, <head>, <style>, <body>.
      - Inline all CSS. Use system fonts (Inter, Space Grotesk, monospace labels) and gradients that match the cyberpunk factory vibe.
      - Every CTA/button must reference the real manifest nouns (Campaign, Brief, Cadet, etc.).
      - If the prompt contains "MOCKUP DIRECTIVE" or "BRIEF" content, treat it as canonical art direction (palette, density, tone).
      - Keep copy concise but meaningful; reference strategy steps where relevant (e.g. badges, status pills).
      - Add responsive hints (max-width containers) so the previewer can scale between 375px, 768px, and full desktop without breaking.
      - Never include scripts or external resources.

      Output should feel production-ready: semantic sections, descriptive class names (hero, feature-card, stats-grid), and clear visual hierarchy.`;
      jsonOutput = false;
    } else if (mode === "mockup-lane") {
      const laneId = typeof body.laneId === "string" ? body.laneId : "lane";
      const laneSpec =
        typeof body.pageSpec === "string" && body.pageSpec.trim().length > 0
          ? body.pageSpec
          : prompt;
      const validationHints: string[] = Array.isArray(body.validationHints)
        ? body.validationHints.filter(
          (hint): hint is string => typeof hint === "string" && hint.trim().length > 0,
        )
        : [];
      
      const otherLanes = Array.isArray(body.otherLanes) ? body.otherLanes : [];
      const navLinks = otherLanes.length > 0
        ? otherLanes.map((l) => `<a href="${l.id}" class="nav-link">${l.title}</a>`).join("\n")
        : "<!-- No other lanes available -->";

      systemPrompt = `You are an expert front-end architect generating production-ready HTML mockups for the Ignite Zero factory.

### LANE CONTEXT
- Lane ID: ${laneId}
- Page Brief:
${laneSpec.slice(0, 3000)}

### TOPOLOGY CONTEXT (INTERLINKING)
This page is part of a larger prototype. You MUST include a global navigation header in your output that links to these sibling pages:
${otherLanes.map((l) => `- ID: "${l.id}" Title: "${l.title}"`).join("\n")}

**Navigation Rule:**
Use the exact Lane ID as the href (e.g. <a href="dashboard">Dashboard</a>). The orchestrator will intercept these clicks.
Highlight the current page ("${laneId}") in the nav bar with an active state/style.

### EXECUTION RULES
- Return ONLY raw HTML (full document with <html>, <head>, <style>, <body>), no markdown fences.
- Use semantic tags and Tailwind-friendly class names.
- Visual Style: Adapt the aesthetic to the specific domain described in the brief.
  - If it's a developer tool: Use dark mode, slate/emerald colors, monospace fonts.
  - If it's a consumer app: Use clean, modern, accessible styles (light or dark as appropriate).
  - If it's a dashboard: Focus on data density and clarity.
- Incorporate all personas, CTAs, and data points described in the brief.
- The layout must include every section listed in VALIDATION HINTS.
- Keep copy grounded in the domain vocabulary. Avoid lorem ipsum.
- Never include scripts or external assets.

VALIDATION HINTS:
${validationHints.length ? validationHints.map((hint, idx) => `${idx + 1}. ${hint}`).join("\n") : "- Cover the full page structure."}

For each hint, ensure the element is clearly present and identifiable in the mockup.

Output should feel pixel-perfect and ready for Cursor to reference.`;
      jsonOutput = false;
    } else if (mode === "mockup-critique") {
      const lanes = Array.isArray(body.lanes) ? body.lanes : [];
      const critiquePrompt = buildMockupCritiquePrompt(
        typeof prompt === "string" ? prompt : "",
        lanes,
        typeof body.context === "object" && body.context !== null ? body.context as Record<string, unknown> : undefined,
      );

      systemPrompt = `You are The Product Critic for the Ignite Zero factory.

### MISSION
Evaluate whether the proposed UI mockup lanes satisfy the product brief. Focus on coverage, redundancy, and the clarity of the end-user journey. Your opinion directly influences whether engineers ship these screens.

### OUTPUT FORMAT (STRICT JSON)
Return a JSON object with these keys:
{
  "verdict": "approved" | "needs_revision",
  "missing_screens": string[],
  "redundant_screens": string[],
  "journey_issues": string[],
  "suggestions": string[]
}

Rules:
- Keep arrays short (≤5 items). Use empty arrays when nothing to report.
- "verdict" must be "approved" only if no critical gaps or journey blockers.
- Each string should be concise (<160 characters), actionable, and reference exact screen names when possible.
- If the brief lacks enough detail, flag it in "suggestions" and set verdict to "needs_revision".

### CONTEXT
Use the user message for the document synopsis, art direction, and lane summaries.`;
      jsonOutput = true;

      // Override user messages with a single synthesized payload for clarity.
      const criticMessage: ChatMessage = {
        role: "user",
        content: critiquePrompt,
      };
      fullMessagesForMode = [criticMessage];
    } else if (mode === "decode") {
      systemPrompt = `You are The Decoder. Analyze the provided technical documentation.

    Your goal is to translate it into a **Complete, Granular Ignite Zero Implementation Plan**.

    ### 1. ARCHETYPE DETECTION & REFRAMING

    First, classify the system type to determine the architecture:

    * **TYPE A: THE PROCESSOR (e.g., Outreach, Scraper)** -> Heavy Async Jobs, Micro-Batches. **If the work is TYPE A you MUST literally include the strings "Micro-Batch JSON", "Sidecar SQL Table", and "Async Background Job + Polling Loop" inside the plan.** Any mention of "bulk", "1M rows", "mass update", "ETL", or direct SQL manipulation should force TYPE A.

    * **TYPE B: THE PLATFORM (e.g., LMS, CRM)** -> Heavy CRUD, Hybrid Storage, Standard Auth. Keep login/dashboard flows synchronous—no background Strategy unless the work is long-running.

    * **Reframing Rule:** If the input violates Ignite constraints (e.g. Bulk SQL or Client Loops), REFRAME it to fit (e.g. Sidecar Tables, Backend Strategy).
    
    * **Real-Time Rule:** If the prompt references chat, realtime, websockets, "millisecond", or live collaboration, you must add a dedicated step titled along the lines of "Async Background Job + Polling Loop" (or "Event Stream + Job Queue") and literally include those phrases in the cursor prompt.

    ### FACTORY GUARDRAILS (MUST USE THESE EXACT TERMS)
    * For bulk/processor workloads: state **"Micro-Batch JSON"** and **"Sidecar SQL Table"** in the analysis or relevant steps (verbatim).
    * For real-time needs: state **"Async Background Job + Polling Loop"** (or "**Event Stream + Job Queue**") so Cursor never promises millisecond sync; include the exact phrases.
    * Regardless of archetype, add a short "Factory Guardrails" sentence inside your analysis summary that repeats those exact phrases so reviewers can see the guardrails were considered.

    ### 2. DEEP CONTEXT EXTRACTION (CRITICAL)

    Do not generate generic instructions. You must **Extract & Inject** specific details from the input text:

    * **Terminology:** Use the exact nouns from the doc (e.g. "Campaign" not "Project").

    * **Hard Logic:** If the doc contains math, formulas, or API rules, **COPY THAT RAW TEXT** into the 'cursor_prompt' for the Strategy step.

    * **Visuals:** If the doc mentions "Glassmorphism", "Kanban", or "Bento Grid", **COPY THOSE KEYWORDS** into the 'cursor_prompt' for the UI step.

    ### 3. DEEP DECOMPOSITION PROTOCOL

    Break requirements into 6-10 granular tasks.

    

    * **Phase 1: The Core (Genesis + Infra)**

        * Extract specific Roles and Fields for the Manifest.

        * Create Migrations for Sidecar Tables (if needed).

    

    * **Phase 2: The Logic (Atomic Strategies)**

        * Create a SEPARATE step for EACH distinct capability (e.g. "Strategy: Crawler", "Strategy: Scorer").

        * **Rule:** "Self-Contained Logic". Do not call external functions that don't exist. Instruct the Agent to write the logic inline.

        * **Strategy Filter:** Only create a Strategy step when the work is asynchronous, long-running, or AI-heavy (processors, crawlers, scoring, enrichment, media jobs). For synchronous CRUD/auth flows (login, tab switching, simple Supabase queries), DO NOT create a strategy—describe it in the relevant UI/Core step instead.

        * **Baseline Strategy:** If the plan is still pure CRUD after filtering, add a default "Strategy: Core Automation" step that captures background automations (notifications, summaries, MCP job triggers) so logic never leaks into React.

    ### 3. THE CAPABILITIES HEURISTIC (UNIVERSAL RULE)

    Regardless of the System Archetype (Platform vs. Processor), you must scan the input document for **Power Verbs**.

    **If the document says the system should:**

    * "Generate" / "Create" (Content)
    * "Analyze" / "Score" / "Rate" (Data)
    * "Predict" / "Forecast" (Future)
    * "Translate" / "Localize" (Language)
    * "Curate" / "Summarize" (Information)

    **THEN you MUST create a 'Strategy' Step for it.**

    * Example: Input says "System generates quizzes." -> Output: Step "Strategy: Quiz Generator".
    * Constraint: Do NOT skip these. These are the "Brains" of the app.

    **EXCEPTION:** Do NOT create strategies for standard CRUD verbs: "Save", "Edit", "Delete", "View", "Login". These belong in Phase 1 (Infra) or Phase 3 (UI).

        * **Realtime Strategy:** If the doc mentions chat, realtime, websockets, or millisecond sync, create a "Strategy: Conversation Dispatcher" (or equivalent) that explains how the background job + polling loop feeds the UI.

        * **Guardrail Step:** Include a step named exactly "Guardrail: Micro-Batch JSON + Sidecar SQL Table" **only when** the system is TYPE A or the source material references bulk data workflows. Skip this step entirely for TYPE B systems.

        * **Realtime Guardrail:** Add "Realtime: Async Background Job + Polling Loop" (or "...Event Stream + Job Queue") **only when** the prompt genuinely needs realtime/chat or event streaming. If there is no realtime requirement, omit this step entirely.

    * **Phase 3: The UI (3-Layer Protocol)**

        * **Layer 1: The Shell** (Navigation, Layouts).

        * **Layer 2: The Components** (Cards, Badges).

        * **Layer 3: The Views** (Specific Screens).

        * **Constraint:** Explicitly mention "Manifest-Driven Actions" (<AgentActions />).

    ### 4. EXCLUSION RULES (CRITICAL)

    * **Auth & CRUD:** If the system is Type B (Platform), do **NOT** create a 'Strategy' step for Authentication, User Profile, or Basic CRUD. These belong in 'Phase 1: Core' (Infra) or 'Phase 3: UI'.

    * **Empty Steps:** If a Guardrail (e.g. Micro-Batch) is NOT applicable to this system, do **NOT** include it in the 'steps' array. Do not output steps with "Command: N/A".

    * **Real-time:** If the input doc does not mention Real-time, do **NOT** create a Real-time step.

    ### 5. OUTPUT FORMAT (JSON)

    Return a JSON object containing 'analysis', 'steps', and 'markdown_plan'.
    * When guardrails genuinely apply, append the exact text "Factory Guardrails: Micro-Batch JSON | Sidecar SQL Table | Async Background Job + Polling Loop" to \`analysis.summary\`. Otherwise keep the summary focused on the platform requirements.

    OUTPUT FORMAT:

    {

      "project_name": "Ignite [Name]",

      "analysis": {

        "archetype": "Platform or Processor",

        "summary": "...",

        "pros": ["Pro 1", "Pro 2"],

        "cons": ["Con 1", "Con 2"]

      },

      "steps": [

        {

          "id": 1,

          "title": "Genesis: Inject DNA",

          "cursor_prompt": "Act as The Architect. Build [Name]. Context: [Summary]. Roles: [Extracted Roles]. Generate 'system-manifest.json'..."

        },

        {

          "id": 2,

          "title": "Strategy: [Name]",

          "cursor_prompt": "Create 'strategies/gen-[name].ts'. Implement this specific logic from the doc: [PASTE RAW LOGIC]..."

        },

        {

          "id": 3,

          "title": "UI: [View Name]",

          "cursor_prompt": "Create 'src/pages/[view].tsx'. Visual Spec: [PASTE VISUAL KEYWORDS like 'Glassmorphism']. Use generic components..."

        }

      ],

      "markdown_plan": "# Ignite Execution Plan... (Same content as steps, formatted as checklist)"

    }

    `;
      // Ensure OpenAI call uses response_format: { type: "json_object" }
      jsonOutput = true;
    } else if (mode === "consult") {
      const context = body.context || {};
      systemPrompt = `You are The Consultant, a Senior Product Co-Founder for Ignite Zero.

    ### YOUR MISSION
    Help the user refine their product idea into a killer spec.
    You operate in a clarify-first loop: keep asking targeted questions until the requirement is specific enough to build. Only after the user confirms they are ready (or explicitly asks for suggestions) do you switch into ideation mode.

    ### QUESTION LOOP PROTOCOL
    1.  **Diagnose Specific Gaps:** After every user message, identify what is still ambiguous (scope, actors, data, workflows) and ask one pointed question about it.
    2.  **Repeat Until Ready:** Continue the question loop until the user either provides enough detail or explicitly says "give me suggestions" / "that's enough info".
    3.  **Permission to Ideate:** If the user remains vague, ask \"Would you like me to suggest a direction for <gap>?\" before proposing features.

    ### INTERACTION RULES (STRICT)
    1.  **Start with Smart Questions:** Use the plan/context to craft specific clarifiers (\"Do you want the Campaign Board optimized for speed or depth?\", \"Should we bias toward automation or manual control?\").
    2.  **Don't Ask Generic Questions:** Never ask "What are your goals?" or "Who are your users?" unless you have ZERO context.
    3.  **Do Make Assumptions After Clarifying:** Once the user responds and confirms they want suggestions, assume they care about growth, speed, or quality and push toward that.
    4.  **Propose Specific Features (Only After Permission):**
        * *Bad:* "We could add a dashboard."
        * *Good:* "For this Outreach tool, I recommend adding a **'Lead Scoring' Strategy** that uses AI to rate the company's fit (1-10) before drafting the email. Should we add that?"
    5.  **Challenge the User:** If they suggest a weak feature, push back. "A simple list view is boring. Let's make it a **Kanban Board** grouped by Deal Stage. Agreed?"

    ### ARCHITECTURAL ALIGNMENT
    * Always map your product ideas back to Ignite primitives (Strategies, Jobs, Sidecar Tables).
    * Example: "We can build that Lead Score feature using a background strategy (\`gen-lead-score.ts\`)."

    ### CHALLENGE MODE
    * If their request is vague or low-value, offer a bolder feature and ask for confirmation.
    * If they request something that breaks Ignite physics (real-time trading, SQL passthrough), force a pivot and explain why.

    ### EXAMPLES
    User: "Can we add a dashboard?"
    You: "First: do you need faster triage or deeper analytics? If it's triage, let's ship a **Deal Intelligence Board** ranking accounts by win-likelihood, powered by \`gen-rank-accounts.ts\`. Ship it?"

    User: "Just add a list of leads."
    You: "Do you care more about collaboration or automation here? If automation wins, let's build a **Sequencer Timeline** that plots each touchpoint and schedules the next job via \`enqueueJob({ jobType: 'schedule_touch' })\`. Want that?"

    ### CONTEXT
    Current Plan/Manifest: ${JSON.stringify(context || {})}
    `;
      jsonOutput = false;
    } else if (mode === "evolution") {
      // Evolution mode – refactor an existing Ignite Zero system.
      const manifestSnippet = body.manifest
        ? JSON.stringify(body.manifest, null, 2)
        : "{}";

      systemPrompt = `You are The Architect, maintaining an Ignite Zero system.
The current system-manifest.json is:
${manifestSnippet}

You MUST respect these invariants:
- Manifest-First: data_model and agent_jobs define the system.
- Logic lives in supabase/functions/ai-job-runner strategies.
- Frontend only calls MCP methods and edge functions; no hidden business rules in React.

Respond in markdown with:
- High-level intent
- Explicit manifest edits
- Strategy / edge-function changes
- Any migration notes (if needed).`;
    } else {
      // Genesis mode – create a new manifest/system from scratch.
      systemPrompt = `You are The Architect, designing a brand new Ignite Zero system from a blank seed.
You will propose a new system-manifest.json and the initial job strategies.

Constraints:
- Hybrid JSON storage (root entity as JSON blob, child entities embedded).
- All async work must be expressed as agent_jobs and executed via strategies.

Respond in markdown with:
- A short description of the target system
- A draft manifest (inline JSON)
- A list of strategies to implement next.`;
    }

    const userMessages =
      mode === "mockup-critique" && typeof fullMessagesForMode !== "undefined"
        ? fullMessagesForMode
        : messages;

    const fullMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...userMessages,
    ];

    let content = await callOpenAI(apiKey, fullMessages, {
      jsonOutput,
    });

    if (mode === "consult") {
      logConsultInteraction({
        mode,
        prompt: messages,
        response: content,
        context: body.context,
        projectName:
          (body.context as Record<string, unknown> | undefined)?.["project_name"] as string |
          undefined,
        ownerId: body.ownerId,
        sessionId: body.sessionId,
      });
    }

    if (mode === "mockup-critique") {
      const normalized = normalizeCriticPayload(content ?? "");
      content = JSON.stringify(normalized);
      logConsultInteraction({
        mode,
        prompt: userMessages,
        response: content,
        context: body.context,
        projectName:
          (body.context as Record<string, unknown> | undefined)?.["planName"] as string |
          undefined,
        ownerId: body.ownerId,
        sessionId: body.sessionId,
      });
    }

    if (mode === "decode" && jsonOutput) {
      try {
        const parsed =
          typeof content === "string" ? JSON.parse(content) : content;
        if (Array.isArray(parsed?.steps)) {
          parsed.steps = parsed.steps.filter((step: any) => {
            if (!step) return false;
            const promptText = String(step.cursor_prompt ?? "");
            const descriptionText = String(step.description ?? "");
            const promptHasNA = promptText.toLowerCase().includes("n/a");
            const descHasNA = descriptionText
              .toLowerCase()
              .includes("not applicable");
            return !promptHasNA && !descHasNA;
          });
        }
        enforceDecodeGuardrails(parsed, { sourceText: sourceTextForGuardrails });
        content = JSON.stringify(parsed);
        await logPlanSnapshot({
          projectName:
            (parsed?.project_name as string) ??
            (body.context as Record<string, unknown> | undefined)?.["project_name"],
          prompt,
          plan: parsed,
          markdown: parsed?.markdown_plan,
          summary: parsed?.analysis?.summary,
          ownerId: body.ownerId,
          sessionId: body.sessionId,
        });
      } catch (error) {
        console.warn("[plan_snapshot] failed to parse decode output", error);
      }
    } else if (mode === "mockup-lane") {
      const rawHtml = typeof content === "string" ? content : String(content ?? "");
      const validationHints: string[] = Array.isArray(body.validationHints)
        ? body.validationHints.filter(
          (hint): hint is string =>
            typeof hint === "string" && hint.trim().length > 0,
        )
        : [];
      const validation = validateMockupLane(rawHtml, validationHints);
      content = JSON.stringify({
        laneId: body.laneId ?? "lane",
        status: validation.passed ? "ready" : "needs_revision",
        diagnostics: validation.missing,
        html: rawHtml,
      });
    }

    console.log(
      `${logPrefix} success mode=${mode} duration=${Date.now() - startedAt}ms`,
    );

    return new Response(
      JSON.stringify({ result: content }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const normalizedMessage = String(message || "");
    console.error(
      `${logPrefix} failed mode=${mode} duration=${Date.now() - startedAt}ms`,
      err,
    );
    const retryable = /network|fetch|timeout|aborted/i.test(
      normalizedMessage.toLowerCase(),
    );

    return new Response(
      JSON.stringify({ error: normalizedMessage, retryable }),
      {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }
});

function enforceDecodeGuardrails(
  plan: any,
  options?: GuardrailOptions,
) {
  if (!plan || typeof plan !== "object") return;

  const summaryGuardrail =
    "Factory Guardrails: Micro-Batch JSON | Sidecar SQL Table | Async Background Job + Polling Loop";
  plan.analysis =
    plan.analysis && typeof plan.analysis === "object" ? plan.analysis : {};
  plan.steps = Array.isArray(plan.steps) ? plan.steps : [];

  const sourceText = typeof options?.sourceText === "string"
    ? options.sourceText
    : "";
  const contextSnippet = getContextSnippet(sourceText);

  const archetype = String(plan.analysis?.archetype || "").toLowerCase();
  const planText = JSON.stringify(plan).toLowerCase();
  const mentionsBulk =
    archetype.includes("processor") ||
    planText.includes("bulk") ||
    planText.includes("etl") ||
    planText.includes("1m") ||
    planText.includes("million") ||
    planText.includes("sidecar") ||
    planText.includes("mass update");
  const mentionsRealtime =
    planText.includes("real-time") ||
    planText.includes("realtime") ||
    planText.includes("chat") ||
    planText.includes("discord") ||
    planText.includes("millisecond") ||
    planText.includes("live collaboration") ||
    planText.includes("websocket");

  if (mentionsBulk || mentionsRealtime) {
    if (
      typeof plan.analysis.summary !== "string" ||
      !plan.analysis.summary.includes("Factory Guardrails:")
    ) {
      plan.analysis.summary = plan.analysis.summary
        ? `${plan.analysis.summary} ${summaryGuardrail}`
        : summaryGuardrail;
    }
  } else if (typeof plan.analysis.summary === "string") {
    plan.analysis.summary = plan.analysis.summary
      .replace(summaryGuardrail, "")
      .replace(/Factory Guardrails:[^.]+(\.|$)/, "")
      .trim();
  }

  plan.steps = plan.steps.filter((step: any) => {
    if (!step || typeof step.title !== "string") return false;
    const titleLower = step.title.toLowerCase();
    const bodyLower = `${titleLower} ${String(step.cursor_prompt ?? "").toLowerCase()}`;

    if (!mentionsBulk && titleLower.includes("micro-batch json + sidecar sql table")) {
      return false;
    }

    if (
      !mentionsRealtime &&
      (titleLower.includes("async background job + polling loop") ||
        titleLower.includes("event stream + job queue"))
    ) {
      return false;
    }

    if (
      titleLower.startsWith("strategy:") &&
      /(auth|login|signin|signup|password|profile|crud|settings|save|edit|delete|view)/.test(
        bodyLower,
      )
    ) {
      return false;
    }

    return true;
  });

  plan.steps = plan.steps.map((step: any) => {
    if (
      step &&
      typeof step.title === "string" &&
      !step.title.toLowerCase().startsWith("strategy:") &&
      typeof step.cursor_prompt === "string" &&
      step.cursor_prompt.includes("strategies/")
    ) {
      const cleanedTitle = step.title.replace(/^phase\s+\d+:\s*/i, "").trim();
      return {
        ...step,
        title: `Strategy: ${cleanedTitle}`,
      };
    }
    return step;
  });

  if (mentionsBulk) {
    const hasMicro =
      plan.steps.findIndex(
        (step: any) =>
          typeof step?.title === "string" &&
          step.title.includes("Guardrail: Micro-Batch JSON + Sidecar SQL Table"),
      ) >= 0;
    if (!hasMicro) {
      plan.steps.unshift({
        id: plan.steps.length + 1,
        title: "Guardrail: Micro-Batch JSON + Sidecar SQL Table",
        description:
          "Bulk processors must buffer via Micro-Batch JSON and write through a Sidecar SQL Table for auditing.",
        cursor_prompt:
          "Document how Micro-Batch JSON buffers feed into a Sidecar SQL Table before applying updates. Include retry + audit logic.",
      });
    }
  }

  if (mentionsRealtime) {
    const hasRealtime =
      plan.steps.findIndex(
        (step: any) =>
          typeof step?.title === "string" &&
          (step.title.includes("Async Background Job + Polling Loop") ||
            step.title.includes("Event Stream + Job Queue")),
      ) >= 0;
    if (!hasRealtime) {
      plan.steps.unshift({
        id: plan.steps.length + 1,
        title: "Realtime: Async Background Job + Polling Loop",
        description:
          "All realtime/chat experiences must run through an Async Background Job + Polling Loop (or Event Stream + Job Queue) instead of direct sockets.",
        cursor_prompt:
          "Create the wiring for an Async Background Job + Polling Loop (or Event Stream + Job Queue) that drives realtime UX without millisecond socket promises.",
      });
    }
  }

  const strategyInsertIndex = plan.steps.findIndex(
    (step: any) =>
      typeof step?.title === "string" &&
      step.title.toLowerCase().startsWith("ui:"),
  );
  const insertionPoint =
    strategyInsertIndex === -1 ? plan.steps.length : strategyInsertIndex;

  const plannedStrategies: any[] = [];
  let hasStrategy = plan.steps.some(
    (step: any) =>
      typeof step?.title === "string" &&
      step.title.toLowerCase().startsWith("strategy:"),
  );

  const existingStrategyBodies = plan.steps
    .filter(
      (step: any) =>
        typeof step?.title === "string" &&
        step.title.toLowerCase().startsWith("strategy:"),
    )
    .map((step: any) =>
      `${String(step.title ?? "").toLowerCase()} ${String(step.cursor_prompt ?? "")
        .toLowerCase()}`,
    );

  const registerStrategy = (strategy: any) => {
    plannedStrategies.push(strategy);
    hasStrategy = true;
    existingStrategyBodies.push(
      `${String(strategy.title ?? "").toLowerCase()} ${String(strategy.cursor_prompt ?? "")
        .toLowerCase()}`,
    );
  };

  if (mentionsBulk && !hasStrategy) {
    registerStrategy({
      id: plan.steps.length + plannedStrategies.length + 1,
      title: "Strategy: Core Orchestrator",
      description:
        "Implement the backend orchestration logic inline (no external helpers) so Cursor writes the computation in one file.",
      cursor_prompt:
        "Create 'strategies/gen-core-orchestrator.ts'. Implement the core orchestration logic for this plan directly inside the file (no external helpers).",
    });
  }

  const aiCapabilities = extractAICapabilities(sourceText);
  if (aiCapabilities.length > 0) {
    for (const capability of aiCapabilities) {
      const normalizedNeedle = capability.normalized.toLowerCase();
      const alreadyCovered = existingStrategyBodies.some((body: string) =>
        body.includes(normalizedNeedle),
      );
      if (alreadyCovered) continue;

      const title = `Strategy: ${toTitleCase(capability.normalized || capability.verb)}`;
      registerStrategy({
        id: plan.steps.length + plannedStrategies.length + 1,
        title,
        description:
          "Implement this AI/automation workflow as a dedicated strategy so the logic runs server-side.",
        cursor_prompt:
          `Create a strategy that fulfils this requirement exactly: "${capability.snippet}". ` +
          "Implement the computation inline (no external helpers), persist results, and expose it via lms.enqueueJob.",
      });
    }
  }

  if (plannedStrategies.length > 0) {
    plan.steps = [
      ...plan.steps.slice(0, insertionPoint),
      ...plannedStrategies,
      ...plan.steps.slice(insertionPoint),
    ];
  }

  const finalHasStrategy = plan.steps.some(
    (step: any) =>
      step &&
      typeof step.title === "string" &&
      step.title.toLowerCase().startsWith("strategy:"),
  );

  if (!finalHasStrategy) {
    let strategyAdded = false;
    const candidateIndex = plan.steps.findIndex(
      (step: any) =>
        step &&
        typeof step.title === "string" &&
        (step.title.toLowerCase().includes("automation") ||
          step.title.toLowerCase().includes("logic")),
    );

    if (candidateIndex >= 0) {
      const candidate = plan.steps[candidateIndex];
      const cleanedTitle =
        candidate.title.replace(/^.*?:\s*/i, "").trim() || "Core Automation";
      plan.steps[candidateIndex] = {
        ...candidate,
        title: `Strategy: ${cleanedTitle}`,
        cursor_prompt: candidate.cursor_prompt ?? "",
      };
      strategyAdded = true;
    }

    if (!strategyAdded) {
      const fallbackTitle = mentionsRealtime
        ? "Strategy: Conversation Dispatcher"
        : "Strategy: Core Automation";
      const fallbackSlug = mentionsRealtime
        ? "conversation-dispatcher"
        : "core-automation";
      const fallbackDescription = mentionsRealtime
        ? "Coordinate chat/event fan-out as an async strategy so realtime UX never relies on direct sockets."
        : "Handle background workflows (notifications, summarization, enrichment) as an async strategy to keep the platform deterministic.";

      const fallbackInsertIndex = plan.steps.findIndex(
        (step: any) =>
          typeof step?.title === "string" &&
          step.title.toLowerCase().startsWith("ui:"),
      );
      const fallbackPoint =
        fallbackInsertIndex === -1 ? plan.steps.length : fallbackInsertIndex;

      const fallbackStrategy = {
        id: plan.steps.length + 1,
        title: fallbackTitle,
        description: fallbackDescription,
        cursor_prompt:
          `Create 'strategies/gen-${fallbackSlug}.ts'. Use this context: "${contextSnippet}". ` +
          "Implement the automation inline, store results in Supabase, and expose it via lms.enqueueJob so the UI only triggers jobs.",
      };

      plan.steps = [
        ...plan.steps.slice(0, fallbackPoint),
        fallbackStrategy,
        ...plan.steps.slice(fallbackPoint),
      ];
    }
  }
}


const AI_VERB_REGEX =
  /\b(generate|create|predict|forecast|analyze|score|rate|remediate|translate|localize|curate|summarize)\b([^.\n]{0,140})/gi;

interface AICapability {
  verb: string;
  snippet: string;
  normalized: string;
}

function extractAICapabilities(text: string): AICapability[] {
  if (!text || typeof text !== "string") return [];
  const matches: AICapability[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = AI_VERB_REGEX.exec(text)) !== null) {
    const verb = match[1]?.toLowerCase() ?? "";
    const remainder = match[2] ?? "";
    const sentenceFragment = remainder.split(/[\n.]/)[0] ?? "";
    const snippet = `${verb}${sentenceFragment}`.trim();
    const normalized = snippet.replace(/[^a-z0-9\s-]/gi, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    matches.push({ verb, snippet, normalized });
  }
  return matches;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getContextSnippet(text: string, max = 220): string {
  if (!text) {
    return "Use the original user brief to capture the exact workflow requirements.";
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function validateMockupLane(
  html: string,
  hints: string[],
): MockupLaneValidation {
  if (!Array.isArray(hints) || hints.length === 0) {
    return { passed: true, missing: [] };
  }
  const lowerHtml = html.toLowerCase();
  let satisfiedCount = 0;
  const missing: string[] = [];

  for (const hint of hints) {
    if (!hint) continue;
    const tokens = hint
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean);

    const hintSatisfied = tokens.every((token) => lowerHtml.includes(token));
    if (hintSatisfied) {
      satisfiedCount += 1;
    } else {
      missing.push(hint);
    }
  }

  const requiredMatches = Math.ceil(hints.length * 0.5);
  return {
    passed: satisfiedCount >= requiredMatches,
    missing,
    // Optionally, we could fail if nav links are missing when topology is provided,
    // but let's keep it soft for now.
  };
}

function buildMockupCritiquePrompt(
  documentText: string,
  lanes: AdvisorRequestBody["lanes"],
  context?: Record<string, unknown>,
): string {
  const trimmedDoc = documentText?.trim()
    ? documentText.trim().slice(0, 8000)
    : "No document provided.";

  const artDirection =
    typeof context?.["artDirection"] === "string" && context?.["artDirection"]?.trim()
      ? (context["artDirection"] as string).trim().slice(0, 2000)
      : "No art direction provided.";

  const planName =
    typeof context?.["planName"] === "string" && context?.["planName"]?.trim()
      ? (context["planName"] as string).trim()
      : "Unnamed Project";

  const laneSummaries = Array.isArray(lanes) && lanes.length
    ? lanes
      .map((lane, idx) => {
        const title =
          typeof lane?.title === "string" && lane.title.trim()
            ? lane.title.trim()
            : `Lane ${idx + 1}`;
        const instructions =
          typeof lane?.instructions === "string" && lane.instructions.trim()
            ? lane.instructions.trim().slice(0, 400)
            : "No instructions available.";
        const validationHints =
          Array.isArray(lane?.validationHints) && lane.validationHints.length
            ? lane.validationHints.join(", ")
            : "No validation hints supplied.";
        const sourceLabel =
          typeof lane?.source === "string" && lane.source.trim()
            ? lane.source.trim()
            : "generated";
        return [
          `Title: ${title}`,
          `Source: ${sourceLabel}`,
          `Key Sections: ${validationHints}`,
          `Brief: ${instructions}`,
        ].join("\n");
      })
      .join("\n\n")
    : "No lanes available.";

  return [
    `Project: ${planName}`,
    "=== PRODUCT BRIEF ===",
    trimmedDoc,
    "=== ART DIRECTION ===",
    artDirection,
    "=== MOCKUP LANES ===",
    laneSummaries,
    "=== TASK ===",
    "Provide a product-focused critique following the required JSON schema.",
  ].join("\n\n");
}
