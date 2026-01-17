import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions, getRequestId } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type SearchRequest = {
  query?: string;
  kd_code?: string;
  material_type?: string;
  category?: string;
  mbo_level?: string;
  source?: string;
  language_variant?: string;
  mbo_track?: string;
  module_family?: string;
  topic_tag?: string;
  exercise_format?: string;
  scenario_present?: boolean;
  law_topic?: string;
  communication_context?: string;
  limit?: number;
};

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return null;
}

function json(req: Request, reqId: string, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": reqId }),
  });
}

const STOPWORDS = new Set([
  "en", "de", "het", "een", "van", "voor", "met", "in", "op", "te", "aan", "bij", "onder", "over", "tot", "naar", "uit",
  "is", "zijn", "wordt", "worden", "die", "dat", "dit", "deze", "maar", "ook", "of", "als", "dan", "er",
]);

const SOFT_SYNONYMS: Record<string, string[]> = {
  communicatie: ["gesprek", "gespreksvaardigheid", "gesprekstechniek", "voorlichting", "advies", "instructie", "contact", "rolspel"],
  client: ["client", "zorgvrager", "patient"],
  zorgplicht: ["beroepsplicht", "zorgverplichting", "zorgvuldigheid", "verantwoordelijkheid", "patientveiligheid", "bekwaamheid", "bevoegdheid"],
  wondzorg: ["wond", "wondverzorging", "wondbehandeling", "wondgenezing", "ulcus", "decubitus", "verband", "doorligwond", "drukulcus"],
  medicatie: ["medicijn", "geneesmiddel", "farmacologie", "farmacie", "toediening", "dosering", "bijwerking", "contraindicatie", "interactie"],
  wetgeving: ["regelgeving", "juridisch", "wet", "wetten", "wzd", "wkkgz", "wvggz", "zvw", "wlz", "big"],
  incident: ["incidentmelding", "calamiteit", "vim", "veiligheidsincident", "melding"],
  veiligheid: ["veilig werken", "patientveiligheid"],
};

const PRACTICE_CUES = ["casus", "situatie", "scenario", "praktijk", "rollenspel", "clientgesprek", "gesprek", "incidentmelding"];

const INTENT_TRIGGERS = {
  communication: ["communicatie", "gesprek", "gespreksvaardigheid", "gesprekstechniek", "client", "cliënt", "zorgvrager", "rolspel"],
  woundcare: ["wondzorg", "wond", "decubitus", "ulcus", "wondverzorging", "wondbehandeling"],
  medication: ["medicatie", "medicijn", "geneesmiddel", "farmacologie", "farmacie", "dosering", "toediening"],
  incident: ["incident", "vim", "calamiteit", "incidentmelding", "veiligheidsincident"],
  law: ["wetgeving", "wet", "wkkgz", "wzd", "wvggz", "zvw", "wlz", "big", "wgbo"],
  duty: ["zorgplicht", "beroepsplicht", "verantwoordelijkheid", "bekwaam", "bevoegd", "professioneel"],
};

const INTENT_BOOSTS = {
  communication: ["communicatie, advies en instructie", "gespreksvaardigheid", "gespreksvaardigheden", "gesprekstechniek", "voorlichting", "instructie", "triagegesprek", "clientgesprek", "cliëntgesprek"],
  woundcare: ["wondzorg", "wondverzorging", "wondbehandeling", "wondgenezing", "decubitus", "ulcus", "doorlig", "verband"],
  medication: ["medicijnen", "medicatie", "geneesmiddel", "farmacologie", "verpleegtechnische handelingen - medicijnen", "toediening", "dosering", "medicatieveiligheid"],
  incident: ["veilig incident melden", "vim", "patiëntveiligheid", "incident", "calamiteit"],
  law: ["wetgeving", "wet- en regelgeving", "wetgeving en beleid", "juridisch", "wkkgz", "wzd", "wvggz", "zvw", "wlz", "big", "wgbo"],
  duty: ["zorgplicht", "bekwaam", "bevoegd", "professioneel", "beroepshouding", "ethiek", "kwaliteit", "zorgvuldigheid"],
};

