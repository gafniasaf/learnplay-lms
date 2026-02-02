import type { JobContext, JobExecutor } from "./types.js";
import { emitAgentJobEvent } from "../job-events.js";
import { parseIntEnv } from "../env.js";
import {
  fetchMaterialContent,
  generateEmbedding,
  generateMultiWeekOverview,
  generateWeekPlan,
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
  type Citation,
  type CuratedMaterialResult,
  type MultiWeekLessonPlan,
  type MultiWeekOverview,
  type UnifiedRecommendation,
  type WeekPlan,
} from "../teacher-utils.js";

const MIN_SIMILARITY = 0.25;
const MES_TEST_PREFIX = "mes:e2e-";
const LLM_TIMEOUT_MS = parseIntEnv("QUEUE_PUMP_LLM_TIMEOUT_MS", 180_000, 10_000, 45 * 60 * 1000);

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

type MultiWeekJobScope = "materials" | "mes" | "all";
type MultiWeekJobStep = "init" | "overview" | "week" | "finalize";

type MultiWeekJobState = {
  step: MultiWeekJobStep;
  queryText: string;
  scope: MultiWeekJobScope;
  materialId: string;
  topK: number;
  weeks: number;
  hoursPerWeek: number;
  level: "n3" | "n4" | "combi";
  overview?: MultiWeekOverview;
  plan?: MultiWeekLessonPlan;
  currentWeekIndex?: number;
  overviewAttempts?: number;
  weekAttempts?: number;
  finalizeAttempts?: number;
};

function readState(payload: Record<string, unknown>): MultiWeekJobState {
  const stepRaw = safeString(payload.step, "init").toLowerCase();
  const step: MultiWeekJobStep =
    stepRaw === "overview" || stepRaw === "week" || stepRaw === "finalize" ? (stepRaw as MultiWeekJobStep) : "init";

  const messages = parseMessages(payload.messages);
  const queryText = safeString(payload.queryText).trim() || latestUserMessage(messages);

  const scopeRaw = safeString(payload.scope, "all").trim().toLowerCase();
  const scope: MultiWeekJobScope =
    scopeRaw === "materials" || scopeRaw === "mes" || scopeRaw === "all" ? (scopeRaw as MultiWeekJobScope) : "all";

  const materialId = safeString(payload.materialId).trim();
  const topK = Math.min(20, Math.max(3, safeNumber(payload.topK) ? Math.floor(safeNumber(payload.topK)!) : 8));
  const weeks = Math.max(2, Math.floor(safeNumber(payload.weeks) ?? 9));
  const hoursPerWeek = Math.max(0.5, safeNumber(payload.hoursPerWeek) ?? 2);
  const levelRaw = safeString(payload.level, "n3").trim().toLowerCase();
  const level: "n3" | "n4" | "combi" = levelRaw === "n4" ? "n4" : levelRaw === "combi" ? "combi" : "n3";

  const overview =
    payload.overview && typeof payload.overview === "object" ? (payload.overview as MultiWeekOverview) : undefined;
  const plan = payload.plan && typeof payload.plan === "object" ? (payload.plan as MultiWeekLessonPlan) : undefined;
  const currentWeekIndex = safeNumber(payload.currentWeekIndex)
    ? Math.max(0, Math.floor(safeNumber(payload.currentWeekIndex)!))
    : 0;

  return {
    step,
    queryText,
    scope,
    materialId,
    topK,
    weeks,
    hoursPerWeek,
    level,
    overview,
    plan,
    currentWeekIndex,
    overviewAttempts: safeNumber(payload.overviewAttempts)
      ? Math.max(0, Math.floor(safeNumber(payload.overviewAttempts)!))
      : 0,
    weekAttempts: safeNumber(payload.weekAttempts) ? Math.max(0, Math.floor(safeNumber(payload.weekAttempts)!)) : 0,
    finalizeAttempts: safeNumber(payload.finalizeAttempts)
      ? Math.max(0, Math.floor(safeNumber(payload.finalizeAttempts)!))
      : 0,
  };
}

