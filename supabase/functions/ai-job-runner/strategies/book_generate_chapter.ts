/**
 * book_generate_chapter (Factory / ai_agent_jobs)
 *
 * Orchestrates section-by-section generation for a single chapter in a skeleton-first pipeline
 * (via book_generate_section subjobs), then chains the next chapter job.
 *
 * - Loads skeleton.json from Storage (to derive outline + section count)
 * - (Optional) Uses an LLM planner to decide where praktijk/verdieping boxes fit (outline-driven)
 * - Enqueues book_generate_section jobs sequentially and waits for completion
 * - Enqueues next chapter job until completion
 *
 * IMPORTANT:
 * - No silent fallbacks (fail loudly on missing required inputs/env)
 * - No image generation: only placeholder src keys + suggestedPrompt strings
 */
import type { JobContext, JobExecutor } from "./types.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { validateBookSkeleton, type BookSkeletonV1 } from "../../_shared/bookSkeletonCore.ts";
import { extractJsonFromText } from "../../_shared/generation-utils.ts";

type Provider = "openai" | "anthropic";
type ImagePromptLanguage = "en" | "book";

type AnthropicToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ChapterLayoutProfile = "auto" | "pass2" | "sparse";
type ChapterLayoutPlan = {
  praktijkSubparagraphTitles: string[];
  verdiepingSubparagraphTitles: string[];
  notes?: string | null;
};

type ChapterOutline = {
  chapterTitle?: string;
  sections: Array<{
    title: string;
    numberedSubparagraphTitles: string[];
  }>;
};

type ChapterOrchestratorYield = {
  yield: true;
  message: string;
  nextPayload: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

const TOOL_PLAN_CHAPTER_LAYOUT: AnthropicToolSpec = {
  name: "plan_chapter_layout",
  description:
    "Select where to place 'In de praktijk' and 'Verdieping' boxes for a Dutch MBO chapter, based on the outline titles. " +
    "Return only titles from the provided candidate list. Do not invent new titles.",
  input_schema: {
    type: "object",
    additionalProperties: true,
    required: ["praktijkSubparagraphTitles", "verdiepingSubparagraphTitles"],
    properties: {
      praktijkSubparagraphTitles: { type: "array", items: { type: "string" } },
      verdiepingSubparagraphTitles: { type: "array", items: { type: "string" } },
      notes: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  },
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED`);
  }
  return v.trim();
}

function requireString(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${key} is REQUIRED`);
  }
  return v.trim();
}

function requireNumber(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`BLOCKED: ${key} is REQUIRED (number)`);
  }
  return v;
}

function optionalString(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], keyName: string): T {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || !allowed.includes(s as T)) {
    throw new Error(`BLOCKED: ${keyName} must be one of: ${allowed.join(", ")}`);
  }
  return s as T;
}

function optionalEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  return allowed.includes(s as T) ? (s as T) : null;
}