const COMMUNICATION_PENALTIES = ["orientatie op de gezondheidszorg", "zorgverlening van individuele zorgvragers"];
const SCENARIO_CUES = ["casus", "scenario", "situatie", "rollenspel", "melding", "formulier"];
const COMMUNICATION_CUES = ["communicatie", "gesprek", "gespreksvaardigheid", "gesprekstechniek", "voorlichting", "instructie", "advies", "triagegesprek", "clientgesprek", "cliëntgesprek", "rolspel"];
const MEDICATION_CUES = ["medicatie", "medicijn", "geneesmiddel", "toediening", "dosering", "bijwerking", "contraindicatie"];
const WOUND_CUES = ["wond", "wondzorg", "wondverzorging", "wondbehandeling", "decubitus", "ulcus", "verband"];
const INCIDENT_CUES = ["incident", "vim", "calamiteit", "melding", "patiëntveiligheid"];
const WOUNDCARE_COURSE_BOOSTS = ["trauma", "voet- en handverzorging", "wondinfecties", "algemene chirurgie", "besmetting en infectie"];
const WOUNDCARE_PENALTIES = ["decubitus", "risico’s bij verminderde mobiliteit", "mobiliteit in verschillende situaties"];

function normalizeText(input: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuery(query: string): string {
  return normalizeText(query);
}

function extractTerms(query: string): string[] {
  if (!query) return [];
  return normalizeQuery(query)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .slice(0, 8);
}

function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const t of terms) {
    if (t.length >= 7 && t.endsWith("zorg")) {
      const root = t.slice(0, -4);
      if (root.length >= 4) expanded.add(root);
    }
    if (t.length >= 11 && t.endsWith("verzorging")) {
      const root = t.slice(0, -"verzorging".length);
      if (root.length >= 4) expanded.add(root);
    }
  }
  return Array.from(expanded).slice(0, 12);
}

function expandSynonyms(terms: string[]): string[] {
  const expanded = new Set<string>();
  for (const t of terms) {
    const key = t.toLowerCase();
    const list = SOFT_SYNONYMS[key];
    if (!list) continue;
    for (const synonym of list) {
      const normalized = normalizeText(synonym);
      if (normalized) expanded.add(normalized);
    }
  }
  return Array.from(expanded).slice(0, 16);
}

function normalizeTerms(list: string[]): string[] {
  return list.map((term) => normalizeText(term)).filter(Boolean);
}

const INTENT_TRIGGERS_NORM = {
  communication: normalizeTerms(INTENT_TRIGGERS.communication),
  woundcare: normalizeTerms(INTENT_TRIGGERS.woundcare),
  medication: normalizeTerms(INTENT_TRIGGERS.medication),
  incident: normalizeTerms(INTENT_TRIGGERS.incident),
  law: normalizeTerms(INTENT_TRIGGERS.law),
  duty: normalizeTerms(INTENT_TRIGGERS.duty),
};

const INTENT_BOOSTS_NORM = {
  communication: normalizeTerms(INTENT_BOOSTS.communication),
  woundcare: normalizeTerms(INTENT_BOOSTS.woundcare),
  medication: normalizeTerms(INTENT_BOOSTS.medication),
  incident: normalizeTerms(INTENT_BOOSTS.incident),
  law: normalizeTerms(INTENT_BOOSTS.law),
  duty: normalizeTerms(INTENT_BOOSTS.duty),
};

const COMMUNICATION_PENALTIES_NORM = normalizeTerms(COMMUNICATION_PENALTIES);
const SCENARIO_CUES_NORM = normalizeTerms(SCENARIO_CUES);
const COMMUNICATION_CUES_NORM = normalizeTerms(COMMUNICATION_CUES);
const MEDICATION_CUES_NORM = normalizeTerms(MEDICATION_CUES);
const WOUND_CUES_NORM = normalizeTerms(WOUND_CUES);
const INCIDENT_CUES_NORM = normalizeTerms(INCIDENT_CUES);
const WOUNDCARE_COURSE_BOOSTS_NORM = normalizeTerms(WOUNDCARE_COURSE_BOOSTS);
const WOUNDCARE_PENALTIES_NORM = normalizeTerms(WOUNDCARE_PENALTIES);

