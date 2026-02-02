import type { JobContext, JobExecutor } from "./types.js";
import { emitAgentJobEvent } from "../job-events.js";
import { parseIntEnv } from "../env.js";
import {
  fetchMaterialContent,
  generateEmbedding,
  generateLessonPlan,
  mergeRecommendations,
  pickRelevantCuratedMaterials,
  recommendMesModules,
  requireEnv,
  retrieveMaterialRecommendations,
  retrievePrefix,
  searchCuratedMaterials,
  searchCuratedMaterialsSmart,
  toCuratedRecommendations,
  toLibraryMaterialRecommendations,
  buildKdCheck,
  type Citation,
  type CuratedMaterialResult,
  type LessonPlan,
  type UnifiedRecommendation,
} from "../teacher-utils.js";

const MIN_SIMILARITY = 0.25;
const MES_TEST_PREFIX = "mes:e2e-";

type ChatMessage = { role: "user" | "assistant"; content: string };

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

function isAbortTimeout(err: unknown): boolean {
  const name =
    err && typeof err === "object" && "name" in err && typeof (err as any).name === "string"
      ? String((err as any).name)
      : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const s = `${name} ${msg}`.toLowerCase();
  return s.includes("abort") || s.includes("timeout") || s.includes("timed out");
}

type LessonPlanJobScope = "materials" | "mes" | "all";
type LessonPlanJobStep = "init" | "search" | "plan" | "finalize";

type LessonPlanJobState = {
  step: LessonPlanJobStep;
  queryText: string;
  scope: LessonPlanJobScope;
  materialId: string;
  topK: number;
  lessonPlanMaterials?: CuratedMaterialResult[];
  materialContentForPlan?: string;
  lessonPlan?: LessonPlan;
  kdCheck?: unknown;
  searchAttempts?: number;
  planAttempts?: number;
  finalizeAttempts?: number;
};

function readState(payload: Record<string, unknown>): LessonPlanJobState {
  const stepRaw = safeString(payload.step, "init").toLowerCase();
  const step: LessonPlanJobStep =
    stepRaw === "search" || stepRaw === "plan" || stepRaw === "finalize" ? (stepRaw as LessonPlanJobStep) : "init";

  const messages = parseMessages(payload.messages);
  const queryText = safeString(payload.queryText).trim() || latestUserMessage(messages);

  const scopeRaw = safeString(payload.scope, "all").trim().toLowerCase();
  const scope: LessonPlanJobScope =
    scopeRaw === "materials" || scopeRaw === "mes" || scopeRaw === "all" ? (scopeRaw as LessonPlanJobScope) : "all";

  const materialId = safeString(payload.materialId).trim();
  const topK = Math.min(20, Math.max(3, safeNumber(payload.topK) ? Math.floor(safeNumber(payload.topK)!) : 8));

  const lessonPlanMaterials = Array.isArray(payload.lessonPlanMaterials) ? (payload.lessonPlanMaterials as any[]) : null;
  const materialContentForPlan = safeString(payload.materialContentForPlan).trim();
  const lessonPlan = payload.lessonPlan && typeof payload.lessonPlan === "object" ? (payload.lessonPlan as any) : null;

  return {
    step,
    queryText,
    scope,
    materialId,
    topK,
    lessonPlanMaterials: lessonPlanMaterials ? (lessonPlanMaterials as any as CuratedMaterialResult[]) : undefined,
    materialContentForPlan: materialContentForPlan || undefined,
    lessonPlan: lessonPlan ? (lessonPlan as LessonPlan) : undefined,
    kdCheck: payload.kdCheck,
    searchAttempts: safeNumber(payload.searchAttempts) ? Math.max(0, Math.floor(safeNumber(payload.searchAttempts)!)) : 0,
    planAttempts: safeNumber(payload.planAttempts) ? Math.max(0, Math.floor(safeNumber(payload.planAttempts)!)) : 0,
    finalizeAttempts: safeNumber(payload.finalizeAttempts) ? Math.max(0, Math.floor(safeNumber(payload.finalizeAttempts)!)) : 0,
  };
}

/**
 * Manual strategy for `generate_lesson_plan`.
 *
 * NOTE: This file is intentionally NOT auto-generated and will be preferred by
 * the scaffolded registry when present.
 */
