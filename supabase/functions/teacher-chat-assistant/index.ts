import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import { chat as chatLLM, getProvider } from "../_shared/ai.ts";
import {
  adminSupabase,
  buildKdCheck,
  fetchMaterialContent,
  generateEmbedding,
  generateLessonPlan,
  mergeRecommendations,
  recommendMesModules,
  requireEnv,
  retrieveMaterialRecommendations,
  retrievePrefix,
  searchCuratedMaterials,
  toCuratedRecommendations,
  toLibraryMaterialRecommendations,
  type Citation,
  type CuratedMaterialResult,
  type LessonPlan,
  type MaterialRecommendation,
  type UnifiedRecommendation,
} from "../_shared/teacher-utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}

const MIN_SIMILARITY = 0.25;
const MES_TEST_PREFIX = "mes:e2e-";

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) throw new Error("BLOCKED: messages must be an array");
  const out: ChatMessage[] = [];
  for (const m of raw) {
    const obj = (m && typeof m === "object") ? (m as Record<string, unknown>) : {};
    const role = obj.role;
    const content = obj.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.trim() });
  }
  if (out.length === 0) throw new Error("BLOCKED: messages must include at least one user message");
  return out;
}

function latestUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages[messages.length - 1].content;
}

async function resolveUserMetaRole(args: { authType: "agent" | "user"; req: Request; userId?: string }): Promise<string | null> {
  if (args.authType === "user") {
    const authHeader = args.req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    const role =
      (data.user.user_metadata?.role as string | undefined) ??
      (data.user.app_metadata?.role as string | undefined) ??
      null;
    return role ? String(role) : null;
  }

  // Agent calls: if userId provided, look up auth user metadata via admin API.
  const userId = args.userId;
  if (!userId) return null;
  const { data, error } = await adminSupabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const role =
    (data.user.user_metadata?.role as string | undefined) ??
    (data.user.app_metadata?.role as string | undefined) ??
    null;
  return role ? String(role) : null;
}

async function isOrgAdminOrEditor(args: { userId?: string; organizationId: string }): Promise<boolean> {
  const userId = args.userId;
  if (!userId) return false;
  const { data, error } = await adminSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", args.organizationId);
  if (error) return false;
  const roles = Array.isArray(data) ? data.map((r: any) => String(r?.role || "")) : [];
  return roles.includes("org_admin") || roles.includes("editor");
}

function normalizeText(input: string): string {
  return String(input || "").toLowerCase().trim();
}

function detectMaterialSearchIntent(queryText: string): boolean {
  const q = normalizeText(queryText);
  if (!q) return false;

  const triggers = [
    // Dutch - existence questions
    "hebben we", "heb je", "zijn er", "is er",
    "hebben jullie", "heeft de school",
    // Dutch - search for modules/materials
    "zoek module", "zoek materiaal", "zoek content",
    "zoek e-learning", "zoek elearning",
    "modules over", "materiaal over", "content over",
    "e-learning over", "elearning over",
    // Dutch - specific content types
    "opgaven over", "oefeningen over", "lesmateriaal over",
    "teksten over", "theorie over",
    // Dutch - inventory questions
    "welke modules", "welke e-learning", "welke materialen",
    "wat voor modules", "wat voor materiaal",
    // English equivalents
    "do we have", "do you have", "are there",
    "search module", "search material", "search content",
    "modules about", "material about", "content about",
    "exercises about", "assignments about",
  ];

  return triggers.some(t => q.includes(t));
}