function includesAny(haystack: string, terms: string[]): boolean {
  return terms.some((t) => t && haystack.includes(t));
}

function hasIntent(baseTerms: string[], normalizedQuery: string, triggers: string[]): boolean {
  const termSet = new Set(baseTerms);
  return triggers.some((t) => termSet.has(t) || normalizedQuery.includes(t));
}

function termWeight(term: string): number {
  if (term.length >= 8) return 3;
  if (term.length >= 5) return 2;
  return 1;
}

function scoreText(haystack: string, terms: string[], weight = 1): number {
  if (!haystack) return 0;
  const h = haystack;
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    const base = h === t ? 12 : h.includes(t) ? 6 : 0;
    if (base) score += base * termWeight(t) * weight;
  }
  return score;
}

function scorePhrase(haystack: string, phrase: string, boost: number): number {
  if (!haystack || !phrase) return 0;
  return haystack.includes(phrase) ? boost : 0;
}

function deriveMboLevel(category: string, courseName: string): string {
  const src = `${category} ${courseName}`.toLowerCase();
  if (src.includes("n4") || src.includes("nivo 4") || src.includes("niveau 4")) return "n4";
  if (src.includes("n3") || src.includes("nivo 3") || src.includes("niveau 3")) return "n3";
  return "";
}

