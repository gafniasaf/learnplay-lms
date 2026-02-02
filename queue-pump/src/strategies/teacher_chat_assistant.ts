import type { JobContext, JobExecutor } from "./types.js";
import { emitAgentJobEvent } from "../job-events.js";
import { parseIntEnv } from "../env.js";
import { generateJson, chat } from "../ai.js";
import {
  buildKdCheck,
  generateEmbedding,
  mergeRecommendations,
  recommendMesModules,
  retrieveMaterialRecommendations,
  retrievePrefix,
  searchCuratedMaterials,
  searchCuratedMaterialsSmart,
  toCuratedRecommendations,
  toLibraryMaterialRecommendations,
  type Citation,
  type UnifiedRecommendation,
} from "../teacher-utils.js";
import { GenerateLessonPlan } from "./generate_lesson_plan.js";
import { GenerateMultiWeekPlan } from "./generate_multi_week_plan.js";

const MIN_SIMILARITY = 0.25;
const MES_TEST_PREFIX = "mes:e2e-";

type ChatMessage = { role: "user" | "assistant"; content: string };
type JobScope = "materials" | "mes" | "all";

type PlanRoute = {
  kind: "multi_week_plan" | "lesson_plan" | "other";
  weeks: number | null;
  hoursPerWeek: number | null;
  level: "n3" | "n4" | "combi" | null;
  confidence: number | null;
};

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw) {
    const obj = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
    const role = obj.role;
    const content = obj.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.trim() });
  }
  return out;
}

function latestUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages.length ? messages[messages.length - 1].content : "";
}

function parseJsonBestEffort(text: string): any | null {
  if (!text) return null;
  let t = String(text || "").trim();
  if (!t) return null;
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  t = t.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function routeWithLLM(args: { queryText: string; timeoutMs: number }): Promise<PlanRoute> {
  const queryText = String(args.queryText || "").trim();
  const fallback: PlanRoute = { kind: "other", weeks: null, hoursPerWeek: null, level: null, confidence: 0.0 };
  if (!queryText) return fallback;

  const system = [
    "Je bent een router voor een docent-assistent.",
    "Doel: bepaal of de docent een (a) meerweekse lessenserie, (b) een enkel lesplan, of (c) iets anders vraagt.",
    "Wees tolerant voor typefouten.",
    "Output ALLEEN geldige JSON. Geen markdown. Geen uitleg.",
  ].join("\n");

  const prompt = [
    `Vraag: ${queryText}`,
    "",
    "Return JSON met exact dit schema:",
    '{ "kind": "multi_week_plan" | "lesson_plan" | "other", "weeks": number|null, "hoursPerWeek": number|null, "level": "n3"|"n4"|"combi"|null, "confidence": number|null }',
    "",
    "Regels:",
    "- Als de vraag gaat over een lessenserie/weekplanning/programma over meerdere weken -> kind=multi_week_plan.",
    "- Als de vraag gaat over één les -> kind=lesson_plan.",
    "- Anders -> kind=other.",
    "- Als weken niet expliciet is: weeks=null.",
    "- Als uren/minuten per week niet expliciet is: hoursPerWeek=null.",
    "- Als niveau (n3/n4/combi) niet expliciet is: level=null.",
    "- confidence is 0..1 (schatting).",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateJson({
      system,
      prompt,
      maxTokens: 260,
      temperature: 0,
      timeoutMs: Math.max(2_000, Math.floor(args.timeoutMs)),
      prefillJson: true,
    });
    if (!res.ok) continue;
    const parsed = parseJsonBestEffort(res.text);
    if (!parsed || typeof parsed !== "object") continue;

    const kindRaw = String((parsed as any).kind || "").trim();
    const kind: PlanRoute["kind"] =
      kindRaw === "multi_week_plan" || kindRaw === "lesson_plan" || kindRaw === "other" ? (kindRaw as any) : "other";

    const weeksRaw = (parsed as any).weeks;
    const hoursRaw = (parsed as any).hoursPerWeek;
    const levelRaw = (parsed as any).level;
    const confidenceRaw = (parsed as any).confidence;

    const weeks = typeof weeksRaw === "number" && Number.isFinite(weeksRaw) ? weeksRaw : null;
    const hoursPerWeek = typeof hoursRaw === "number" && Number.isFinite(hoursRaw) ? hoursRaw : null;
    const level: PlanRoute["level"] = levelRaw === "n3" || levelRaw === "n4" || levelRaw === "combi" ? levelRaw : null;
    const confidence =
      typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null;

    return { kind, weeks, hoursPerWeek, level, confidence };
  }

  return fallback;
}

function clampWeeks(v: number | null): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 9;
  return Math.max(2, Math.min(18, n));
}

function clampHours(v: number | null): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Number(v) : 2;
  return Math.max(0.5, Math.min(8, n));
}

function clampScope(v: unknown): JobScope {
  const s = String(v || "").trim().toLowerCase();
  return s === "materials" || s === "mes" || s === "all" ? (s as JobScope) : "all";
}