function buildWeekQuery(queryText: string, overview: { title: string; kdCode: string; keyConcepts: string[] }): string {
  const parts = [queryText, overview.title, overview.kdCode, ...(overview.keyConcepts || [])]
    .map((p) => String(p || "").trim())
    .filter((p) => p);
  return parts.join(" ");
}

function upsertWeek(plan: MultiWeekLessonPlan, index: number, weekPlan: WeekPlan): MultiWeekLessonPlan {
  const nextWeeks = Array.isArray(plan.weeks) ? [...plan.weeks] : [];
  nextWeeks[index] = weekPlan;
  return { ...plan, weeks: nextWeeks };
}

/**
 * Manual strategy for `generate_multi_week_plan`.
 */
export class GenerateMultiWeekPlan implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const jobId = context.jobId;
    const payload = isRecord(context.payload) ? context.payload : {};
    const organizationId = safeString(payload.organization_id).trim();
    if (!organizationId) {
      throw new Error("Invalid job payload: missing organization_id");
    }

    const state = readState(payload);
    if (!state.queryText) {
      throw new Error("BLOCKED: Missing queryText (or messages) for multi-week lesson plan generation");
    }

    if (state.step === "init") {
      await emitAgentJobEvent(jobId, "generating", 5, "Initializing multi-week lesson plan", {
        step: "init",
      }).catch(() => {});

      return {
        yield: true,
        message: "Starting overview generation",
        payloadPatch: {
          step: "overview",
          queryText: state.queryText,
          scope: state.scope,
          materialId: state.materialId,
          topK: state.topK,
          weeks: state.weeks,
          hoursPerWeek: state.hoursPerWeek,
          level: state.level,
          overviewAttempts: 0,
          weekAttempts: 0,
          finalizeAttempts: 0,
        },
      };
    }

    if (state.step === "overview") {
      const attempt = (state.overviewAttempts ?? 0) + 1;
      await emitAgentJobEvent(jobId, "generating", 15, `Generating overview (attempt ${attempt})`, {
        step: "overview",
        attempt,
      }).catch(() => {});

      try {
        const overview = await generateMultiWeekOverview({
          queryText: state.queryText,
          weeks: state.weeks,
          hoursPerWeek: state.hoursPerWeek,
          level: state.level,
          timeoutMs: LLM_TIMEOUT_MS,
        });

        const plan: MultiWeekLessonPlan = { ...overview, weeks: [] };
        await emitAgentJobEvent(jobId, "generating", 25, "Overview ready", {
          step: "overview",
          weeks: overview.overview.length,
        }).catch(() => {});

        return {
          yield: true,
          message: "Overview ready; generating week details",
          payloadPatch: {
            step: "week",
            overview,
            plan,
            currentWeekIndex: 0,
            overviewAttempts: attempt,
          },
          partialPlan: plan,
        };
      } catch (e) {
        if (attempt < 3 && isAbortTimeout(e)) {
          await emitAgentJobEvent(jobId, "generating", 18, "Overview timed out; requeueing", {
            step: "overview",
            attempt,
          }).catch(() => {});
          return {
            yield: true,
            message: "Overview generation timed out; retrying via requeue",
            payloadPatch: { overviewAttempts: attempt },
          };
        }
        if (attempt < 3) {
          await emitAgentJobEvent(jobId, "generating", 18, "Overview generation failed; requeueing", {
            step: "overview",
            attempt,
            error: e instanceof Error ? e.message : String(e),
          }).catch(() => {});
          return {
            yield: true,
            message: "Overview generation failed; retrying via requeue",
            payloadPatch: { overviewAttempts: attempt },
          };
        }
        throw e;
      }
    }

    if (state.step === "week") {
      if (!state.plan || !state.plan.overview || !Array.isArray(state.plan.overview)) {
        throw new Error("Invalid job payload: missing multi-week plan overview");
      }

      const index = Math.max(0, Math.floor(state.currentWeekIndex ?? 0));
      const totalWeeks = state.plan.overview.length;
      if (index >= totalWeeks) {
        return {
          yield: true,
          message: "All weeks generated; finalizing",
          payloadPatch: {
            step: "finalize",
            finalizeAttempts: 0,
          },
          partialPlan: state.plan,
        };
      }

      const attempt = (state.weekAttempts ?? 0) + 1;
      const weekSummary = state.plan.overview[index];
      // Keep progress monotonic (avoid resetting to 30% each week).
      const startProgress = 30 + Math.floor((index / totalWeeks) * 55);
      await emitAgentJobEvent(jobId, "generating", startProgress, `Generating week ${index + 1} of ${totalWeeks} (attempt ${attempt})`, {
        step: "week",
        week: index + 1,
        attempt,
      }).catch(() => {});

      try {
        const totalMinutes = Math.max(30, Math.floor(state.hoursPerWeek * 60));
        const weekQuery = buildWeekQuery(state.queryText, weekSummary);

        const weekMaterialCandidates = await searchCuratedMaterialsSmart({
          organizationId,
          queryText: weekQuery,
          weekTitle: weekSummary.title,
          weekTheme: weekSummary.theme,
          keyConcepts: weekSummary.keyConcepts || [],
          limit: 24,
          timeoutMs: 25_000,
        });

        const weekMaterials = await pickRelevantCuratedMaterials({
          queryText: weekQuery,
          weekTitle: weekSummary.title,
          weekTheme: weekSummary.theme,
          keyConcepts: weekSummary.keyConcepts || [],
          candidates: weekMaterialCandidates,
          limit: 3,
          timeoutMs: 25_000,
        });

        // "materials" must be pre-generated + human-approved. In this system, curated-materials are the approved pool.
        const approvedMaterialTitles = weekMaterials
          .map((m) => (typeof m.title === "string" ? m.title.trim() : ""))
          .filter((t) => t);

        const approvedList = approvedMaterialTitles.length
          ? [
              "GOEDGEKEURDE MATERIALEN (kies alleen uit deze lijst; gebruik exacte titels; verzin niets):",
              ...approvedMaterialTitles.map((t) => `- ${t}`),
              "",
            ].join("\n")
          : "";

        let materialContext = approvedList;
        const top = weekMaterials.slice(0, 2);
        if (top.length) {
          const chunks: string[] = [];
          for (const m of top) {
            if (!m.storage_bucket || !m.storage_path) continue;
            const content = await fetchMaterialContent({
              storageBucket: m.storage_bucket,
              storagePath: m.storage_path,
              maxLength: 1800,
            });
            if (!content) continue;
            chunks.push(`[${m.title}]\n${content}`);
          }
          materialContext = [approvedList, chunks.join("\n\n---\n\n")].filter(Boolean).join("\n\n");
        }

        const weekPlan = await generateWeekPlan({
          week: weekSummary.week,
          title: weekSummary.title,
          kdCode: weekSummary.kdCode,
          keyConcepts: weekSummary.keyConcepts || [],
          theme: weekSummary.theme,
          totalMinutes,
          seriesTitle: state.plan.meta?.title || "Lessenserie",
          level: state.level,
          materialContext: materialContext || undefined,
          timeoutMs: LLM_TIMEOUT_MS,
        });

        // Validate: week plan must select ONLY from the approved materials list (if any),
        // and must reference selected materials in the teacher script.
        let selectedMaterials = (weekPlan.materials || []).map((m) => String(m || "").trim()).filter((m) => m);
        if (approvedMaterialTitles.length === 0) {
          // No approved materials were found for this week; do NOT allow the LLM to invent any.
          // Instead of blocking the whole job, drop any model-proposed materials and continue.
          // (We still keep the plan content; the Materials panel remains empty.)
          selectedMaterials = [];
        } else {
          const allowed = new Set(approvedMaterialTitles);
          const unknown = selectedMaterials.filter((m) => !allowed.has(m));
          if (unknown.length) {
            throw new Error(`BLOCKED: Week plan referenced non-approved materials: ${unknown.join(" | ")}`);
          }
          if (selectedMaterials.length === 0) {
            throw new Error("BLOCKED: Week plan did not select any approved materials");
          }

          const scriptText = (weekPlan.teacherScript || [])
            .map((s) => `${String((s as any)?.action || "")} ${String((s as any)?.content || "")}`)
            .join(" ")
            .toLowerCase();
          const hasAnyReference = selectedMaterials.some((m) => scriptText.includes(m.toLowerCase()));
          if (!hasAnyReference) {
            throw new Error("BLOCKED: Week plan did not reference selected materials in teacherScript");
          }
        }

        const patchedWeek: WeekPlan = {
          ...weekPlan,
          week: weekSummary.week,
          title: weekSummary.title,
          kdCode: weekSummary.kdCode,
          keyConcepts: weekPlan.keyConcepts?.length ? weekPlan.keyConcepts : weekSummary.keyConcepts || [],
          theme: weekSummary.theme,
          materials: selectedMaterials,
        };

        const nextPlan = upsertWeek(state.plan, index, patchedWeek);
        const progress = 30 + Math.floor(((index + 1) / totalWeeks) * 55);
        await emitAgentJobEvent(jobId, "generating", progress, `Week ${index + 1} generated`, {
          step: "week",
          week: index + 1,
        }).catch(() => {});

        return {
          yield: true,
          message: `Week ${index + 1} ready`,
          payloadPatch: {
            step: index + 1 >= totalWeeks ? "finalize" : "week",
            plan: nextPlan,
            currentWeekIndex: index + 1,
            weekAttempts: 0,
          },
          partialPlan: nextPlan,
          progress,
        };
      } catch (e) {
        if (attempt < 3 && isAbortTimeout(e)) {
          await emitAgentJobEvent(jobId, "generating", 32, `Week ${index + 1} timed out; requeueing`, {
            step: "week",
            week: index + 1,
            attempt,
          }).catch(() => {});
          return {
            yield: true,
            message: `Week ${index + 1} timed out; retrying via requeue`,
            payloadPatch: { weekAttempts: attempt },
          };
        }
        if (attempt < 3) {
          await emitAgentJobEvent(jobId, "generating", 32, `Week ${index + 1} failed; requeueing`, {
            step: "week",
            week: index + 1,
            attempt,
            error: e instanceof Error ? e.message : String(e),
          }).catch(() => {});
          return {
            yield: true,
            message: `Week ${index + 1} failed; retrying via requeue`,
            payloadPatch: { weekAttempts: attempt },
          };
        }
        throw e;
      }
    }

    if (state.step === "finalize") {
      const attempt = (state.finalizeAttempts ?? 0) + 1;
      await emitAgentJobEvent(jobId, "generating", 85, `Finalizing (attempt ${attempt})`, {
        step: "finalize",
        attempt,
      }).catch(() => {});

      if (!state.plan) {
        throw new Error("Invalid job payload: missing multi-week plan");
      }

      try {
        const allowMes = state.scope !== "materials";
        const allowCurated = state.scope !== "mes";
        const allowLibrary = state.scope !== "mes";

        const topK = state.topK;
        const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

        // --- curated recommendations (no embedding needed) ---
        const curatedBase = allowCurated
          ? await searchCuratedMaterials({
              organizationId,
              query: state.queryText,
              limit: 8,
            })
          : [];
        const curatedRecommendations = allowCurated ? toCuratedRecommendations(curatedBase) : [];

        // --- embedding-dependent retrieval (optional) ---
        let citations: Citation[] = [];
        let recommendations: UnifiedRecommendation[] = [];
        let counts = { total: 0, curated: curatedRecommendations.length, mes: 0, library: 0 };
        let embeddingOk = false;

        const openAiKey = (process.env.OPENAI_API_KEY || "").trim();
        if (openAiKey) {
          try {
            const embedding = await generateEmbedding(state.queryText, { apiKey: openAiKey, model: embeddingModel });
            embeddingOk = true;

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

            const [libraryRaw, mesRecommendations] = await Promise.all([
              allowLibrary ? retrieveMaterialRecommendations({ organizationId, embedding, limit: 6 }) : Promise.resolve([]),
              allowMes ? recommendMesModules({ organizationId, embedding, limit: 6 }) : Promise.resolve([]),
            ]);

            const libraryRecommendations = toLibraryMaterialRecommendations(libraryRaw);
            recommendations = mergeRecommendations([curatedRecommendations, mesRecommendations, libraryRecommendations], 12);
            counts = {
              total: recommendations.length,
              curated: curatedRecommendations.length,
              mes: mesRecommendations.length,
              library: libraryRecommendations.length,
            };
          } catch (e) {
            // Best-effort: keep curated recs even if embedding fails (invalid key, provider error, etc.)
            const msg = e instanceof Error ? e.message : String(e);
            await emitAgentJobEvent(jobId, "generating", 88, "Embedding/retrieval failed; continuing without citations", {
              step: "finalize",
              error: msg.slice(0, 500),
            }).catch(() => {});
            citations = [];
            recommendations = curatedRecommendations.slice(0, 12);
            counts = { total: recommendations.length, curated: curatedRecommendations.length, mes: 0, library: 0 };
            embeddingOk = false;
          }
        } else {
          // No OpenAI key available: still return plan + curated matches.
          citations = [];
          recommendations = curatedRecommendations.slice(0, 12);
          counts = { total: recommendations.length, curated: curatedRecommendations.length, mes: 0, library: 0 };
        }

        const sourceBits = [
          counts.curated ? `${counts.curated} uit de database` : null,
          counts.mes ? `${counts.mes} uit ExpertCollege` : null,
          counts.library ? `${counts.library} uit je eigen materiaal` : null,
        ].filter(Boolean);

        const recSentence = counts.total
          ? `Ik heb ook ${counts.total} relevante bronnen gevonden (${sourceBits.join(", ")}).`
          : embeddingOk
            ? "Ik heb geen bronnen gevonden die direct matchen—probeer een concretere zoekterm."
            : "Ik kon geen automatische bron-aanbevelingen ophalen (embedding-service niet beschikbaar), maar het lesplan is wél compleet.";

        const answer = [
          `Ik heb een lessenserie van ${state.plan.meta?.duration?.weeks ?? state.weeks} weken opgesteld.`,
          recSentence,
          "Bekijk het lesplan, materialen en bronnen in het paneel rechts.",
        ].join(" ");

        await emitAgentJobEvent(jobId, "done", 100, "Multi-week lesson plan complete", {
          step: "finalize",
          recommendations: counts,
        }).catch(() => {});

        const planFlags = [
          ...((state.plan as any)?.qualityFlags ?? []),
          ...((state.plan?.weeks || []).flatMap((w) => (w as any)?.qualityFlags ?? [])),
        ].filter(Boolean);
        const qualityFlags = Array.from(new Set(planFlags));

        return {
          ok: true,
          jobId,
          answer,
          citations: citations.slice(0, 12),
          recommendations,
          multiWeekPlan: state.plan,
          quality_flags: qualityFlags,
        };
      } catch (e) {
        if (attempt < 3 && isAbortTimeout(e)) {
          await emitAgentJobEvent(jobId, "generating", 88, "Finalize timed out; requeueing", {
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
          await emitAgentJobEvent(jobId, "generating", 88, "Finalize failed; requeueing", {
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