function detectRecommendationIntent(queryText: string): boolean {
  const q = normalizeText(queryText);
  if (!q) return false;

  // Explicit triggers
  if (q.startsWith("sam:") || q.startsWith("recommend:") || q.startsWith("aanbevel:")) return true;

  // Strong recommendation phrases (high confidence)
  const strongPhrases = [
    // Dutch need/have patterns
    "heb je materiaal", "heb je opdrachten", "heb je oefeningen",
    "nodig voor", "nodig over",
    "welke materialen", "welke opdrachten", "welke oefeningen", "welke modules",
    "kan ik vinden", "waar vind ik",
    "zijn er modules", "zijn er materialen", "zijn er opdrachten",
    "hebben we modules", "hebben we materiaal", "hebben jullie",
    // E-learning specific
    "e-learning", "elearning", "online module", "online cursus",
    "digitaal lesmateriaal", "digitale module",
    // Assignment/exercise specific
    "toets over", "toetsen over", "examen over",
    "huiswerk over", "huiswerkopdracht",
    "praktijkopdracht", "praktijkopdrachten",
    "simulatie", "simulaties", "oefencasus",
    // English equivalents
    "do you have material", "do you have assignments",
    "need for", "need about",
    "which materials", "which assignments", "which exercises",
  ];

  for (const phrase of strongPhrases) {
    if (q.includes(phrase)) return true;
  }

  // Knowledge question starters (should NOT trigger recommendations)
  const knowledgeStarters = [
    "wat is", "hoe werkt", "waarom is", "waarom zijn",
    "leg uit", "uitleg over", "definieer", "verklaar",
    "what is", "how does", "how to", "why is",
    "explain", "define",
  ];

  const startsWithKnowledge = knowledgeStarters.some((starter) => q.startsWith(starter));
  if (startsWithKnowledge) return false;

  // Action verbs (find, search, recommend)
  const actionVerbs = [
    "zoek", "vind", "vinden", "aanbeveel", "aanbevelen",
    "selecteer", "kies", "adviseer", "suggesties",
    "geef", "toon", "laat zien", "overzicht",
    "find", "search", "recommend", "suggest", "select", "show",
  ];

  // Resource nouns
  const resourceNouns = [
    "materiaal", "materialen", "lesmateriaal",
    "opdracht", "opdrachten", "werkopdracht", "werkopdrachten",
    "oefening", "oefeningen",
    "casus", "casussen", "module", "modules",
    "bpv", "theorie", "toets", "toetsen",
    "e-learning", "elearning", "video", "videos",
    "material", "materials", "assignment", "assignments",
    "exercise", "exercises", "case", "module",
  ];

  const hasAction = actionVerbs.some((v) => q.includes(v));
  const hasResource = resourceNouns.some((n) => q.includes(n));

  // If query has both action + resource, it's likely a recommendation request
  if (hasAction && hasResource) return true;

  // If query has strong action verb alone
  if (hasAction && (q.startsWith("zoek ") || q.startsWith("vind ") || q.startsWith("find "))) return true;

  // Multiple resource mentions
  const resourceCount = resourceNouns.filter((n) => q.includes(n)).length;
  if (resourceCount >= 2) return true;

  return false;
}

type MultiWeekIntent = { weeks: number; hoursPerWeek: number; level: "n3" | "n4" | "combi" };

function parseWeeksCount(queryText: string): number | null {
  const q = normalizeText(queryText);
  if (!q) return null;
  const match = q.match(/(\d+)\s*weken?/i);
  if (match) {
    const n = Number(match[1]);
    return Number.isFinite(n) && n >= 2 ? Math.floor(n) : null;
  }
  if (q.includes("lessenserie") || q.includes("lessenreeks") || q.includes("weekplan") || q.includes("weekplanning")) {
    return 9;
  }
  return null;
}

function parseHoursPerWeek(queryText: string): number {
  const q = normalizeText(queryText);
  const hourMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(uur|u)\b/i);
  if (hourMatch) {
    const raw = hourMatch[1].replace(",", ".");
    const hours = Number(raw);
    if (Number.isFinite(hours) && hours > 0) return hours;
  }
  const minMatch = q.match(/(\d+)\s*(min|minuten|minutes)\b/i);
  if (minMatch) {
    const minutes = Number(minMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) return Math.max(0.5, minutes / 60);
  }
  return 2;
}

function parseLevel(queryText: string): "n3" | "n4" | "combi" {
  const q = normalizeText(queryText);
  const hasN3 = /\bn3\b|niveau\s*3/.test(q);
  const hasN4 = /\bn4\b|niveau\s*4/.test(q);
  const hasCombi = q.includes("combi") || q.includes("combiklas") || q.includes("combigroep");
  if (hasCombi || (hasN3 && hasN4)) return "combi";
  if (hasN4) return "n4";
  return "n3";
}