function normalizeWs(s: string): string {
  // Remove invisible formatting characters that can leak from PDF/IDML sources
  // (e.g. WORD JOINER, zero-width spaces, soft hyphen) so outline/title matching is stable.
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberPrefix(title: string): string {
  return normalizeWs(title).replace(/^\d+(?:\.\d+)*\s+/, "").trim();
}

function normalizeLanguageLabel(code: string): string {
  const s = (code || "").trim().toLowerCase();
  if (!s) return "the book language";
  if (s === "nl" || s.startsWith("nl-")) return "Dutch";
  if (s === "en" || s.startsWith("en-")) return "English";
  if (s === "de" || s.startsWith("de-")) return "German";
  if (s === "fr" || s.startsWith("fr-")) return "French";
  if (s === "es" || s.startsWith("es-")) return "Spanish";
  return s;
}

function looksLikePlaceholderChapterTitle(title: string, chapterNumber: number): boolean {
  const t = normalizeWs(title).toLowerCase();
  return t === `hoofdstuk ${chapterNumber}` || t === `chapter ${chapterNumber}`;
}

function extractOutlineFromSkeletonChapter(chRaw: any, chapterNumber: number): ChapterOutline | null {
  if (!chRaw || typeof chRaw !== "object") return null;

  const chapterTitle = typeof chRaw.title === "string" ? normalizeWs(chRaw.title) : "";
  const lockChapterTitle = !!chapterTitle && !looksLikePlaceholderChapterTitle(chapterTitle, chapterNumber);

  const sectionsIn = Array.isArray(chRaw.sections) ? chRaw.sections : [];
  const sections = sectionsIn
    .filter((s: any) => s && typeof s === "object")
    .map((s: any) => {
      const title = typeof s.title === "string" ? normalizeWs(s.title) : "";
      const blocks = Array.isArray(s.blocks) ? s.blocks : [];
      const numberedSubparagraphTitles = blocks
        .filter((b: any) => b && typeof b === "object" && b.type === "subparagraph")
        .map((b: any) => (typeof b.title === "string" ? normalizeWs(b.title) : ""))
        .filter((t: string) => /^\d+(?:\.\d+){2,}\s+/.test(t));
      return { title, numberedSubparagraphTitles };
    })
    .filter((s: any) => !!s.title)
    .slice(0, 50);

  const hasSectionTitles = sections.length > 0;
  if (!lockChapterTitle && !hasSectionTitles) return null;

  return {
    ...(lockChapterTitle ? { chapterTitle } : {}),
    sections,
  };
}

function parseModelSpec(raw: string): { provider: Provider; model: string } {
  const s = raw.trim();
  const parts = s.split(":").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) {
    throw new Error("BLOCKED: writeModel must be prefixed with provider (use 'openai:<model>' or 'anthropic:<model>')");
  }
  const provider = parts[0] as Provider;
  const model = parts.slice(1).join(":");
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error("BLOCKED: writeModel provider must be 'openai' or 'anthropic'");
  }
  if (!model) throw new Error("BLOCKED: writeModel model is missing");
  return { provider, model };
}