function clampLevel(v: unknown): "n3" | "n4" | "combi" {
  const s = String(v || "").trim().toLowerCase();
  return s === "n4" ? "n4" : s === "combi" ? "combi" : "n3";
}

async function executeChatAnswer(args: {
  jobId: string;
  organizationId: string;
  queryText: string;
  messages: ChatMessage[];
  scope: JobScope;
  materialId: string;
  topK: number;
}): Promise<unknown> {
  const jobId = args.jobId;
  const organizationId = args.organizationId;
  const queryText = args.queryText;

  await emitAgentJobEvent(jobId, "generating", 10, "Analyzing question", { step: "chat_answer" }).catch(() => {});

  const allowMes = args.scope !== "materials";
  const allowCurated = args.scope !== "mes";
  const allowLibrary = args.scope !== "mes";

  // Best-effort citations/recommendations using embeddings (if configured).
  let citations: Citation[] = [];
  let recommendations: UnifiedRecommendation[] = [];
  let embeddingOk = false;

  const OPENAI_API_KEY = typeof process.env.OPENAI_API_KEY === "string" ? process.env.OPENAI_API_KEY.trim() : "";
  const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

  if (OPENAI_API_KEY) {
    try {
      const embedding = await generateEmbedding(queryText, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });
      embeddingOk = true;

      await emitAgentJobEvent(jobId, "enriching", 25, "Retrieving citations", { step: "citations" }).catch(() => {});

      if (args.scope === "materials") {
        const prefix = args.materialId ? `material:${args.materialId}` : "material:";
        citations = await retrievePrefix({ organizationId, prefix, embedding, limit: args.topK });
      } else if (args.scope === "mes") {
        citations = await retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: args.topK });
      } else {
        const perSource = Math.ceil(args.topK / 3) + 2;
        const [mat, mes, book] = await Promise.all([
          retrievePrefix({ organizationId, prefix: args.materialId ? `material:${args.materialId}` : "material:", embedding, limit: perSource }),
          retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: perSource }),
          retrievePrefix({ organizationId, prefix: "book:", embedding, limit: perSource }),
        ]);
        citations = [...mat, ...mes, ...book].sort((a, b) => b.similarity - a.similarity).slice(0, args.topK);
      }

      citations = citations.filter((c) => {
        if (!Number.isFinite(c.similarity) || c.similarity < MIN_SIMILARITY) return false;
        if (c.source === "mes" && String(c.course_id || "").toLowerCase().startsWith(MES_TEST_PREFIX)) return false;
        return true;
      });

      await emitAgentJobEvent(jobId, "enriching", 35, "Building recommendations", { step: "recommendations" }).catch(() => {});

      const curatedBase = allowCurated
        ? await searchCuratedMaterialsSmart({ organizationId, queryText, limit: 24, timeoutMs: 25_000 })
        : [];
      const curatedRecommendations = allowCurated ? toCuratedRecommendations(curatedBase) : [];

      const [libraryRaw, mesRecommendations] = await Promise.all([
        allowLibrary ? retrieveMaterialRecommendations({ organizationId, embedding, limit: 6 }) : Promise.resolve([]),
        allowMes ? recommendMesModules({ organizationId, embedding, limit: 6 }) : Promise.resolve([]),
      ]);
      const libraryRecommendations = toLibraryMaterialRecommendations(libraryRaw);
      recommendations = mergeRecommendations([curatedRecommendations, mesRecommendations, libraryRecommendations], 12);
    } catch {
      embeddingOk = false;
    }
  }

  await emitAgentJobEvent(jobId, "generating", 55, "Drafting answer", { step: "answer" }).catch(() => {});

  const citationContext = citations.slice(0, 8).map((c) => `- [${c.source}] ${c.course_id} (sim=${c.similarity.toFixed(2)}): ${c.text}`).join("\n");
  const recContext = recommendations
    .slice(0, 10)
    .map((r: any) => `- [${String(r.source || "material")}] ${String(r.title || r.id || "")}`.trim())
    .filter(Boolean)
    .join("\n");

  const system = [
    "Je bent e-Xpert SAM, een docent-assistent voor MBO Verpleegkunde/VIG.",
    "Antwoord in helder, praktisch Nederlands.",
    "Als je bronnen/context hebt, verwijs er kort naar (zonder te hallucineren).",
    "Als iets onduidelijk is: stel 1 gerichte verduidelijkingsvraag.",
  ].join("\n");

  const extra = [
    embeddingOk ? "Context (citaten):\n" + (citationContext || "(geen)") : "Context (citaten): (embedding niet beschikbaar)",
    "Aanbevelingen:\n" + (recContext || "(geen)"),
  ].join("\n\n");

  const response = await chat({
    system,
    messages: [
      { role: "user", content: `${queryText}\n\n${extra}` },
    ],
    maxTokens: 900,
    temperature: 0.4,
    timeoutMs: parseIntEnv("QUEUE_PUMP_LLM_TIMEOUT_MS", 180_000, 10_000, 45 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`teacher_chat_answer_failed:${response.error}`);
  }

  const kdCheck = buildKdCheck(extractKdCode(queryText));

  await emitAgentJobEvent(jobId, "done", 100, "Teacher chat response ready", {
    step: "chat_answer",
    citations: citations.length,
    recommendations: recommendations.length,
  }).catch(() => {});

  const recSentence = embeddingOk
    ? recommendations.length
      ? `Ik heb ook ${recommendations.length} relevante bronnen gevonden.`
      : "Ik heb geen bronnen gevonden die direct matchen—probeer een concretere zoekterm."
    : "Ik kon geen automatische bron-aanbevelingen ophalen (embedding-service niet beschikbaar).";

  return {
    ok: true,
    jobId,
    answer: `${response.text.trim()}\n\n${recSentence}`.trim(),
    citations: citations.slice(0, 12),
    recommendations,
    kdCheck: kdCheck?.items?.length ? kdCheck : undefined,
  };
}