function detectMultiWeekIntent(queryText: string): MultiWeekIntent | null {
  const weeks = parseWeeksCount(queryText);
  if (!weeks) return null;
  return {
    weeks,
    hoursPerWeek: parseHoursPerWeek(queryText),
    level: parseLevel(queryText),
  };
}

function detectLessonPlanIntent(queryText: string): boolean {
  const q = normalizeText(queryText);
  if (!q) return false;
  const triggers = [
    // Single lesson
    "maak een lesplan", "maak een les", "genereer een lesplan",
    "lesplan over", "les over", "lesplan voor",
    "bouw een les", "ontwerp een les",
    "lesson plan", "create a lesson",
    // Multi-lesson / week plans
    "weekplan", "week plan", "weekplanning",
    "lessenserie", "lessenreeks", "lessenplan",
    "meerdere lessen", "5 lessen", "4 lessen", "3 lessen",
    "module plannen", "moduleplan",
    // Period planning
    "periode planning", "periodeplanning", "blokplanning",
    "curriculum voor", "cursus plannen",
  ];
  return triggers.some((t) => q.includes(t));
}

function detectKdQueryIntent(queryText: string): boolean {
  const q = normalizeText(queryText);
  if (!q) return false;

  // Strong KD query triggers
  const kdTriggers = [
    // Combiklas / overlap questions
    "combiklas", "combi-klas", "combiklassen", "combigroep", "combigroepen",
    "overlap n3", "overlap n4", "n3 en n4", "n3 vs n4", "n4 vs n3",
    "niveau 3 en 4", "niveau 3 en niveau 4",
    "alleen n4", "alleen niveau 4", "alleen n3", "alleen niveau 3",
    "gedeeld tussen", "wat delen",
    // KD structure questions
    "in het kd", "in de kd", "volgens het kd", "volgens de kd",
    "kwalificatiedossier", "basisdeel", "profieldeel",
    "kerntaken", "werkprocessen",
    "kd 2026", "kd2026",
    // Comparison questions
    "verschil tussen n3 en n4", "verschil n3 n4",
    "wat is anders", "wat is hetzelfde",
  ];

  return kdTriggers.some((t) => q.includes(t));
}

function filterCitations(items: Citation[]): Citation[] {
  return items.filter((c) => {
    if (!Number.isFinite(c.similarity) || c.similarity < MIN_SIMILARITY) return false;
    if (c.source === "mes" && String(c.course_id || "").toLowerCase().startsWith(MES_TEST_PREFIX)) return false;
    return true;
  });
}