export class GenerateLessonPlan implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const jobId = context.jobId;
    const payload = isRecord(context.payload) ? context.payload : {};
    const organizationId = safeString(payload.organization_id).trim();
    if (!organizationId) {
      throw new Error("Invalid job payload: missing organization_id");
    }

    const state = readState(payload);
    if (!state.queryText) {
      throw new Error("BLOCKED: Missing queryText (or messages) for lesson plan generation");
    }

    const LLM_TIMEOUT_MS = parseIntEnv("QUEUE_PUMP_LLM_TIMEOUT_MS", 180_000, 10_000, 600_000);

    if (state.step === "init") {
      await emitAgentJobEvent(jobId, "generating", 5, "Initializing lesson plan job", {
        step: "init",
      }).catch(() => {});

      return {
        yield: true,
        message: "Starting material search",
        payloadPatch: {
          step: "search",
          queryText: state.queryText,
          scope: state.scope,
          materialId: state.materialId,
          topK: state.topK,
          searchAttempts: 0,
          planAttempts: 0,
          finalizeAttempts: 0,
        },
      };
    }

    if (state.step === "search") {
      const attempt = (state.searchAttempts ?? 0) + 1;
      await emitAgentJobEvent(jobId, "generating", 15, `Searching materials (attempt ${attempt})`, {
        step: "search",
        attempt,
      }).catch(() => {});

      try {
        const candidates = await searchCuratedMaterialsSmart({
          organizationId,
          queryText: state.queryText,
          limit: 24,
          timeoutMs: 25_000,
        });

        const lessonPlanMaterials = await pickRelevantCuratedMaterials({
          queryText: state.queryText,
          candidates,
          limit: 3,
          timeoutMs: 25_000,
        });

        const approvedTitles = lessonPlanMaterials
          .map((m) => (typeof m.title === "string" ? m.title.trim() : ""))
          .filter((t) => t);

        const approvedList = approvedTitles.length
          ? ["GOEDGEKEURDE MATERIALEN (kies alleen uit deze lijst; gebruik exacte titels; verzin niets):", ...approvedTitles.map((t) => `- ${t}`), ""].join("\n")
          : "";

        // Quality-first: fetch content from up to 2 selected curated materials (bounded).
        let materialContentForPlan = approvedList;
        const top = lessonPlanMaterials.slice(0, 2);
        if (top.length) {
          const chunks: string[] = [];
          for (const m of top) {
            if (!m.storage_bucket || !m.storage_path) continue;
            const content = await fetchMaterialContent({
              storageBucket: m.storage_bucket,
              storagePath: m.storage_path,
              maxLength: 2500,
            });
            if (!content) continue;
            chunks.push(`[${m.title}]\n${content}`);
          }
          materialContentForPlan = [approvedList, chunks.join("\n\n---\n\n")].filter(Boolean).join("\n\n");
        }

        await emitAgentJobEvent(jobId, "generating", 30, "Materials retrieved", {
          step: "search",
          curatedCount: lessonPlanMaterials.length,
          hasMaterialContent: !!materialContentForPlan,
        }).catch(() => {});

        return {
          yield: true,
          message: "Materials ready; generating lesson plan",
          payloadPatch: {
            step: "plan",
            lessonPlanMaterials,
            materialContentForPlan: materialContentForPlan || null,
            searchAttempts: attempt,
          },
        };
      } catch (e) {
        if (attempt < 3 && isAbortTimeout(e)) {
          await emitAgentJobEvent(jobId, "generating", 18, "Search timed out; requeueing", {
            step: "search",
            attempt,
          }).catch(() => {});
          return {
            yield: true,
            message: "Search timed out; retrying via requeue",
            payloadPatch: { searchAttempts: attempt },
          };
        }
        throw e;
      }
    }

    if (state.step === "plan") {
      const attempt = (state.planAttempts ?? 0) + 1;
      await emitAgentJobEvent(jobId, "generating", 45, `Generating lesson plan (attempt ${attempt})`, {
        step: "plan",
        attempt,
      }).catch(() => {});

      try {
        const lessonPlan = await generateLessonPlan({
          queryText: state.queryText,
          materialContent: state.materialContentForPlan,
          timeoutMs: LLM_TIMEOUT_MS,
        });

        // Enforce: lessonPlan.materials can only reference approved curated titles (if any).
        const approvedTitles = (Array.isArray(state.lessonPlanMaterials) ? state.lessonPlanMaterials : [])
          .map((m: any) => String(m?.title || "").trim())
          .filter((t: string) => t);
        const approvedByNorm = new Map<string, string>(approvedTitles.map((t) => [t.toLowerCase(), t]));
        const selected = Array.isArray((lessonPlan as any)?.materials) ? (lessonPlan as any).materials : [];
        const selectedNorm = selected.map((m: any) => String(m || "").trim()).filter((m: string) => m);

        if (approvedTitles.length === 0) {
          if (selectedNorm.length) {
            throw new Error(`BLOCKED: Lesson plan referenced materials but no approved materials were provided: ${selectedNorm.join(" | ")}`);
          }
        } else {
          const unknown = selectedNorm.filter((m: string) => !approvedByNorm.has(m.toLowerCase()));
          if (unknown.length) {
            throw new Error(`BLOCKED: Lesson plan referenced non-approved materials: ${unknown.join(" | ")}`);
          }
          if (selectedNorm.length === 0) {
            throw new Error("BLOCKED: Lesson plan did not select any approved materials");
          }
          const scriptText = (lessonPlan.teacherScript || [])
            .map((s: any) => `${String(s?.action || "")} ${String(s?.content || "")}`)
            .join(" ")
            .toLowerCase();
          const canonicalSelected = selectedNorm.map((m: string) => approvedByNorm.get(m.toLowerCase()) || m);
          const hasAnyReference = canonicalSelected.some((m: string) => scriptText.includes(m.toLowerCase()));
          if (!hasAnyReference) {
            throw new Error("BLOCKED: Lesson plan did not reference selected materials in teacherScript");
          }
          // Normalize to canonical titles
          (lessonPlan as any).materials = canonicalSelected;
        }

        const kdCheck = buildKdCheck(lessonPlan.kdAlignment.code);

        await emitAgentJobEvent(jobId, "generating", 65, "Lesson plan generated", {
          step: "plan",
          kdCode: (lessonPlan as any)?.kdAlignment?.code,
        }).catch(() => {});

        return {
          yield: true,
          message: "Lesson plan ready; finalizing recommendations",
          payloadPatch: {
            step: "finalize",
            lessonPlan,
            kdCheck,
            planAttempts: attempt,
            // Drop large content to keep payload small going forward
            materialContentForPlan: null,
          },
        };
      } catch (e) {
        if (attempt < 3 && isAbortTimeout(e)) {
          await emitAgentJobEvent(jobId, "generating", 48, "LLM timed out; requeueing", {
            step: "plan",
            attempt,
          }).catch(() => {});
          return {
            yield: true,
            message: "Lesson plan generation timed out; retrying via requeue",
            payloadPatch: { planAttempts: attempt },
          };
        }
        if (attempt < 3) {
          await emitAgentJobEvent(jobId, "generating", 48, "Lesson plan generation failed; requeueing", {
            step: "plan",
            attempt,
            error: e instanceof Error ? e.message : String(e),
          }).catch(() => {});
          return {
            yield: true,
            message: "Lesson plan generation failed; retrying via requeue",
            payloadPatch: { planAttempts: attempt },
          };
        }
        throw e;
      }
    }

    if (state.step === "finalize") {
      const attempt = (state.finalizeAttempts ?? 0) + 1;
      await emitAgentJobEvent(jobId, "generating", 80, `Finalizing (attempt ${attempt})`, {
        step: "finalize",
        attempt,
      }).catch(() => {});

      if (!state.lessonPlan) {
        throw new Error("Invalid job payload: missing lessonPlan for finalize step");
      }

      try {
        const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
        const topK = state.topK;

        // --- curated recommendations (no embedding needed) ---
        const curatedBase = Array.isArray(state.lessonPlanMaterials) ? state.lessonPlanMaterials : [];
        const curatedRecommendations = state.scope !== "mes" ? toCuratedRecommendations(curatedBase) : [];

        // --- embedding-dependent retrieval (optional) ---
        let citations: Citation[] = [];
        let recommendations: UnifiedRecommendation[] = [];
        let counts = { total: 0, curated: curatedRecommendations.length, mes: 0, library: 0 };

        const openAiKey = (process.env.OPENAI_API_KEY || "").trim();
        if (openAiKey) {
          try {
            const embedding = await generateEmbedding(state.queryText, { apiKey: openAiKey, model: embeddingModel });

            // citations
            if (state.scope === "materials") {
              const prefix = state.materialId ? `material:${state.materialId}` : "material:";
              citations = await retrievePrefix({ organizationId, prefix, embedding, limit: topK });
            } else if (state.scope === "mes") {
              citations = await retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: topK });
            } else {
              const perSource = Math.ceil(topK / 3) + 2;
              const [mat, mes, book] = await Promise.all([
                retrievePrefix({
                  organizationId,
                  prefix: state.materialId ? `material:${state.materialId}` : "material:",
                  embedding,
                  limit: perSource,
                }),
                retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: perSource }),
                retrievePrefix({ organizationId, prefix: "book:", embedding, limit: perSource }),
              ]);
              citations = [...mat, ...mes, ...book].sort((a, b) => b.similarity - a.similarity).slice(0, topK);
            }
            citations = citations.filter((c) => {
              if (!Number.isFinite(c.similarity) || c.similarity < MIN_SIMILARITY) return false;
              if (c.source === "mes" && String(c.course_id || "").toLowerCase().startsWith(MES_TEST_PREFIX)) return false;
              return true;
            });

            const allowMes = state.scope !== "materials";
            const allowLibrary = state.scope !== "mes";

            const [libraryRaw, mesRecommendations] = await Promise.all([
              allowLibrary ? retrieveMaterialRecommendations({ organizationId, embedding, limit: 6 }) : Promise.resolve([]),
              allowMes ? recommendMesModules({ organizationId, embedding, limit: 6 }) : Promise.resolve([]),
            ]);
            const libraryRecommendations = toLibraryMaterialRecommendations(libraryRaw);
            recommendations = mergeRecommendations(
              [curatedRecommendations, mesRecommendations, libraryRecommendations],
              12,
            );
            counts = {
              total: recommendations.length,
              curated: curatedRecommendations.length,
              mes: mesRecommendations.length,
              library: libraryRecommendations.length,
            };
          } catch (e) {
            // best-effort: keep curated recs even if embedding fails (invalid key, provider error, etc.)
            const msg = e instanceof Error ? e.message : String(e);
            await emitAgentJobEvent(jobId, "generating", 82, "Embedding/retrieval failed; continuing without citations", {
              step: "finalize",
              error: msg.slice(0, 500),
            }).catch(() => {});
            citations = [];
            recommendations = curatedRecommendations.slice(0, 12);
            counts = { total: recommendations.length, curated: curatedRecommendations.length, mes: 0, library: 0 };
          }
        } else {
          // No OpenAI key available: still return plan + curated matches.
          citations = [];
          recommendations = curatedRecommendations.slice(0, 12);
          counts = { total: recommendations.length, curated: curatedRecommendations.length, mes: 0, library: 0 };
        }

        const lessonPlan = state.lessonPlan;
        const sourceBits = [
          counts.curated ? `${counts.curated} uit de database` : null,
          counts.mes ? `${counts.mes} uit ExpertCollege` : null,
          counts.library ? `${counts.library} uit je eigen materiaal` : null,
        ].filter(Boolean);

        const answer = [
          "Ik heb een lesplan opgesteld dat past bij je vraag.",
          `KD-focus: ${lessonPlan.kdAlignment.code} — ${lessonPlan.kdAlignment.title}.`,
          counts.total
            ? `Ik heb ook ${counts.total} relevante bronnen gevonden (${sourceBits.join(", ")}).`
            : "Ik heb geen bronnen gevonden die direct matchen—probeer een concretere zoekterm.",
          "Bekijk lesplan, materialen en bronnen in het paneel rechts.",
        ].join(" ");

        await emitAgentJobEvent(jobId, "done", 100, "Lesson plan job complete", {
          step: "finalize",
          recommendations: counts,
        }).catch(() => {});

        const qualityFlags = Array.isArray(state.lessonPlan?.qualityFlags)
          ? Array.from(new Set(state.lessonPlan?.qualityFlags))
          : [];

        return {
          ok: true,
          jobId,
          answer,
          citations: citations.slice(0, 12),
          recommendations,
          lessonPlan,
          kdCheck: state.kdCheck ?? buildKdCheck(lessonPlan.kdAlignment.code),
          quality_flags: qualityFlags,
        };
      } catch (e) {
        if (attempt < 3 && isAbortTimeout(e)) {
          await emitAgentJobEvent(jobId, "generating", 85, "Finalize timed out; requeueing", {
            step: "finalize",
            attempt,
          }).catch(() => {});
          return {
            yield: true,
            message: "Finalize timed out; retrying via requeue",
            payloadPatch: { finalizeAttempts: attempt },
          };
        }
        if (attempt < 3) {
          await emitAgentJobEvent(jobId, "generating", 85, "Finalize failed; requeueing", {
            step: "finalize",
            attempt,
            error: e instanceof Error ? e.message : String(e),
          }).catch(() => {});
          return {
            yield: true,
            message: "Finalize failed; retrying via requeue",
            payloadPatch: { finalizeAttempts: attempt },
          };
        }
        throw e;
      }
    }

    throw new Error(`Invalid job payload: unknown step '${String((payload as any).step)}'`);
  }
}