function extractKdCode(queryText: string): string {
  const m = String(queryText || "").toUpperCase().match(/\b[BPL]\d-\w\d-\w\d\b/);
  return m ? String(m[0]) : "";
}

/**
 * Manual strategy for `teacher_chat_assistant`.
 *
 * This job is the ONLY thing `teacher-chat-assistant` Edge Function does:
 * enqueue it quickly, then the worker routes + generates asynchronously.
 */
export class TeacherChatAssistant implements JobExecutor {
  private multiWeek = new GenerateMultiWeekPlan();
  private lessonPlan = new GenerateLessonPlan();

  async execute(context: JobContext): Promise<unknown> {
    const jobId = context.jobId;
    const payload = isRecord(context.payload) ? context.payload : {};
    const organizationId = safeString(payload.organization_id).trim();
    if (!organizationId) throw new Error("Invalid job payload: missing organization_id");

    const delegate = safeString((payload as any).delegate).trim();

    if (delegate === "generate_multi_week_plan") {
      return await this.multiWeek.execute(context);
    }
    if (delegate === "generate_lesson_plan") {
      return await this.lessonPlan.execute(context);
    }
    if (delegate === "chat_answer") {
      const messages = parseMessages(payload.messages);
      const queryText = safeString(payload.queryText).trim() || latestUserMessage(messages);
      const scope = clampScope(payload.scope);
      const materialId = safeString(payload.materialId).trim();
      const topK = Math.min(20, Math.max(3, Math.floor(safeNumber(payload.topK) ?? 8)));
      if (!queryText) throw new Error("BLOCKED: Missing queryText (or messages) for teacher chat");

      return await executeChatAnswer({
        jobId,
        organizationId,
        queryText,
        messages,
        scope,
        materialId,
        topK,
      });
    }

    // No delegate yet: route with LLM (typo tolerant).
    const messages = parseMessages(payload.messages);
    const queryText = safeString(payload.queryText).trim() || latestUserMessage(messages);
    if (!queryText) throw new Error("BLOCKED: Missing queryText (or messages) for teacher chat");

    const scope = clampScope(payload.scope);
    const materialId = safeString(payload.materialId).trim();
    const topK = Math.min(20, Math.max(3, Math.floor(safeNumber(payload.topK) ?? 8)));

    await emitAgentJobEvent(jobId, "generating", 3, "Routing request (LLM)", {
      step: "route",
    }).catch(() => {});

    const routerTimeout = parseIntEnv("QUEUE_PUMP_ROUTER_TIMEOUT_MS", 12_000, 2_000, 60_000);
    const route = await routeWithLLM({ queryText, timeoutMs: routerTimeout });

    if (route.kind === "multi_week_plan") {
      const weeks = clampWeeks(route.weeks);
      const hoursPerWeek = clampHours(route.hoursPerWeek);
      const level = clampLevel(route.level);
      await emitAgentJobEvent(jobId, "generating", 5, `Routed to multi-week plan (${weeks}w, ${hoursPerWeek}h/w, ${level})`, {
        step: "route",
        kind: route.kind,
        confidence: route.confidence,
      }).catch(() => {});
      return {
        yield: true,
        message: "Routing complete; starting multi-week plan generation",
        payloadPatch: {
          delegate: "generate_multi_week_plan",
          step: "init",
          queryText,
          messages,
          scope,
          materialId,
          topK,
          weeks,
          hoursPerWeek,
          level,
        },
      };
    }

    if (route.kind === "lesson_plan") {
      await emitAgentJobEvent(jobId, "generating", 5, "Routed to lesson plan generation", {
        step: "route",
        kind: route.kind,
        confidence: route.confidence,
      }).catch(() => {});
      return {
        yield: true,
        message: "Routing complete; starting lesson plan generation",
        payloadPatch: {
          delegate: "generate_lesson_plan",
          step: "init",
          queryText,
          messages,
          scope,
          materialId,
          topK,
        },
      };
    }

    await emitAgentJobEvent(jobId, "generating", 5, "Routed to teacher chat answer", {
      step: "route",
      kind: "other",
      confidence: route.confidence,
    }).catch(() => {});

    return {
      yield: true,
      message: "Routing complete; drafting answer",
      payloadPatch: {
        delegate: "chat_answer",
        step: "init",
        queryText,
        messages,
        scope,
        materialId,
        topK,
      },
    };
  }
}