// Pre-computed KD knowledge for combiklas analysis
const KD_COMBI_CONTEXT = `
=== KD 2026 COMBIKLAS ANALYSE ===

BASISDEEL (N3 + N4 gedeeld):
- B1-K1: Biedt zorg, ondersteuning en begeleiding (6 werkprocessen)
  - B1-K1-W1: Inventariseert de behoefte aan zorg
  - B1-K1-W2: Stelt het zorgplan op/bij
  - B1-K1-W3: Voert zorginterventies uit
  - B1-K1-W4: Voert verpleegtechnische handelingen uit
  - B1-K1-W5: Handelt in acute situaties
  - B1-K1-W6: Geeft informatie en advies
- B1-K2: Stemt de zorg en ondersteuning af (2 werkprocessen)
  - B1-K2-W1: Stemt af met informele zorgverleners
  - B1-K2-W2: Werkt samen met andere zorgprofessionals
- B1-K3: Draagt bij aan kwaliteit van zorg (3 werkprocessen)
  - B1-K3-W1: Draagt bij aan innoveren
  - B1-K3-W2: Evalueert en ontwikkelt zichzelf
  - B1-K3-W3: Draagt bij aan veilige werkomgeving

Totaal basisdeel: 3 kerntaken, 11 werkprocessen (100% gedeeld N3+N4)

ALLEEN N4 (Profieldeel P2-K1):
- P2-K1: Organiseert en coördineert de zorgverlening (3 werkprocessen)
  - P2-K1-W1: Stelt verpleegkundige diagnose (klinisch redeneren)
  - P2-K1-W2: Coacht en begeleidt collega's
  - P2-K1-W3: Coördineert en optimaliseert zorgverlening

Extra N4 vakkennis:
- Evidence Based Practice (EBP)
- Klinisch redeneren
- Comorbiditeit (brede kennis)
- Engels (basis)

OVERLAP ANALYSE:
- N3 heeft: 3 kerntaken, 11 werkprocessen
- N4 heeft: 4 kerntaken, 14 werkprocessen
- Gedeeld: 11 werkprocessen (79% overlap)
- Alleen N4: 3 werkprocessen (P2-K1)

ADVIES VOOR COMBIKLASSEN:
1. ~80% van het curriculum kan klassikaal worden gegeven
2. Differentieer specifiek op P2-K1 thema's:
   - Klinisch redeneren → alleen N4
   - Coachen collega's → alleen N4
   - Coördineren zorg → alleen N4
3. N4 studenten kunnen verdiepen waar N3 de basis leert
4. Gebruik dezelfde casussen, laat N4 extra analyseren
`.trim();

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method not allowed" }, httpStatus: 405, requestId }, 200);
  }

  try {
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, httpStatus: 401, requestId }, 200);
    }

    const organizationId = requireOrganizationId(auth);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    const messages = parseMessages(body?.messages);
    const scopeRaw = typeof body?.scope === "string" ? body.scope.trim().toLowerCase() : "all";
    const scope = (scopeRaw === "materials" || scopeRaw === "mes" || scopeRaw === "all") ? scopeRaw : "all";
    const materialId = typeof body?.materialId === "string" ? body.materialId.trim() : "";

    // Authorization: teacher/admin parity gate
    // - Teachers have user_metadata.role='teacher'
    // - Admins have user_roles org_admin/editor (metadata role may be absent)
    if (auth.type === "user") {
      const metaRole = await resolveUserMetaRole({ authType: "user", req, userId: auth.userId });
      const isAdmin = await isOrgAdminOrEditor({ userId: auth.userId, organizationId });
      const ok = metaRole === "teacher" || isAdmin;
      if (!ok) {
        return json({ ok: false, error: { code: "forbidden", message: "TeacherGPT is restricted to teachers/admins" }, httpStatus: 403, requestId }, 200);
      }
    }
    // Agent calls are trusted (AGENT_TOKEN is privileged); used for tests/ops.

    // Ensure we have a chat provider configured (for the answer generation).
    // We avoid fallbacks; if nothing configured, fail loudly.
    if (getProvider() === "none") {
      return json({
        ok: false,
        error: { code: "blocked", message: "BLOCKED: OPENAI_API_KEY (or ANTHROPIC_API_KEY) is REQUIRED for teacher-chat-assistant" },
        httpStatus: 500,
        requestId,
      }, 200);
    }

    const queryText = latestUserMessage(messages);
    const multiWeekIntent = detectMultiWeekIntent(queryText);
    const wantsLessonPlan = detectLessonPlanIntent(queryText);
    if (multiWeekIntent) {
      requireEnv("OPENAI_API_KEY");

      const topK = Math.min(20, Math.max(3, Number.isFinite(Number(body?.topK)) ? Math.floor(Number(body.topK)) : 8));
      const jobPayload = {
        step: "init",
        queryText,
        messages,
        scope,
        materialId,
        topK,
        weeks: multiWeekIntent.weeks,
        hoursPerWeek: multiWeekIntent.hoursPerWeek,
        level: multiWeekIntent.level,
      };

      const insert: Record<string, unknown> = {
        organization_id: organizationId,
        job_type: "generate_multi_week_plan",
        status: "queued",
        payload: jobPayload,
      };
      if (auth.type === "user" && auth.userId) {
        insert.created_by = auth.userId;
      } else if (auth.type === "agent" && auth.userId) {
        insert.created_by = auth.userId;
      }

      const { data: created, error: createErr } = await adminSupabase
        .from("ai_agent_jobs")
        .insert(insert)
        .select("id")
        .single();

      if (createErr || !created?.id) {
        console.error(`[teacher-chat-assistant] enqueue_multi_week_plan_failed (${requestId}):`, createErr);
        return json({
          ok: false,
          error: { code: "internal_error", message: "Failed to enqueue multi-week lesson plan job" },
          httpStatus: 500,
          requestId,
        }, 200);
      }

      const jobId = String((created as any).id);
      return json({
        ok: true,
        answer: `Ik maak een lessenserie van ${multiWeekIntent.weeks} weken. Dit kan een paar minuten duren. Ik laat het weten zodra het klaar is.`,
        citations: [],
        recommendations: [],
        requestId,
        jobId,
      }, 200);
    }

    if (wantsLessonPlan) {
      // Async, quality-first pipeline: enqueue a long-running job (yield/requeue supported).
      // The UI can poll `get-job?id=<jobId>` for result + progress events.
      requireEnv("OPENAI_API_KEY"); // embeddings required for recommendations

      const topK = Math.min(20, Math.max(3, Number.isFinite(Number(body?.topK)) ? Math.floor(Number(body.topK)) : 8));

      const jobPayload = {
        step: "init",
        queryText,
        messages,
        scope,
        materialId,
        topK,
      };

      const insert: Record<string, unknown> = {
        organization_id: organizationId,
        job_type: "generate_lesson_plan",
        status: "queued",
        payload: jobPayload,
      };
      if (auth.type === "user" && auth.userId) {
        insert.created_by = auth.userId;
      } else if (auth.type === "agent" && auth.userId) {
        // Optional: allow agent callers to attribute job to a user.
        insert.created_by = auth.userId;
      }

      const { data: created, error: createErr } = await adminSupabase
        .from("ai_agent_jobs")
        .insert(insert)
        .select("id")
        .single();

      if (createErr || !created?.id) {
        console.error(`[teacher-chat-assistant] enqueue_lesson_plan_failed (${requestId}):`, createErr);
        return json({
          ok: false,
          error: { code: "internal_error", message: "Failed to enqueue lesson plan job" },
          httpStatus: 500,
          requestId,
        }, 200);
      }

      const jobId = String((created as any).id);
      return json({
        ok: true,
        answer: "Ik ben je lesplan aan het maken. Dit kan 1–3 minuten duren. Ik laat het weten zodra het klaar is.",
        citations: [],
        recommendations: [],
        requestId,
        // Extra field (not required by the existing frontend type): used for polling.
        jobId,
      }, 200);
    }

    // LLM prereqs for embedding (recommendations / citations)
    const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
    const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";
    const embedding = await generateEmbedding(queryText, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });

    const topK = Math.min(20, Math.max(3, Number.isFinite(Number(body?.topK)) ? Math.floor(Number(body.topK)) : 8));

    const wantsRecommendations = detectRecommendationIntent(queryText);
    const wantsKdInfo = detectKdQueryIntent(queryText);
    const wantsMaterialSearch = detectMaterialSearchIntent(queryText);

    let citations: Citation[] = [];
    if (scope === "materials") {
      const prefix = materialId ? `material:${materialId}` : "material:";
      citations = await retrievePrefix({ organizationId, prefix, embedding, limit: topK });
    } else if (scope === "mes") {
      citations = await retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: topK });
    } else {
      // Search materials, MES, and books in parallel
      const perSource = Math.ceil(topK / 3) + 2;
      const [mat, mes, book] = await Promise.all([
        retrievePrefix({ organizationId, prefix: materialId ? `material:${materialId}` : "material:", embedding, limit: perSource }),
        retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: perSource }),
        retrievePrefix({ organizationId, prefix: "book:", embedding, limit: perSource }),
      ]);
      citations = [...mat, ...mes, ...book]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    }
    citations = filterCitations(citations);

    const allowMes = scope !== "materials";
    const allowCurated = scope !== "mes";
    const allowLibrary = scope !== "mes";
    const shouldRecommend = wantsRecommendations || wantsMaterialSearch;

    let recommendations: UnifiedRecommendation[] = [];

    // Search curated materials if intent detected
    let curatedMaterials: CuratedMaterialResult[] = [];
    let curatedContext = "";
    if (wantsMaterialSearch) {
      try {
        curatedMaterials = await searchCuratedMaterials({
          organizationId,
          query: queryText,
          limit: 10,
        });

        // Fetch full content for top 3 materials
        const materialsWithContent = await Promise.all(
          curatedMaterials.slice(0, 3).map(async (m) => {
            if (m.storage_bucket && m.storage_path) {
              const content = await fetchMaterialContent({
                storageBucket: m.storage_bucket,
                storagePath: m.storage_path,
                maxLength: 4000,
              });
              return { ...m, fullContent: content || undefined };
            }
            return m;
          })
        );

        // Update curatedMaterials with content
        curatedMaterials = [
          ...materialsWithContent,
          ...curatedMaterials.slice(3),
        ];

        // Build context for LLM
        if (curatedMaterials.length > 0) {
          curatedContext = "=== GEVONDEN E-LEARNING MODULES ===\n\n" +
            curatedMaterials.map((m, i) => {
              const parts = [
                `[M${i + 1}] ${m.title}`,
                m.course_name ? `Cursus: ${m.course_name}` : null,
                m.category ? `Categorie: ${m.category}` : null,
                m.kd_codes.length ? `KD: ${m.kd_codes.join(", ")}` : null,
                m.preview ? `Preview: ${m.preview}` : null,
                m.fullContent ? `\nInhoud:\n${m.fullContent}` : null,
              ].filter(Boolean);
              return parts.join("\n");
            }).join("\n\n---\n\n");
        }
      } catch (e) {
        console.error(`[teacher-chat-assistant] curated_search_error (${requestId}):`, e);
        curatedMaterials = [];
      }
    }

    if (shouldRecommend) {
      let curatedBase: CuratedMaterialResult[] = [];
      if (allowCurated) {
        if (curatedMaterials.length > 0) {
          curatedBase = curatedMaterials;
        } else {
          try {
            curatedBase = await searchCuratedMaterials({
              organizationId,
              query: queryText,
              limit: 10,
            });
          } catch (e) {
            console.error(`[teacher-chat-assistant] curated_recs_error (${requestId}):`, e);
            curatedBase = [];
          }
        }
      }

      try {
        const [libraryRaw, mesRecs] = await Promise.all([
          wantsRecommendations && allowLibrary
            ? retrieveMaterialRecommendations({ organizationId, embedding, limit: 6 })
            : Promise.resolve([]),
          allowMes ? recommendMesModules({ organizationId, embedding, limit: 6 }) : Promise.resolve([]),
        ]);
        const libraryRecs = toLibraryMaterialRecommendations(libraryRaw);
        const curatedRecs = allowCurated ? toCuratedRecommendations(curatedBase) : [];
        recommendations = mergeRecommendations([curatedRecs, mesRecs, libraryRecs], 12);
      } catch (e) {
        console.error(`[teacher-chat-assistant] recommendations_error (${requestId}):`, e);
        recommendations = [];
      }
    }

    const citedContext = citations
      .slice(0, 12)
      .map((c, i) => {
        const n = i + 1;
        const src = c.source === "mes" ? "MES" : "Material";
        return `[${n}] (${src}, ${c.course_id}, chunk ${c.item_index}, sim ${c.similarity.toFixed(3)}):\n${c.text}`;
      })
      .join("\n\n");

    const recContext = recommendations.length
      ? recommendations
          .slice(0, 10)
          .map((r, i) => {
            const n = i + 1;
            const score = Number.isFinite(r.score) ? r.score.toFixed(3) : "0.000";
            const sourceLabel = r.source === "mes" ? "MES" : r.source === "curated" ? "E-learning" : "Material";
            const metaParts = [
              r.file_name ? `file: ${r.file_name}` : null,
              r.content_type ? `type: ${r.content_type}` : null,
              r.url ? `url: ${r.url}` : null,
            ].filter(Boolean);
            const meta = metaParts.length ? ` (${metaParts.join(", ")})` : "";
            const why = r.why ? `\nWaarom: ${r.why}` : r.snippet ? `\nSnippet: ${r.snippet}` : "";
            return `[R${n}] [${sourceLabel}] ${r.title}${meta} (score ${score})${why}`;
          })
          .join("\n\n")
      : "";

    const system = [
      "Je bent e-Xpert SAM, een materiaal-adviseur voor MBO-docenten.",
      "",
      "Je toon:",
      "- Vriendelijk en behulpzaam, zoals een ervaren collega",
      "- Praktisch en to-the-point (docenten hebben weinig tijd)",
      "- Nederlands, informeel maar professioneel (gebruik 'je', nooit 'u' of 'uw')",
      "",
      "Je rol:",
      "- Je vindt en selecteert materiaal uit de beschikbare bronnen",
      "- Je hebt toegang tot duizenden e-learning modules in het systeem",
      "- Je hebt kennis van het KD 2026 (kwalificatiedossier) voor VIG/VP",
      "- Je adviseert, maar maakt zelf geen nieuwe content",
      "- Als je iets niet weet of bronnen ontbreken, geef je dat eerlijk toe",
      "",
      "Wanneer een docent vraagt of we materiaal/modules/e-learning HEBBEN over een onderwerp:",
      "- Check de GEVONDEN E-LEARNING MODULES sectie hieronder",
      "- Geef een duidelijk antwoord met aantallen en titels",
      '- Bijvoorbeeld: "Ja, ik heb 5 modules gevonden over de cel: [M1] Celstructuur, [M2] Celdeling..."',
      "- Vermeld relevante KD-codes en cursus-informatie",
      "- Als je ook de inhoud hebt kunnen ophalen, geef dan concrete voorbeelden uit het materiaal",
      "",
      "Wanneer een docent vraagt om materiaal te vinden/zoeken/aanbevelen:",
      "- Verwijs naar de AANBEVELINGEN lijst hieronder met natuurlijke zinnen",
      '- Bijvoorbeeld: "Ik heb 3 materialen gevonden..." of "Check [R1] en [R2], die passen goed bij..."',
      "- Vermeld de belangrijkste matches kort en laat de kaarten de details tonen",
      "",
      "Voor KD-vragen (combiklassen, overlap N3/N4, werkprocessen):",
      "- Gebruik de KD ANALYSE hieronder voor gedetailleerde antwoorden",
      "- Geef concrete werkproces-codes en percentages",
      "- Adviseer praktisch over wat klassikaal kan en waar te differentiëren",
      "",
      "Voor andere vragen (theorie, uitleg, context):",
      "- Gebruik de BRONNEN hieronder",
      "- Citeer bronnen door [1], [2], etc. te schrijven",
      "- Geef een helder, praktisch antwoord",
      "",
      // KD context (only when KD query detected)
      wantsKdInfo ? KD_COMBI_CONTEXT : "",
      wantsKdInfo ? "" : "",
      // Curated material search results
      curatedContext || "",
      curatedContext ? "" : "",
      // Material recommendations
      recommendations.length ? "=== AANBEVELINGEN (MATERIALEN) ===" : "",
      recContext || "",
      recommendations.length ? "" : "",
      "=== BRONNEN (TEKST) ===",
      citedContext || "(geen bronnen gevonden)",
    ].join("\n");

    const llmResp = await chatLLM({
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 900,
      temperature: 0.55,
      timeoutMs: 45_000, // Reduced from 90s to stay within Edge Function limits
    });

    if (!llmResp.ok) {
      const msg = llmResp.error === "no_provider"
        ? "BLOCKED: OPENAI_API_KEY (or ANTHROPIC_API_KEY) is REQUIRED for teacher-chat-assistant"
        : llmResp.error;
      return json({ ok: false, error: { code: "blocked", message: msg }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      answer: llmResp.text,
      citations: citations.slice(0, 12),
      recommendations,
      curatedMaterials: curatedMaterials.length > 0 ? curatedMaterials.map(m => ({
        id: m.id,
        title: m.title,
        course_name: m.course_name,
        category: m.category,
        preview: m.preview,
        kd_codes: m.kd_codes,
        hasContent: !!m.fullContent,
      })) : undefined,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[teacher-chat-assistant] Unhandled error (${requestId}):`, message);
    return new Response(
      JSON.stringify({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }) },
    );
  }
});