serve(async (req: Request): Promise<Response> => {
  const reqId = getRequestId(req);

  if (req.method === "OPTIONS") {
    return handleOptions(req, reqId);
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const code =
      message === "Missing organization_id" ? "missing_organization_id" :
      message.toLowerCase().includes("unauthorized") ? "unauthorized" :
      "unauthorized";
    return json(req, reqId, { ok: false, error: { code, message }, httpStatus: 401, requestId: reqId });
  }

  let params: SearchRequest = {};
  try {
    if (req.method === "POST") {
      params = (await req.json()) as SearchRequest;
    } else {
      const url = new URL(req.url);
      const limitRaw = url.searchParams.get("limit");
      const scenarioRaw = url.searchParams.get("scenario_present");
      params = {
        query: url.searchParams.get("query") ?? undefined,
        kd_code: url.searchParams.get("kd_code") ?? undefined,
        material_type: url.searchParams.get("material_type") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        mbo_level: url.searchParams.get("mbo_level") ?? undefined,
        source: url.searchParams.get("source") ?? undefined,
        language_variant: url.searchParams.get("language_variant") ?? undefined,
        mbo_track: url.searchParams.get("mbo_track") ?? undefined,
        module_family: url.searchParams.get("module_family") ?? undefined,
        topic_tag: url.searchParams.get("topic_tag") ?? undefined,
        exercise_format: url.searchParams.get("exercise_format") ?? undefined,
        scenario_present: scenarioRaw === null ? undefined : scenarioRaw === "true",
        law_topic: url.searchParams.get("law_topic") ?? undefined,
        communication_context: url.searchParams.get("communication_context") ?? undefined,
        limit: limitRaw ? Number(limitRaw) : undefined,
      };
    }
  } catch {
    return json(req, reqId, { ok: false, error: { code: "invalid_request", message: "Invalid request body" }, httpStatus: 400, requestId: reqId });
  }

  const organizationId = requireOrganizationId(auth);
  const query = normalizeString(params.query);
  const kdCode = normalizeString(params.kd_code);
  const materialType = normalizeString(params.material_type);
  const categoryFilter = normalizeString(params.category);
  const mboLevelFilter = normalizeString(params.mbo_level);
  const sourceFilter = normalizeString(params.source);
  const languageVariant = normalizeString(params.language_variant);
  const mboTrackFilter = normalizeString(params.mbo_track);
  const moduleFamilyFilter = normalizeString(params.module_family);
  const topicTagFilter = normalizeString(params.topic_tag);
  const exerciseFormatFilter = normalizeString(params.exercise_format);
  const lawTopicFilter = normalizeString(params.law_topic);
  const communicationContextFilter = normalizeString(params.communication_context);
  const scenarioPresentFilter = normalizeBoolean(params.scenario_present);
  const limit = Math.min(50, Math.max(1, Number.isFinite(Number(params.limit)) ? Math.floor(Number(params.limit)) : 10));
  const normalizedQuery = normalizeQuery(query);

  // Curated materials live as entity_records rows with entity="curated-material".
  // This search is read-only and returns only persisted curated packs (no live generation).
  const candidateLimit = query ? 5000 : 200;
  let queryBuilder = supabase
    .from("entity_records")
    .select("id, title, data, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("entity", "curated-material");

  if (materialType) {
    queryBuilder = queryBuilder.filter("data->>material_type", "eq", materialType);
  }
  if (sourceFilter) {
    queryBuilder = queryBuilder.filter("data->>source", "eq", sourceFilter);
  }
  if (categoryFilter) {
    queryBuilder = queryBuilder.ilike("data->>category", `%${categoryFilter}%`);
  }

  const { data, error: dbError } = await queryBuilder
    .order("updated_at", { ascending: false })
    .limit(candidateLimit);

  if (dbError) {
    console.error(`[search-curated-materials] db_error (${reqId}):`, dbError);
    return json(req, reqId, { ok: false, error: { code: "db_error", message: dbError.message }, httpStatus: 500, requestId: reqId });
  }

  const baseTerms = extractTerms(query);
  const terms = expandTerms(baseTerms);
  const softTerms = expandSynonyms(baseTerms);

  const results = (Array.isArray(data) ? data : [])
    .map((row) => {
      const d = (row as any).data ?? {};
      const title = typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : (typeof d?.title === "string" ? d.title.trim() : "");
      const kdCodes = Array.isArray(d?.kd_codes)
        ? d.kd_codes.map((x: unknown) => String(x || "").trim()).filter(Boolean)
        : [];
      const mt = typeof d?.material_type === "string" ? d.material_type.trim() : "";
      const courseName = typeof d?.course_name === "string" ? d.course_name.trim() : "";
      const category = typeof d?.category === "string" ? d.category.trim() : "";
      const mboLevel = typeof d?.mbo_level === "string" ? d.mbo_level.trim() : "";
      const derivedMboLevel = mboLevel || deriveMboLevel(category, courseName);
      const sourceType = typeof d?.source === "string"
        ? d.source.trim()
        : (d?.source && typeof d.source === "object" && typeof d.source.type === "string")
          ? d.source.type.trim()
          : "";
      const variants = (d?.variants && typeof d.variants === "object") ? (d.variants as Record<string, any>) : {};
      const pickVariant = (lv: string) => {
        const v = variants?.[lv];
        return (v && typeof v === "object") ? v : null;
      };
      const pickedLang = languageVariant
        ? languageVariant
        : (pickVariant("b2") ? "b2" : (pickVariant("b1") ? "b1" : (pickVariant("a2") ? "a2" : (pickVariant("ar") ? "ar" : ""))));
      const variant = pickedLang ? pickVariant(pickedLang) : null;

      const preview =
        typeof variant?.preview === "string"
          ? variant.preview
          : typeof d?.preview === "string"
            ? d.preview
            : "";

      const keywordGlobal = Array.isArray(d?.keywords) ? d.keywords.map((k: unknown) => String(k || "").trim()).filter(Boolean) : [];
      const keywordVariant = Array.isArray(variant?.keywords) ? variant.keywords.map((k: unknown) => String(k || "").trim()).filter(Boolean) : [];
      const nlKeywords = Array.isArray(variant?.nl_keywords) ? variant.nl_keywords.map((k: unknown) => String(k || "").trim()).filter(Boolean) : [];
      const keywords = keywordGlobal.concat(keywordVariant, nlKeywords);

      const metadata = (d?.metadata && typeof d.metadata === "object") ? (d.metadata as Record<string, unknown>) : {};
      const mboTrack = typeof metadata.mbo_track === "string" ? metadata.mbo_track.trim() : "";
      const moduleFamily = typeof metadata.module_family === "string" ? metadata.module_family.trim() : "";
      const topicTags = Array.isArray(metadata.topic_tags)
        ? metadata.topic_tags.map((t: unknown) => String(t || "").trim()).filter(Boolean)
        : [];
      const exerciseFormat = typeof metadata.exercise_format === "string" ? metadata.exercise_format.trim() : "";
      const scenarioPresent = metadata.scenario_present === true;
      const lawTopics = Array.isArray(metadata.law_topics)
        ? metadata.law_topics.map((t: unknown) => String(t || "").trim()).filter(Boolean)
        : [];
      const communicationContext = Array.isArray(metadata.communication_context)
        ? metadata.communication_context.map((t: unknown) => String(t || "").trim()).filter(Boolean)
        : [];

      const metadataOut: Record<string, unknown> = {};
      if (mboTrack) metadataOut.mbo_track = mboTrack;
      if (moduleFamily) metadataOut.module_family = moduleFamily;
      if (topicTags.length) metadataOut.topic_tags = topicTags;
      if (exerciseFormat) metadataOut.exercise_format = exerciseFormat;
      if (scenarioPresent) metadataOut.scenario_present = scenarioPresent;
      if (lawTopics.length) metadataOut.law_topics = lawTopics;
      if (communicationContext.length) metadataOut.communication_context = communicationContext;
      const metadataOutPresent = Object.keys(metadataOut).length ? metadataOut : undefined;

      const storageBucket = typeof variant?.storage_bucket === "string" ? variant.storage_bucket.trim() : "";
      const storagePath = typeof variant?.storage_path === "string" ? variant.storage_path.trim() : "";

      let score = 0;
      if (query) {
        const titleNorm = normalizeText(title);
        const courseNorm = normalizeText(courseName);
        const categoryNorm = normalizeText(category);
        const previewNorm = normalizeText(preview);
        const keywordsNorm = normalizeText(keywords.join(" "));
        const headerNorm = [titleNorm, courseNorm, categoryNorm].filter(Boolean).join(" ");
        const combinedNorm = [headerNorm, previewNorm, keywordsNorm].filter(Boolean).join(" ");
        const queryHasVms = normalizedQuery.includes("vms");
        const queryHasVerification = normalizedQuery.includes("verificatie") || normalizedQuery.includes("high risk");
        const vmsHit = titleNorm.includes("vms") || courseNorm.includes("vms") || categoryNorm.includes("vms");
        const isCommunication = hasIntent(baseTerms, normalizedQuery, INTENT_TRIGGERS_NORM.communication);
        const isWoundcare = hasIntent(baseTerms, normalizedQuery, INTENT_TRIGGERS_NORM.woundcare);
        const isMedication = hasIntent(baseTerms, normalizedQuery, INTENT_TRIGGERS_NORM.medication);
        const isIncident = hasIntent(baseTerms, normalizedQuery, INTENT_TRIGGERS_NORM.incident)
          || (normalizedQuery.includes("veiligheid") && normalizedQuery.includes("incident"));
        const isLaw = hasIntent(baseTerms, normalizedQuery, INTENT_TRIGGERS_NORM.law);
        const isDuty = hasIntent(baseTerms, normalizedQuery, INTENT_TRIGGERS_NORM.duty);

        score += scorePhrase(titleNorm, normalizedQuery, 30);
        score += scorePhrase(courseNorm, normalizedQuery, 28);
        score += scorePhrase(categoryNorm, normalizedQuery, 18);
        score += scorePhrase(previewNorm, normalizedQuery, 12);
        score += scoreText(titleNorm, terms, 2);
        score += scoreText(courseNorm, terms, 4);
        score += scoreText(categoryNorm, terms, 2);
        score += scoreText(previewNorm, terms, 1);
        score += scoreText(keywordsNorm, terms, 1);
        if (softTerms.length) {
          score += scoreText(titleNorm, softTerms, 1);
          score += scoreText(courseNorm, softTerms, 1.5);
          score += scoreText(categoryNorm, softTerms, 1);
          score += scoreText(previewNorm, softTerms, 0.6);
          score += scoreText(keywordsNorm, softTerms, 0.6);
        }

        if (baseTerms.length) {
          const termHits = baseTerms.filter((t) => combinedNorm.includes(t)).length;
          const headerHits = baseTerms.filter((t) => headerNorm.includes(t)).length;
          score += termHits * (baseTerms.length > 1 ? 3 : 2);
          if (termHits === baseTerms.length) score += baseTerms.length > 1 ? 12 : 6;
          if (baseTerms.length > 1 && termHits === 1) score -= 6;
          if (baseTerms.length > 1 && termHits === 0) score -= 4;
          if (baseTerms.length > 1) {
            score += headerHits * 2;
            if (headerHits === baseTerms.length) score += 6;
            if (headerHits === 0 && termHits > 0) score -= 4;
          }
        }

        if (vmsHit && !queryHasVms) score -= 8;

        if (isCommunication) {
          const hasCommunicationCue = includesAny(combinedNorm, COMMUNICATION_CUES_NORM);
          if (courseNorm.includes("communicatie advies en instructie")) score += 38;
          if (categoryNorm.includes("communicatie advies en instructie")) score += 28;
          if (includesAny(courseNorm, INTENT_BOOSTS_NORM.communication)) score += 18;
          if (includesAny(categoryNorm, INTENT_BOOSTS_NORM.communication)) score += 12;
          if (includesAny(titleNorm, INTENT_BOOSTS_NORM.communication)) score += 8;
          if (includesAny(previewNorm, INTENT_BOOSTS_NORM.communication)) score += 6;
          if (includesAny(categoryNorm, COMMUNICATION_PENALTIES_NORM)) score -= 10;
          if (includesAny(courseNorm, COMMUNICATION_PENALTIES_NORM)) score -= 12;
          if (!hasCommunicationCue) score -= 12;
          if (hasCommunicationCue) score += 12;
          if (!normalizedQuery.includes("triage") && (courseNorm.includes("triage") || categoryNorm.includes("triage"))) {
            score -= 32;
          }
        }

        if (isWoundcare) {
          if (includesAny(courseNorm, WOUNDCARE_COURSE_BOOSTS_NORM)) score += 14;
          if (includesAny(categoryNorm, WOUNDCARE_COURSE_BOOSTS_NORM)) score += 8;
          if (includesAny(courseNorm, WOUNDCARE_PENALTIES_NORM)) score -= 6;
          if (includesAny(categoryNorm, WOUNDCARE_PENALTIES_NORM)) score -= 4;
          if (includesAny(courseNorm, INTENT_BOOSTS_NORM.woundcare)) score += 14;
          if (includesAny(categoryNorm, INTENT_BOOSTS_NORM.woundcare)) score += 10;
          if (includesAny(previewNorm, INTENT_BOOSTS_NORM.woundcare)) score += 6;
          if (!includesAny(combinedNorm, WOUND_CUES_NORM)) score -= 10;
          if (vmsHit && !normalizedQuery.includes("infectie")) score -= 24;
        }

        if (isMedication) {
          if (includesAny(courseNorm, INTENT_BOOSTS_NORM.medication)) score += 14;
          if (includesAny(categoryNorm, INTENT_BOOSTS_NORM.medication)) score += 10;
          if (includesAny(previewNorm, INTENT_BOOSTS_NORM.medication)) score += 6;
          if (!includesAny(combinedNorm, MEDICATION_CUES_NORM)) score -= 10;
          if (vmsHit && !queryHasVerification) score -= 46;
        }

        if (isIncident) {
          if (includesAny(courseNorm, INTENT_BOOSTS_NORM.incident)) score += 14;
          if (includesAny(categoryNorm, INTENT_BOOSTS_NORM.incident)) score += 10;
          if (includesAny(previewNorm, SCENARIO_CUES_NORM)) score += 6;
          if ((previewNorm.startsWith("vraag") || previewNorm.startsWith("stelling")) && !includesAny(previewNorm, SCENARIO_CUES_NORM)) {
            score -= 3;
          }
          if (!includesAny(combinedNorm, INCIDENT_CUES_NORM)) score -= 8;
        }

        if (isLaw) {
          if (includesAny(courseNorm, INTENT_BOOSTS_NORM.law)) score += 10;
          if (includesAny(categoryNorm, INTENT_BOOSTS_NORM.law)) score += 6;
        }

        if (isDuty) {
          if (includesAny(courseNorm, INTENT_BOOSTS_NORM.duty)) score += 12;
          if (includesAny(categoryNorm, INTENT_BOOSTS_NORM.duty)) score += 8;
          if (includesAny(previewNorm, INTENT_BOOSTS_NORM.duty)) score += 4;
        }

        if (normalizedQuery.includes("anatomie") || normalizedQuery.includes("fysiologie") || normalizedQuery.includes("klinisch redeneren")) {
          if (categoryNorm.includes("verpleegkunde") || categoryNorm.includes("verzorgende ig")) score += 6;
          if (courseNorm.includes("verpleegkunde") || courseNorm.includes("verzorgende ig")) score += 4;
        }

        if (topicTags.length) {
          const tagSet = new Set(topicTags.map((t) => t.toLowerCase()));
          if (isCommunication && tagSet.has("communication")) score += 12;
          if (isWoundcare && tagSet.has("woundcare")) score += 12;
          if (isMedication && tagSet.has("medication")) score += 12;
          if (isIncident && tagSet.has("incident")) score += 10;
          if (isLaw && tagSet.has("law")) score += 8;
          if (normalizedQuery.includes("privacy") && tagSet.has("privacy")) score += 8;
          if (normalizedQuery.includes("hygiene") && tagSet.has("hygiene")) score += 8;
          if (normalizedQuery.includes("klinisch") && tagSet.has("clinical_reasoning")) score += 10;
          if (normalizedQuery.includes("anatomie") && tagSet.has("anatomy")) score += 10;
          if (normalizedQuery.includes("fysiologie") && tagSet.has("physiology")) score += 10;
          if (normalizedQuery.includes("triage") && tagSet.has("triage")) score += 8;
          if (normalizedQuery.includes("veilig") && tagSet.has("patient_safety")) score += 6;
          if (normalizedQuery.includes("ethiek") && tagSet.has("ethics")) score += 6;
        }

        if (moduleFamily) {
          const family = moduleFamily.toLowerCase();
          if (normalizedQuery.includes("triage") && family === "triage") score += 10;
          if (normalizedQuery.includes("wetgeving") && family === "wetgeving") score += 8;
          if (normalizedQuery.includes("klinisch") && family === "pkr") score += 8;
          if (normalizedQuery.includes("communicatie") && family === "communicatie") score += 10;
          if (normalizedQuery.includes("vms") && family === "vms") score += 6;
        }
      }
      if (kdCode && kdCodes.some((c: string) => c.toLowerCase() === kdCode.toLowerCase())) score += 5;
      if (materialType && mt.toLowerCase() === materialType.toLowerCase()) score += 2;
      if (pickedLang && languageVariant && pickedLang.toLowerCase() === languageVariant.toLowerCase()) score += 2;
      if (mt.toLowerCase() === "oefening" && preview) {
        const previewNorm = normalizeText(preview);
        if (PRACTICE_CUES.some((cue) => previewNorm.includes(cue))) score += 4;
      }

      return {
        id: row.id,
        title,
        material_type: mt || undefined,
        course_name: courseName || undefined,
        category: category || undefined,
        mbo_level: derivedMboLevel || undefined,
        source: sourceType || undefined,
        language_variant: pickedLang || undefined,
        metadata: metadataOutPresent,
        kd_codes: kdCodes,
        preview: preview || undefined,
        storage_bucket: storageBucket || undefined,
        storage_path: storagePath || undefined,
        score,
        updated_at: row.updated_at || row.created_at || null,
      };
    })
    .filter((r) => {
      if (!r.title) return false;
      if (kdCode && !(r.kd_codes || []).some((c: string) => c.toLowerCase() === kdCode.toLowerCase())) return false;
      if (materialType && (r.material_type || "").toLowerCase() !== materialType.toLowerCase()) return false;
      if (categoryFilter && !(r.category || "").toLowerCase().includes(categoryFilter.toLowerCase())) return false;
      if (mboLevelFilter && (r.mbo_level || "").toLowerCase() !== mboLevelFilter.toLowerCase()) return false;
      if (sourceFilter && (r.source || "").toLowerCase() !== sourceFilter.toLowerCase()) return false;
      const metadata = (r as any).metadata || {};
      const mboTrack = typeof metadata.mbo_track === "string" ? metadata.mbo_track : "";
      const moduleFamily = typeof metadata.module_family === "string" ? metadata.module_family : "";
      const topicTags = Array.isArray(metadata.topic_tags) ? metadata.topic_tags : [];
      const exerciseFormat = typeof metadata.exercise_format === "string" ? metadata.exercise_format : "";
      const lawTopics = Array.isArray(metadata.law_topics) ? metadata.law_topics : [];
      const communicationContext = Array.isArray(metadata.communication_context) ? metadata.communication_context : [];
      const scenarioPresent = metadata.scenario_present === true;
      if (mboTrackFilter && mboTrack.toLowerCase() !== mboTrackFilter.toLowerCase()) return false;
      if (moduleFamilyFilter && moduleFamily.toLowerCase() !== moduleFamilyFilter.toLowerCase()) return false;
      if (topicTagFilter && !topicTags.some((t: string) => t.toLowerCase() === topicTagFilter.toLowerCase())) return false;
      if (exerciseFormatFilter && exerciseFormat.toLowerCase() !== exerciseFormatFilter.toLowerCase()) return false;
      if (lawTopicFilter && !lawTopics.some((t: string) => t.toLowerCase() === lawTopicFilter.toLowerCase())) return false;
      if (communicationContextFilter && !communicationContext.some((t: string) => t.toLowerCase() === communicationContextFilter.toLowerCase())) return false;
      if (scenarioPresentFilter !== null && scenarioPresentFilter !== scenarioPresent) return false;
      // If a language variant was requested, only include records that have that variant.
      if (languageVariant && (r.language_variant || "").toLowerCase() !== languageVariant.toLowerCase()) return false;
      if (languageVariant && (!r.storage_bucket || !r.storage_path)) return false;
      if (query && r.score <= 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.updated_at ? Date.parse(a.updated_at) : 0;
      const bTime = b.updated_at ? Date.parse(b.updated_at) : 0;
      return bTime - aTime;
    })
    .slice(0, limit)
    .map(({ updated_at: _updatedAt, ...rest }) => rest);

  return json(req, reqId, {
    ok: true,
    query,
    filters: {
      ...(kdCode ? { kd_code: kdCode } : {}),
      ...(materialType ? { material_type: materialType } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(mboLevelFilter ? { mbo_level: mboLevelFilter } : {}),
      ...(sourceFilter ? { source: sourceFilter } : {}),
      ...(languageVariant ? { language_variant: languageVariant } : {}),
      ...(mboTrackFilter ? { mbo_track: mboTrackFilter } : {}),
      ...(moduleFamilyFilter ? { module_family: moduleFamilyFilter } : {}),
      ...(topicTagFilter ? { topic_tag: topicTagFilter } : {}),
      ...(exerciseFormatFilter ? { exercise_format: exerciseFormatFilter } : {}),
      ...(scenarioPresentFilter !== null ? { scenario_present: scenarioPresentFilter } : {}),
      ...(lawTopicFilter ? { law_topic: lawTopicFilter } : {}),
      ...(communicationContextFilter ? { communication_context: communicationContextFilter } : {}),
      limit,
    },
    results,
    requestId: reqId,
  });
});