async function llmGenerateJson(opts: {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  tool: AnthropicToolSpec;
}): Promise<any> {
  const { provider, model, system, prompt, maxTokens, tool } = opts;
  const timeoutMs = 220_000;

  if (provider === "openai") {
    const key = requireEnv("OPENAI_API_KEY");
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`LLM(openai) failed: ${resp.status} ${text.slice(0, 400)}`);
    const data = JSON.parse(text);
    const out = data?.choices?.[0]?.message?.content;
    if (typeof out !== "string" || !out.trim()) throw new Error("LLM(openai) returned empty content");
    return extractJsonFromText(out);
  }

  const key = requireEnv("ANTHROPIC_API_KEY");
  const toolName = tool.name;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM(anthropic) failed: ${resp.status} ${text.slice(0, 400)}`);
  const data = JSON.parse(text);

  const toolUse = (Array.isArray((data as any)?.content) ? (data as any).content : []).find(
    (b: any) => b?.type === "tool_use" && b?.name === toolName && b?.input && typeof b.input === "object",
  );
  if (toolUse?.input && typeof toolUse.input === "object") return toolUse.input;

  const out = (Array.isArray(data?.content) ? data.content : [])
    .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
    .map((b: any) => b.text)
    .join("\n");
  if (!out.trim()) throw new Error("LLM(anthropic) returned empty content");
  return extractJsonFromText(out);
}

async function downloadJson(supabase: any, bucket: string, path: string): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || `Failed to download ${bucket}/${path}`);
  const text = await data.text();
  return text ? JSON.parse(text) : null;
}

function pickLayoutBudgets(profile: ChapterLayoutProfile, candidateCount: number): {
  praktijkRange: [number, number];
  verdiepingRange: [number, number];
} {
  const n = Math.max(0, Math.floor(candidateCount));
  if (n === 0) return { praktijkRange: [0, 0], verdiepingRange: [0, 0] };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const range = (lo: number, hi: number) => [clamp(lo, 0, n), clamp(hi, 0, n)] as [number, number];

  if (profile === "pass2") {
    return {
      praktijkRange: range(Math.ceil(n * 0.35), Math.ceil(n * 0.6)),
      verdiepingRange: range(Math.max(2, Math.ceil(n * 0.1)), Math.min(8, Math.ceil(n * 0.2))),
    };
  }
  if (profile === "sparse") {
    return {
      praktijkRange: range(Math.min(2, Math.ceil(n * 0.1)), Math.ceil(n * 0.2)),
      verdiepingRange: range(Math.min(1, Math.ceil(n * 0.03)), Math.ceil(n * 0.08)),
    };
  }
  // auto
  return {
    praktijkRange: range(Math.max(2, Math.ceil(n * 0.2)), Math.ceil(n * 0.35)),
    verdiepingRange: range(Math.max(1, Math.ceil(n * 0.06)), Math.ceil(n * 0.12)),
  };
}

function buildLayoutPlannerSystem(opts: { language: string; level: "n3" | "n4" }) {
  const langLabel = normalizeLanguageLabel(opts.language);
  return (
    "You are planning the layout for a Dutch MBO textbook chapter BEFORE writing.\n" +
    "Your job is ONLY to decide where 'In de praktijk' and 'Verdieping' boxes belong, based on the outline titles.\n" +
    "Return JSON only.\n" +
    `Book language: ${opts.language} (${langLabel})\n` +
    `Level: ${opts.level}\n` +
    "\nRules:\n" +
    "- Praktijk boxes: choose titles where a realistic care/workplace scenario clearly fits.\n" +
    "- Verdieping boxes: choose titles that are relatively more complex (mechanisms, reasoning, nuance).\n" +
    "- Not every title needs a box. Avoid forced/generic placements.\n" +
    "- Spread selections across the chapter (avoid clustering everything into one section).\n" +
    "- NEVER invent new titles. Only select from the provided candidate list.\n"
  );
}

function buildLayoutPlannerPrompt(opts: {
  bookTitle: string;
  topic: string;
  outline: ChapterOutline;
  profile: ChapterLayoutProfile;
}): string {
  const candidates: Array<{ sectionTitle: string; subTitle: string }> = [];
  for (const s of opts.outline.sections) {
    const subs = Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles : [];
    for (const subTitle of subs) {
      if (typeof subTitle !== "string" || !subTitle.trim()) continue;
      candidates.push({ sectionTitle: s.title, subTitle: subTitle.trim() });
    }
  }

  const budgets = pickLayoutBudgets(opts.profile, candidates.length);
  const candidateText = candidates.length
    ? candidates.map((c, i) => `${i + 1}. [${c.sectionTitle}] ${c.subTitle}`).join("\n")
    : "(none)";

  return (
    "Return JSON with this exact shape:\n" +
    "{\n" +
    '  \"praktijkSubparagraphTitles\": string[],\n' +
    '  \"verdiepingSubparagraphTitles\": string[],\n' +
    '  \"notes\"?: string\n' +
    "}\n\n" +
    `Book title: ${opts.bookTitle}\n` +
    `Topic: ${opts.topic}\n` +
    `Profile: ${opts.profile}\n` +
    `Targets (soft guidance):\n` +
    `- praktijk range: ${budgets.praktijkRange[0]}..${budgets.praktijkRange[1]}\n` +
    `- verdieping range: ${budgets.verdiepingRange[0]}..${budgets.verdiepingRange[1]}\n\n` +
    "Candidate numbered subparagraph titles (select from these ONLY):\n" +
    candidateText +
    "\n\nGuidance:\n" +
    "- Pick praktijk titles that naturally map to care/work situations.\n" +
    "- Pick verdieping titles that benefit from a deeper mechanism or nuance.\n" +
    "- If a box would be generic or forced, do NOT select that title.\n"
  );
}

function sanitizeLayoutPlan(raw: any, outline: ChapterOutline): ChapterLayoutPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const allowed = new Set<string>();
  for (const s of outline.sections) {
    for (const t of (Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles : [])) {
      if (typeof t === "string" && t.trim()) allowed.add(normalizeWs(t));
    }
  }
  const take = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
      const t = typeof x === "string" ? normalizeWs(x) : "";
      if (!t) continue;
      if (!allowed.has(t)) continue;
      if (!out.includes(t)) out.push(t);
    }
    return out;
  };
  return {
    praktijkSubparagraphTitles: take((raw as any).praktijkSubparagraphTitles),
    verdiepingSubparagraphTitles: take((raw as any).verdiepingSubparagraphTitles),
    notes: typeof (raw as any).notes === "string" ? String((raw as any).notes).trim().slice(0, 500) : null,
  };
}

function ensureMinimumBoxSelections(opts: {
  outline: ChapterOutline;
  layoutPlan: ChapterLayoutPlan | null;
  profile: ChapterLayoutProfile;
}): ChapterLayoutPlan | null {
  const titles: string[] = [];
  for (const s of opts.outline.sections) {
    for (const t of (Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles : [])) {
      const tt = typeof t === "string" ? normalizeWs(t) : "";
      if (tt) titles.push(tt);
    }
  }
  if (!titles.length) return opts.layoutPlan;

  const uniq = (arr: string[]) => {
    const out: string[] = [];
    for (const t of arr) {
      const tt = normalizeWs(t);
      if (!tt) continue;
      if (!out.includes(tt)) out.push(tt);
    }
    return out;
  };

  const plan: ChapterLayoutPlan = opts.layoutPlan
    ? {
      praktijkSubparagraphTitles: uniq(opts.layoutPlan.praktijkSubparagraphTitles),
      verdiepingSubparagraphTitles: uniq(opts.layoutPlan.verdiepingSubparagraphTitles),
      notes: typeof opts.layoutPlan.notes === "string" ? opts.layoutPlan.notes : null,
    }
    : { praktijkSubparagraphTitles: [], verdiepingSubparagraphTitles: [], notes: null };

  // Avoid overlaps (prefer keeping praktijk)
  plan.verdiepingSubparagraphTitles = plan.verdiepingSubparagraphTitles.filter((t) => !plan.praktijkSubparagraphTitles.includes(t));

  const pick = (preferredIndex: number, avoid: Set<string>): string | null => {
    const n = titles.length;
    const start = Math.max(0, Math.min(n - 1, Math.floor(preferredIndex)));
    for (let delta = 0; delta < n; delta++) {
      for (const idx of [start + delta, start - delta]) {
        if (idx < 0 || idx >= n) continue;
        const t = titles[idx];
        if (!t) continue;
        if (avoid.has(t)) continue;
        return t;
      }
    }
    return null;
  };

  const used = new Set<string>([...plan.praktijkSubparagraphTitles, ...plan.verdiepingSubparagraphTitles]);

  // Hard requirement for this system: ensure at least one praktijk + one verdieping across the chapter.
  // (The section generator enforces presence when targets are provided.)
  if (plan.praktijkSubparagraphTitles.length === 0) {
    const t = pick(Math.floor(titles.length / 3), used);
    if (t) {
      plan.praktijkSubparagraphTitles.push(t);
      used.add(t);
    }
  }
  if (plan.verdiepingSubparagraphTitles.length === 0) {
    const t = pick(Math.floor((titles.length * 2) / 3), used);
    if (t) {
      plan.verdiepingSubparagraphTitles.push(t);
      used.add(t);
    }
  }

  return plan;
}

async function planChapterLayout(opts: {
  provider: Provider;
  model: string;
  bookTitle: string;
  topic: string;
  language: string;
  level: "n3" | "n4";
  outline: ChapterOutline;
  profile: ChapterLayoutProfile;
}): Promise<ChapterLayoutPlan | null> {
  const candidatesCount = opts.outline.sections.reduce(
    (sum, s) => sum + (Array.isArray(s.numberedSubparagraphTitles) ? s.numberedSubparagraphTitles.length : 0),
    0,
  );
  if (candidatesCount <= 0) return null;
  const system = buildLayoutPlannerSystem({ language: opts.language, level: opts.level });
  const prompt = buildLayoutPlannerPrompt({
    bookTitle: opts.bookTitle,
    topic: opts.topic,
    outline: opts.outline,
    profile: opts.profile,
  });
  const raw = await llmGenerateJson({
    provider: opts.provider,
    model: opts.model,
    system,
    prompt,
    maxTokens: 1200,
    tool: TOOL_PLAN_CHAPTER_LAYOUT,
  });
  return sanitizeLayoutPlan(raw, opts.outline);
}

function pickTargetsForSection(opts: {
  outline: ChapterOutline | null;
  layoutPlan: ChapterLayoutPlan | null;
  sectionIndex: number;
}): { praktijkTargets: string[]; verdiepingTargets: string[] } {
  const section = opts.outline?.sections?.[opts.sectionIndex];
  const allowed = new Set<string>(
    Array.isArray(section?.numberedSubparagraphTitles)
      ? section.numberedSubparagraphTitles.map((t) => normalizeWs(t)).filter(Boolean)
      : [],
  );
  const take = (arr: string[]): string[] => {
    const out: string[] = [];
    for (const t of arr) {
      const tt = normalizeWs(t);
      if (!tt) continue;
      if (!allowed.has(tt)) continue;
      if (!out.includes(tt)) out.push(tt);
    }
    return out;
  };
  return {
    praktijkTargets: opts.layoutPlan ? take(opts.layoutPlan.praktijkSubparagraphTitles) : [],
    verdiepingTargets: opts.layoutPlan ? take(opts.layoutPlan.verdiepingSubparagraphTitles) : [],
  };
}

export class BookGenerateChapter implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { payload, jobId } = context;
    const p = (payload || {}) as Record<string, unknown>;

    const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const organizationId = requireString(p, "organization_id");
    const bookId = requireString(p, "bookId");
    const bookVersionId = requireString(p, "bookVersionId");
    const chapterIndexRaw = requireNumber(p, "chapterIndex");
    const chapterCountRaw = requireNumber(p, "chapterCount");
    const chapterIndex = Math.floor(chapterIndexRaw);
    const chapterCount = Math.floor(chapterCountRaw);
    if (chapterIndexRaw !== chapterIndex || chapterCountRaw !== chapterCount) {
      throw new Error("BLOCKED: chapterIndex and chapterCount must be integers");
    }
    if (chapterCount < 1 || chapterCount > 50) {
      throw new Error("BLOCKED: chapterCount must be between 1 and 50");
    }
    if (chapterIndex < 0) throw new Error("BLOCKED: chapterIndex must be >= 0");
    if (chapterIndex >= chapterCount) throw new Error(`BLOCKED: chapterIndex out of range (${chapterIndex} >= ${chapterCount})`);

    const topic = requireString(p, "topic");
    const language = requireString(p, "language");
    const level = requireEnum(p.level, ["n3", "n4"] as const, "level");
    const userInstructions = optionalString(p, "userInstructions");

    const imagePromptLanguage: ImagePromptLanguage =
      optionalEnum(p.imagePromptLanguage, ["en", "book"] as const) ?? "en";
    const layoutProfile: ChapterLayoutProfile =
      optionalEnum((p as any).layoutProfile, ["auto", "pass2", "sparse"] as const) ?? "auto";
    const microheadingDensity =
      optionalEnum((p as any).microheadingDensity, ["low", "medium", "high"] as const);

    const writeModel = requireString(p, "writeModel");
    const writeModelSpec = parseModelSpec(writeModel);

    await emitAgentJobEvent(jobId, "generating", 5, `Orchestrating chapter ${chapterIndex + 1}/${chapterCount}`, {
      bookId,
      bookVersionId,
      chapterIndex,
      writeModel: `${writeModelSpec.provider}:${writeModelSpec.model}`,
      layoutProfile,
    }).catch(() => {});

    // Orchestrator state (persisted via yield/requeue in ai-job-runner)
    const nowIso = new Date().toISOString();
    const orchestratorStartedAt =
      typeof (p as any).orchestratorStartedAt === "string" && String((p as any).orchestratorStartedAt).trim()
        ? String((p as any).orchestratorStartedAt).trim()
        : nowIso;
    const attemptsPrev =
      typeof (p as any).orchestratorAttempts === "number" && Number.isFinite((p as any).orchestratorAttempts)
        ? Math.max(0, Math.floor((p as any).orchestratorAttempts))
        : 0;
    const attempts = attemptsPrev + 1;
    const MAX_ATTEMPTS = 80;
    if (attempts > MAX_ATTEMPTS) {
      throw new Error(`BLOCKED: Chapter orchestrator exceeded max attempts (${MAX_ATTEMPTS}). Human review required.`);
    }
    const startedAtMs = Date.parse(orchestratorStartedAt);
    if (Number.isFinite(startedAtMs)) {
      const elapsedMs = Date.now() - startedAtMs;
      const MAX_WALL_MS = 45 * 60 * 1000;
      if (elapsedMs > MAX_WALL_MS) {
        throw new Error("BLOCKED: Chapter orchestrator exceeded max wall time (45 minutes). Human review required.");
      }
    }

    const nextSectionIndexPrev =
      typeof (p as any).nextSectionIndex === "number" && Number.isFinite((p as any).nextSectionIndex)
        ? Math.max(0, Math.floor((p as any).nextSectionIndex))
        : 0;
    const pendingSectionJobId =
      typeof (p as any).pendingSectionJobId === "string" ? String((p as any).pendingSectionJobId).trim() : "";
    const pendingSectionIndex =
      typeof (p as any).pendingSectionIndex === "number" && Number.isFinite((p as any).pendingSectionIndex)
        ? Math.max(0, Math.floor((p as any).pendingSectionIndex))
        : null;

    // 1) Load skeleton (for section count + outline)
    const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
    const skRaw = await downloadJson(adminSupabase, "books", skeletonPath);
    const v0 = validateBookSkeleton(skRaw);
    if (!v0.ok) throw new Error(`BLOCKED: Existing skeleton is invalid (${v0.issues.length} issue(s))`);
    const sk: BookSkeletonV1 = v0.skeleton;
    const chapters = Array.isArray((sk as any).chapters) ? (sk as any).chapters : [];
    const existingChapter = chapters[chapterIndex] as any;
    if (!existingChapter) throw new Error(`BLOCKED: Skeleton missing chapter at index ${chapterIndex}`);
    const sectionCount = Array.isArray(existingChapter?.sections) ? existingChapter.sections.length : 0;
    if (sectionCount <= 0) throw new Error("BLOCKED: Skeleton chapter has no sections; cannot run sectioned generation.");
    const outline = extractOutlineFromSkeletonChapter(existingChapter, chapterIndex + 1);

    // 2) Layout planning (once): stored in payload so we don't re-plan every tick.
    let layoutPlan: ChapterLayoutPlan | null = null;
    if (outline && Array.isArray(outline.sections) && outline.sections.length) {
      if ((p as any).layoutPlan && typeof (p as any).layoutPlan === "object") {
        layoutPlan = sanitizeLayoutPlan((p as any).layoutPlan, outline);
      }
      if (!layoutPlan) {
        await emitAgentJobEvent(jobId, "generating", 15, "Planning layout (praktijk/verdieping)", { layoutProfile }).catch(() => {});
        const { data: bookRow, error: bookErr } = await adminSupabase.from("books").select("title").eq("id", bookId).single();
        if (bookErr || !bookRow) throw new Error(bookErr?.message || "Book not found");
        const bookTitle = String((bookRow as any).title || "").trim();
        try {
          layoutPlan = await planChapterLayout({
            provider: writeModelSpec.provider,
            model: writeModelSpec.model,
            bookTitle,
            topic,
            language,
            level,
            outline,
            profile: layoutProfile,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await emitAgentJobEvent(jobId, "generating", 18, "Layout plan failed (continuing without plan)", {
            layoutProfile,
            error: msg.slice(0, 600),
          }).catch(() => {});
          layoutPlan = null;
        }
      }
    }

    if (outline && Array.isArray(outline.sections) && outline.sections.length) {
      const before = layoutPlan;
      layoutPlan = ensureMinimumBoxSelections({ outline, layoutPlan, profile: layoutProfile });
      const addedPraktijk = (before?.praktijkSubparagraphTitles?.length || 0) === 0 && (layoutPlan?.praktijkSubparagraphTitles?.length || 0) > 0;
      const addedVerd = (before?.verdiepingSubparagraphTitles?.length || 0) === 0 && (layoutPlan?.verdiepingSubparagraphTitles?.length || 0) > 0;
      if (addedPraktijk || addedVerd) {
        await emitAgentJobEvent(jobId, "generating", 19, "Layout plan augmented to ensure praktijk/verdieping coverage", {
          addedPraktijk,
          addedVerdieping: addedVerd,
        }).catch(() => {});
      }
    }

    const baseNextPayload: Record<string, unknown> = {
      bookId,
      bookVersionId,
      chapterIndex,
      chapterCount,
      topic,
      level,
      language,
      userInstructions,
      imagePromptLanguage,
      layoutProfile,
      ...(microheadingDensity ? { microheadingDensity } : {}),
      writeModel,
      orchestratorStartedAt,
      orchestratorAttempts: attempts,
      nextSectionIndex: nextSectionIndexPrev,
      ...(layoutPlan ? { layoutPlan } : {}),
      ...(typeof p.sectionMaxTokens === "number" && Number.isFinite(p.sectionMaxTokens) ? { sectionMaxTokens: Math.floor(p.sectionMaxTokens) } : {}),
    };

    // 3) Waiting on a section job?
    if (pendingSectionJobId) {
      const { data: secJob, error: secErr } = await adminSupabase
        .from("ai_agent_jobs")
        .select("id,status,error")
        .eq("id", pendingSectionJobId)
        .maybeSingle();
      if (secErr) throw new Error(`BLOCKED: Failed to load pending section job: ${secErr.message}`);
      if (!secJob?.id) throw new Error("BLOCKED: Pending section job not found");
      const st = String((secJob as any).status || "");
      if (st === "failed") {
        const errMsg = typeof (secJob as any).error === "string" ? String((secJob as any).error) : "Unknown error";
        throw new Error(`BLOCKED: Section job failed (${pendingSectionJobId}): ${errMsg}`);
      }
      if (st !== "done") {
        return {
          yield: true,
          message: `Waiting for section job ${pendingSectionJobId} (status=${st})`,
          nextPayload: {
            ...baseNextPayload,
            pendingSectionJobId,
            ...(typeof pendingSectionIndex === "number" ? { pendingSectionIndex } : {}),
          },
          meta: { pendingSectionJobId, status: st },
        } satisfies ChapterOrchestratorYield;
      }

      const nextSectionIndex =
        typeof pendingSectionIndex === "number" ? pendingSectionIndex + 1 : nextSectionIndexPrev + 1;
      return {
        yield: true,
        message: `Section ${nextSectionIndexPrev + 1}/${sectionCount} complete; advancing`,
        nextPayload: {
          ...baseNextPayload,
          nextSectionIndex,
          pendingSectionJobId: null,
          pendingSectionIndex: null,
        },
        meta: { nextSectionIndex, sectionCount },
      } satisfies ChapterOrchestratorYield;
    }

    // 4) All sections done -> chain next chapter / finish
    if (nextSectionIndexPrev >= sectionCount) {
      if (chapterIndex < chapterCount - 1) {
        const nextIndex = chapterIndex + 1;
        await emitAgentJobEvent(jobId, "generating", 75, "Enqueuing next chapter job", { nextIndex }).catch(() => {});
        const { data: queued, error: enqueueErr } = await adminSupabase
          .from("ai_agent_jobs")
          .insert({
            organization_id: organizationId,
            job_type: "book_generate_chapter",
            status: "queued",
            payload: {
              bookId,
              bookVersionId,
              chapterIndex: nextIndex,
              chapterCount,
              topic,
              level,
              language,
              userInstructions,
              imagePromptLanguage,
              layoutProfile,
              ...(microheadingDensity ? { microheadingDensity } : {}),
              writeModel,
              ...(typeof p.sectionMaxTokens === "number" && Number.isFinite(p.sectionMaxTokens) ? { sectionMaxTokens: Math.floor(p.sectionMaxTokens) } : {}),
            },
          })
          .select("id")
          .single();
        if (enqueueErr || !queued?.id) throw new Error(enqueueErr?.message || "Failed to enqueue next chapter job");
        await emitAgentJobEvent(jobId, "done", 100, "Chapter complete (next queued)", {
          bookId,
          bookVersionId,
          chapterIndex,
          nextChapterJobId: queued.id,
        }).catch(() => {});
        return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, nextChapterJobId: queued.id };
      }

      await emitAgentJobEvent(jobId, "done", 100, "Book generation complete (all chapters generated)", {
        bookId,
        bookVersionId,
        chapterCount,
      }).catch(() => {});
      return { ok: true, bookId, bookVersionId, chapterIndex, chapterCount, done: true };
    }

    // 5) Enqueue next section job and yield
    const sectionIndexToRun = nextSectionIndexPrev;
    const targets = pickTargetsForSection({ outline, layoutPlan, sectionIndex: sectionIndexToRun });
    const sectionPayload: Record<string, unknown> = {
      bookId,
      bookVersionId,
      chapterIndex,
      sectionIndex: sectionIndexToRun,
      topic,
      level,
      language,
      userInstructions,
      imagePromptLanguage,
      layoutProfile,
      ...(microheadingDensity ? { microheadingDensity } : {}),
      writeModel,
      // Ensure each chapter has at least one image placeholder in the skeleton.
      // We only hard-require it for the first section to avoid over-producing images.
      requireImageSuggestion: sectionIndexToRun === 0,
      ...(typeof p.sectionMaxTokens === "number" && Number.isFinite(p.sectionMaxTokens) ? { sectionMaxTokens: Math.floor(p.sectionMaxTokens) } : {}),
      ...(targets.praktijkTargets.length ? { praktijkTargets: targets.praktijkTargets } : {}),
      ...(targets.verdiepingTargets.length ? { verdiepingTargets: targets.verdiepingTargets } : {}),
    };
    const { data: queuedSection, error: enqueueSectionErr } = await adminSupabase
      .from("ai_agent_jobs")
      .insert({
        organization_id: organizationId,
        job_type: "book_generate_section",
        status: "queued",
        payload: sectionPayload,
      })
      .select("id")
      .single();
    if (enqueueSectionErr || !queuedSection?.id) throw new Error(enqueueSectionErr?.message || "Failed to enqueue section job");

    await emitAgentJobEvent(jobId, "generating", 40, "Section job queued", {
      sectionIndex: sectionIndexToRun,
      sectionJobId: queuedSection.id,
    }).catch(() => {});

    return {
      yield: true,
      message: `Enqueued section job ${queuedSection.id} (section ${sectionIndexToRun + 1}/${sectionCount})`,
      nextPayload: {
        ...baseNextPayload,
        pendingSectionJobId: queuedSection.id,
        pendingSectionIndex: sectionIndexToRun,
      },
      meta: { pendingSectionJobId: queuedSection.id, pendingSectionIndex: sectionIndexToRun },
    } satisfies ChapterOrchestratorYield;
  }
}

