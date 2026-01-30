import { createClient } from "npm:@supabase/supabase-js@2";
import { generateJson } from "./ai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

export const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v;
}

export function normalizeText(input: string): string {
  return String(input || "").toLowerCase().trim();
}

export function truncateSnippet(text: string, maxLen: number = 280): string {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

export async function generateEmbedding(text: string, opts: { apiKey: string; model: string }): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("Embeddings response missing embedding array");
  return emb as number[];
}

export type IndexDocMeta = { title?: string; url?: string; indexed_at?: string; chunk_count?: number };

export async function loadMesIndexMeta(organizationId: string): Promise<Record<string, IndexDocMeta> | null> {
  const indexPath = `${organizationId}/mes-corpus/index.json`;
  const { data, error } = await adminSupabase.storage.from("materials").download(indexPath);
  if (error || !data) return null;
  try {
    const text = await data.text();
    const json = text ? JSON.parse(text) : null;
    const docs = json?.documents;
    if (!docs || typeof docs !== "object") return null;
    return docs as Record<string, IndexDocMeta>;
  } catch {
    return null;
  }
}

export function deriveMesCourseId(docId: string): string | undefined {
  const id = String(docId || "").trim();
  if (!id) return undefined;
  if (id.toLowerCase().startsWith("mes-")) return id;
  if (/^\d+$/.test(id)) return `mes-${id}`;
  return undefined;
}

export type Citation = {
  source: "material" | "mes" | "book";
  course_id: string;
  item_index: number;
  similarity: number;
  text: string;
};

export type MaterialRecommendation = {
  material_id: string;
  title: string;
  score: number;
  snippet?: string;
  file_name?: string;
  content_type?: string;
  storage_bucket?: string;
  storage_path?: string;
  updated_at?: string;
};

export type RecommendationSource = "library-material" | "curated" | "mes";

export type UnifiedRecommendation = {
  source: RecommendationSource;
  id: string;
  title: string;
  score: number;
  snippet?: string;
  why?: string;
  url?: string;
  file_name?: string;
  content_type?: string;
  storage_bucket?: string;
  storage_path?: string;
  updated_at?: string;
  // Back-compat for library-material selections
  material_id?: string;
  course_id?: string;
};

export type LessonPlan = {
  quickStart: {
    oneLiner: string;
    keyConcepts: string[];
    timeAllocation: { start: number; kern: number; afsluiting: number };
  };
  teacherScript: Array<{ time: string; phase: "start" | "kern" | "afsluiting"; action: string; content: string }>;
  discussionQuestions: Array<{ question: string; expectedAnswers: string[] }>;
  groupWork?: { title: string; steps: string[]; durationMinutes: number };
  kdAlignment: { code: string; title: string };
  // Enhanced fields for comprehensive lesson planning
  assignments?: Array<{
    type: "huiswerk" | "praktijk" | "reflectie" | "toets" | "portfolio";
    title: string;
    description: string;
    durationMinutes?: number;
  }>;
  eLearningTopics?: string[]; // Topics to search for in e-learning modules
  assessmentCriteria?: string[]; // What the student should demonstrate
  differentiationTips?: { n3?: string; n4?: string }; // Tips for mixed-level classes
  materials?: string[]; // Required materials/resources
};

export type KdCheckItem = { ok: boolean; text: string };
export type KdCheck = {
  code: string;
  items: KdCheckItem[];
  score: { passed: number; total: number };
};

export type KdWerkproces = {
  code: string;
  titel: string;
  omschrijving?: string;
  resultaat?: string;
  kerntaak?: string;
};

export type CuratedMaterialResult = {
  id: string;
  title: string;
  course_name?: string;
  category?: string;
  preview?: string;
  kd_codes: string[];
  storage_bucket?: string;
  storage_path?: string;
  score: number;
  fullContent?: string;
};

export function buildKdCheck(kdCode: string): KdCheck {
  const code = String(kdCode || "").toUpperCase().trim();
  const mapping: Record<string, string[]> = {
    "B1-K1-W2": [
      "Zorgplan opstellen/bijstellen → Casus met veranderende situatie",
      "Eigen regie zorgvrager → Afstemming met zorgvrager besproken",
      "Signaleren en analyseren → Observatie en rapportage",
      "SMART-doelen → Concrete aanpassingen formuleren",
    ],
    "B1-K1-W3": [
      "Zorginterventies uitvoeren → Praktijkoefening opgenomen",
      "Eigen regie stimuleren → Toestemming vragen besproken",
      "Veiligheid waarborgen → Protocol en checklist gebruikt",
      "Rapportage → Vastleggen na handeling",
    ],
    "B1-K1-W5": [
      "Acute situaties herkennen → ABCDE-methodiek centraal",
      "Alarmprocedure → Wanneer hulp inschakelen",
      "Veiligheid inschatten → Gevaar voor zelf/anderen",
      "Praktijkgericht → Simulatieoefening",
    ],
    "B1-K2-W2": [
      "Samenwerken met professionals → Rollenspel MDO/overdracht",
      "Professionele communicatie → SBAR-structuur",
      "Informatieoverdracht → Telefoongesprek simulatie",
      "Afstemmen afspraken → Vastleggen in zorgplan",
    ],
    "B1-K3-W2": [
      "Reflecteren op werkzaamheden → STARR-methode",
      "Verbeterpunten formuleren → Concrete acties",
      "Professionele ontwikkeling → Portfolio/stagegesprek",
      "Feedback ontvangen → Peer feedback",
    ],
  };

  const defaultItems = [
    "Leerdoel sluit aan bij het KD",
    "Werkvormen zijn activerend en praktijkgericht",
    "Beoordeling/observatie is duidelijk (wat laat de student zien?)",
    "Reflectie of evaluatie is opgenomen",
  ];

  const items = (mapping[code] || defaultItems).map((text) => ({ ok: true, text } satisfies KdCheckItem));
  const passed = items.filter((i) => i.ok).length;
  return {
    code: code || "KD-ONBEKEND",
    items,
    score: { passed, total: items.length },
  };
}

// Embedded KD 2026 data (VIG/VP) - werkprocessen from basisdeel and profieldeel
const KD_WERKPROCESSEN: KdWerkproces[] = [
  // B1-K1: Biedt zorg, ondersteuning en begeleiding
  { code: "B1-K1-W1", titel: "Inventariseert de behoefte aan zorg en/of ondersteuning", kerntaak: "Biedt zorg, ondersteuning en begeleiding", omschrijving: "De beginnend beroepsbeoefenaar verzamelt en analyseert informatie over de lichamelijke, sociale, psychische gezondheid en het welzijn van de zorgvrager door het observeren van gedrag bij de zorgvrager en het stellen van gerichte vragen aan de zorgvrager en/of diens naastbetrokkenen.", resultaat: "De zorg- en/of ondersteuningsbehoefte is geïnventariseerd, besproken en gerapporteerd." },
  { code: "B1-K1-W2", titel: "Stelt het zorgplan op en/of bij", kerntaak: "Biedt zorg, ondersteuning en begeleiding", omschrijving: "De beginnend beroepsbeoefenaar gebruikt beschikbare informatie om een bijdrage te leveren aan het zorgplan. Bespreekt met de zorgvrager en/of naastbetrokkenen de informatie, de huidige gezondheidstoestand, wat mogelijk is, wat moeilijk gaat en welke zorg of ondersteuning nodig is.", resultaat: "Het zorgplan is samen met de zorgvrager en/of diens naastbetrokkenen bijgesteld." },
  { code: "B1-K1-W3", titel: "Voert zorginterventies en/of begeleidingsactiviteiten uit", kerntaak: "Biedt zorg, ondersteuning en begeleiding", omschrijving: "De beginnend beroepsbeoefenaar voert de interventies uit zoals beschreven in het zorgplan, stimuleert de eigen regie van de zorgvrager en/of naastbetrokkenen. Biedt waar nodig zorg en ondersteuning en activeert waar nodig.", resultaat: "De zorginterventies en/of begeleidingsactiviteiten zijn volgens plan uitgevoerd." },
  { code: "B1-K1-W4", titel: "Voert verpleegtechnische handelingen uit", kerntaak: "Biedt zorg, ondersteuning en begeleiding", omschrijving: "De beginnend beroepsbeoefenaar neemt de benodigde voorzorgsmaatregelen en verzamelt materialen en middelen. Controleert vooraf de gezondheidssituatie en observeert de zorgvrager voor, tijdens en na de handeling.", resultaat: "De verpleegtechnische handelingen zijn binnen de kaders van de bevoegdheden en volgens de wet- en regelgeving (de Wet BIG) uitgevoerd." },
  { code: "B1-K1-W5", titel: "Handelt in onvoorziene en/of acute situaties", kerntaak: "Biedt zorg, ondersteuning en begeleiding", omschrijving: "In het geval van situaties waarbij direct handelen noodzakelijk is, omdat (lichamelijk of geestelijk) letsel kan ontstaan, maakt de beginnend beroepsbeoefenaar een inschatting van de situatie en het gevaar voor zichzelf, de zorgvrager en anderen.", resultaat: "Incidenten of calamiteiten zijn volgens protocol/richtlijnen afgehandeld (met zo min mogelijk (vervolg)schade) en gemeld." },
  { code: "B1-K1-W6", titel: "Geeft informatie en advies over zorg en gezondheid", kerntaak: "Biedt zorg, ondersteuning en begeleiding", omschrijving: "De beginnend beroepsbeoefenaar geeft de zorgvrager en/of de naastbetrokkenen informatie en beantwoordt vragen over de zorg en ondersteuning. Legt aan de zorgvrager en/of de naastbetrokkenen uit hoe een bepaalde handeling moet worden uitgevoerd.", resultaat: "Er is informatie en advies gegeven afgestemd op de behoefte van de zorgvrager en gericht op een gezonde leefstijl en zoveel als mogelijk eigen regie." },
  // B1-K2: Stemt de zorg en ondersteuning af
  { code: "B1-K2-W1", titel: "Stemt af met informele zorgverleners", kerntaak: "Stemt de zorg en ondersteuning af", omschrijving: "De beginnend beroepsbeoefenaar bespreekt periodiek de te verlenen zorg en ondersteuning met de informele zorgverleners, zoals vrijwilligers, mantelzorgers, familie, vrienden, buren en betrekt hen bij het zorgproces.", resultaat: "De zorgverlening is informeel afgestemd en gemaakte afspraken zijn vastgelegd in het zorgplan." },
  { code: "B1-K2-W2", titel: "Werkt samen met andere zorgprofessionals", kerntaak: "Stemt de zorg en ondersteuning af", omschrijving: "De beginnend beroepsbeoefenaar neemt deel aan interprofessioneel overleg en stemt (periodiek) de verdeling en uitvoering van zorgtaken af met andere zorgprofessionals binnen en buiten de organisatie.", resultaat: "De zorgverlening is interprofessioneel afgestemd en gemaakte afspraken zijn vastgelegd." },
  // B1-K3: Draagt bij aan kwaliteit van zorg
  { code: "B1-K3-W1", titel: "Draagt bij aan het innoveren van zorg", kerntaak: "Draagt bij aan kwaliteit van zorg", omschrijving: "De beginnend beroepsbeoefenaar bespreekt nieuwe (technologische) ontwikkelingen in de zorg en de mogelijke inzet van nieuwe zorg- en (technologische) hulpmiddelen, die een bijdrage leveren aan effectievere en efficiëntere zorg.", resultaat: "De beginnend beroepsbeoefenaar heeft een bijdrage geleverd aan het innoveren van de zorg en de inzet van (technologische) hulpmiddelen." },
  { code: "B1-K3-W2", titel: "Evalueert de werkzaamheden en ontwikkelt zichzelf als professional", kerntaak: "Draagt bij aan kwaliteit van zorg", omschrijving: "De beginnend beroepsbeoefenaar bespreekt (periodiek) de uitgevoerde werkzaamheden, de bekwaamheid, eventuele (niet-medische) klachten en bijzonderheden zoals incidenten of ethische dilemma's met collega's.", resultaat: "De werkzaamheden zijn samen met collega's geëvalueerd, hierbij zijn concrete verbeterpunten geformuleerd." },
  { code: "B1-K3-W3", titel: "Draagt bij aan een sociaal en fysiek veilige werkomgeving", kerntaak: "Draagt bij aan kwaliteit van zorg", omschrijving: "De beginnend beroepsbeoefenaar controleert de veiligheid van de werkplek en/of materialen en middelen. Signaleert mogelijke bijzonderheden en risico's voor de (sociale) veiligheid.", resultaat: "De beginnend beroepsbeoefenaar heeft een bijdrage geleverd aan een fysiek en sociaal veilige werkomgeving. Eventuele bijzonderheden zijn gemeld." },
  // P2-K1: Organiseert en coördineert de zorgverlening (niveau 4)
  { code: "P2-K1-W1", titel: "Stelt een verpleegkundige diagnose", kerntaak: "Organiseert en coördineert de zorgverlening", omschrijving: "De beginnend beroepsbeoefenaar stelt zich op de hoogte van de medische diagnose. Observeert en signaleert veranderingen in gezondheid, gedrag, welbevinden en zelfredzaamheid van de zorgvrager. Analyseert beschikbare informatie en stelt op basis van klinisch redeneren de verpleegkundige diagnose.", resultaat: "De verpleegkundige diagnose is gesteld op basis van klinisch redeneren en de bijbehorende zorginterventies en ondersteuning zijn gepland." },
  { code: "P2-K1-W2", titel: "Coacht en begeleidt collega's", kerntaak: "Organiseert en coördineert de zorgverlening", omschrijving: "De beginnend beroepsbeoefenaar geeft (nieuwe) collega's informatie over de te verrichten taken, werkwijzen (en/of prioriteiten) en het inwerkprogramma. Beantwoordt vragen en gaat na of de informatie is overgekomen door het stellen van controlevragen.", resultaat: "Collega's zijn gecoacht en begeleid in de werkzaamheden en er is samen met collega's geleerd." },
  { code: "P2-K1-W3", titel: "Coördineert en optimaliseert de zorgverlening", kerntaak: "Organiseert en coördineert de zorgverlening", omschrijving: "De beginnend beroepsbeoefenaar stelt prioriteiten in de uit te voeren taken, maakt een planning, verdeelt de werkzaamheden, maakt de genomen stappen inzichtelijk voor anderen en denkt mee over hoe werkzaamheden anders en efficiënter kunnen worden uitgevoerd.", resultaat: "Werkzaamheden worden uitgevoerd, gemonitord en bijgesteld waar nodig." },
];

export function loadKdContext(): KdWerkproces[] {
  return KD_WERKPROCESSEN;
}

function extractKdCode(queryText: string): string | null {
  const m = String(queryText || "").match(/\bB\d-K\d-W\d\b/i);
  return m ? m[0].toUpperCase() : null;
}

function selectKdMatches(queryText: string, items: KdWerkproces[]): KdWerkproces[] {
  const code = extractKdCode(queryText);
  if (code) {
    const exact = items.find((i) => i.code.toUpperCase() === code);
    return exact ? [exact] : [];
  }
  const q = normalizeText(queryText);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = items.map((i) => {
    const hay = normalizeText([i.code, i.titel, i.kerntaak].filter(Boolean).join(" "));
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 1;
    }
    return { item: i, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.item);
}

// === CURATED MATERIAL SEARCH ===

export async function searchCuratedMaterials(args: {
  organizationId: string;
  query: string;
  limit?: number;
  topic_tag?: string;
}): Promise<CuratedMaterialResult[]> {
  const { organizationId, query, limit = 10, topic_tag } = args;
  const q = normalizeText(query);

  if (!q) return [];

  // Query entity_records with entity="curated-material"
  let dbQuery = adminSupabase
    .from("entity_records")
    .select("id, data, meta")
    .eq("organization_id", organizationId)
    .eq("entity", "curated-material")
    .limit(100); // Get more to filter locally

  if (topic_tag) {
    // Filter by topic_tag if provided (stored in meta.topic_tag)
    dbQuery = dbQuery.eq("meta->topic_tag", topic_tag);
  }

  const { data: records, error } = await dbQuery;

  if (error) {
    console.error("[searchCuratedMaterials] DB error:", error);
    return [];
  }

  if (!records || records.length === 0) return [];

  // Score and filter results based on query match
  const scored = records.map((record: any) => {
    const data = record.data || {};
    const meta = record.meta || {};

    const title = String(data.title || "").toLowerCase();
    const courseName = String(data.course_name || meta.course_name || "").toLowerCase();
    const category = String(data.category || meta.category || "").toLowerCase();
    const preview = String(data.preview || "").toLowerCase();
    const kdCodes = Array.isArray(data.kd_codes) ? data.kd_codes : [];

    // Calculate relevance score
    let score = 0;
    const queryWords = q.split(/\s+/).filter(Boolean);

    for (const word of queryWords) {
      if (title.includes(word)) score += 10;
      if (courseName.includes(word)) score += 5;
      if (category.includes(word)) score += 3;
      if (preview.includes(word)) score += 2;
      // Check KD codes
      for (const kd of kdCodes) {
        if (String(kd).toLowerCase().includes(word)) score += 4;
      }
    }

    // Boost for exact phrase match
    if (title.includes(q)) score += 20;
    if (preview.includes(q)) score += 10;

    return {
      id: record.id,
      title: data.title || "Untitled",
      course_name: data.course_name || meta.course_name,
      category: data.category || meta.category,
      preview: data.preview,
      kd_codes: kdCodes,
      storage_bucket: data.storage_bucket || meta.storage_bucket,
      storage_path: data.storage_path || meta.storage_path,
      score,
    };
  });

  // Filter and sort by score
  const results = scored
    .filter((r: CuratedMaterialResult) => r.score > 0)
    .sort((a: CuratedMaterialResult, b: CuratedMaterialResult) => b.score - a.score)
    .slice(0, limit);

  return results;
}

export async function fetchMaterialContent(args: {
  storageBucket: string;
  storagePath: string;
  maxLength?: number;
}): Promise<string> {
  const { storageBucket, storagePath, maxLength = 8000 } = args;

  try {
    const { data, error } = await adminSupabase.storage
      .from(storageBucket)
      .download(storagePath);

    if (error || !data) {
      console.error("[fetchMaterialContent] Storage error:", error);
      return "";
    }

    let text = await data.text();

    // Strip HTML tags if content is HTML
    if (text.includes("<") && text.includes(">")) {
      text = stripHtmlTags(text);
    }

    // Truncate if needed
    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + "\n... [content truncated]";
    }

    return text;
  } catch (err) {
    console.error("[fetchMaterialContent] Error:", err);
    return "";
  }
}

export function stripHtmlTags(html: string): string {
  // Remove script and style contents completely
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Replace common block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\n\s+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * Generates a lesson plan using LLM.
 *
 * NOTE: In synchronous Edge Functions you must keep this bounded to platform limits.
 * In the async job-runner pipeline, this can be retried across yields.
 */
export async function generateLessonPlan(args: {
  queryText: string;
  materialContent?: string;
  timeoutMs?: number;
}): Promise<LessonPlan> {
  const kdItems = loadKdContext();
  const matches = selectKdMatches(args.queryText, kdItems);
  const primary = matches[0] || { code: "KD-ONBEKEND", titel: "Onbekend KD-onderdeel" };

  const system = [
    "Je bent een MBO-curriculumontwikkelaar voor Verpleegkunde/VIG.",
    "Output ALLEEN geldige JSON. Geen markdown. Houd teksten KORT (max 25 woorden per veld).",
    args.materialContent ? "Gebruik het beschikbare materiaal." : "",
  ].filter(Boolean).join("\n");

  const prompt = [
    `Lesplan 45min: ${args.queryText}`,
    `KD: ${primary.code} - ${primary.titel}`,
    args.materialContent ? `\nMateriaal:\n${args.materialContent.slice(0, 1200)}` : "",
    "",
    "JSON met deze velden (KORT!):",
    "quickStart: {oneLiner, keyConcepts[3], timeAllocation:{start,kern,afsluiting}}",
    "teacherScript: [{time, phase, action, content}] (max 4 stappen)",
    "discussionQuestions: [{question, expectedAnswers}] (max 2)",
    "groupWork: {title, steps, durationMinutes}",
    "kdAlignment: {code, title}",
    "assignments: [{type, title, description}] (1 huiswerk/praktijk)",
    "eLearningTopics: [3 zoektermen]",
    "materials: [benodigdheden]",
  ].filter(Boolean).join("\n");

  const timeoutMs = Number.isFinite(args.timeoutMs) ? Math.max(5_000, Math.floor(args.timeoutMs!)) : 45_000;

  // Retry logic for robustness - keep bounded per attempt
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateJson({
      system,
      prompt,
      maxTokens: 2500,
      temperature: 0.2,
      timeoutMs,
    });

    if (!res.ok) {
      lastError = res.error || "generation_failed";
      continue;
    }

    // Try to extract JSON from the response
    let jsonText = res.text.trim();

    // Handle potential markdown wrapping
    if (jsonText.startsWith("```")) {
      const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) jsonText = match[1].trim();
    }

    // Try to parse
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      // Try to fix common issues
      try {
        // Remove trailing commas and fix common JSON issues
        const fixed = jsonText
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]")
          .replace(/[\x00-\x1F\x7F]/g, " "); // Remove control chars
        parsed = JSON.parse(fixed);
      } catch {
        lastError = `json_parse_failed: ${String(e)}`;
        continue;
      }
    }

    if (!parsed || typeof parsed !== "object") {
      lastError = "invalid_json_structure";
      continue;
    }

    // Validate required fields exist
    if (!parsed.quickStart || !parsed.teacherScript) {
      lastError = "missing_required_fields";
      continue;
    }

    return {
      quickStart: parsed.quickStart || { oneLiner: "", keyConcepts: [], timeAllocation: { start: 10, kern: 25, afsluiting: 10 } },
      teacherScript: Array.isArray(parsed.teacherScript) ? parsed.teacherScript : [],
      discussionQuestions: Array.isArray(parsed.discussionQuestions) ? parsed.discussionQuestions : [],
      groupWork: parsed.groupWork,
      kdAlignment: parsed.kdAlignment || { code: primary.code, title: primary.titel },
      // Enhanced fields
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : undefined,
      eLearningTopics: Array.isArray(parsed.eLearningTopics) ? parsed.eLearningTopics : undefined,
      assessmentCriteria: Array.isArray(parsed.assessmentCriteria) ? parsed.assessmentCriteria : undefined,
      differentiationTips: parsed.differentiationTips || undefined,
      materials: Array.isArray(parsed.materials) ? parsed.materials : undefined,
    } as LessonPlan;
  }

  throw new Error(`lesson_plan_generation_failed after retries: ${lastError}`);
}

export async function retrievePrefix(args: {
  organizationId: string;
  prefix: string;
  embedding: number[];
  limit: number;
}): Promise<Citation[]> {
  const { data, error } = await adminSupabase.rpc("match_content_embeddings_prefix", {
    p_organization_id: args.organizationId,
    p_course_id_prefix: args.prefix,
    p_query_embedding: args.embedding,
    p_limit: args.limit,
  });
  if (error) throw new Error(`match_content_embeddings_prefix failed: ${error.message}`);
  const rows: any[] = Array.isArray(data) ? data : [];
  return rows
    .map((r) => ({
      course_id: String(r?.course_id || ""),
      item_index: Number(r?.item_index ?? -1),
      similarity: Number(r?.similarity ?? 0),
      text: String(r?.text_content ?? ""),
    }))
    .filter((r) => r.course_id && Number.isFinite(r.item_index) && r.item_index >= 0 && r.text.trim())
    .map((r) => ({
      source: args.prefix.startsWith("mes:") ? "mes" : args.prefix.startsWith("book:") ? "book" : "material",
      course_id: r.course_id,
      item_index: r.item_index,
      similarity: r.similarity,
      text: r.text,
    }));
}

export async function retrieveMaterialRecommendations(args: {
  organizationId: string;
  embedding: number[];
  limit: number;
}): Promise<MaterialRecommendation[]> {
  const raw = await retrievePrefix({
    organizationId: args.organizationId,
    prefix: "material:",
    embedding: args.embedding,
    // Pull more chunks than we need so we can dedupe by material_id.
    limit: Math.min(80, Math.max(args.limit * 8, 24)),
  });

  const byMaterial = new Map<
    string,
    { material_id: string; best: number; snippet: string }
  >();

  for (const c of raw) {
    const courseId = String(c.course_id || "");
    if (!courseId.startsWith("material:")) continue;
    const materialId = courseId.slice("material:".length).trim();
    if (!materialId) continue;

    const existing = byMaterial.get(materialId);
    if (!existing || c.similarity > existing.best) {
      byMaterial.set(materialId, {
        material_id: materialId,
        best: c.similarity,
        snippet: c.text,
      });
    }
  }

  const ranked = Array.from(byMaterial.values())
    .sort((a, b) => b.best - a.best)
    .slice(0, Math.max(1, Math.min(12, args.limit)));

  if (ranked.length === 0) return [];

  const ids = ranked.map((r) => r.material_id);
  const { data: rows, error } = await adminSupabase
    .from("entity_records")
    .select("id, title, data, updated_at")
    .eq("organization_id", args.organizationId)
    .eq("entity", "library-material")
    .in("id", ids);
  if (error) throw new Error(`Failed to load library-material records: ${error.message}`);

  const byId = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    byId.set(String((r as any).id || ""), r);
  }

  return ranked.map((r) => {
    const row = byId.get(r.material_id);
    const data = row?.data && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {};
    const title = typeof row?.title === "string" && row.title.trim()
      ? row.title.trim()
      : typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : typeof data.file_name === "string" && data.file_name.trim()
          ? data.file_name.trim()
          : `Material ${r.material_id}`;

    const snippet = String(r.snippet || "").trim();
    const truncated = snippet.length > 260 ? `${snippet.slice(0, 260)}…` : snippet;

    return {
      material_id: r.material_id,
      title,
      score: r.best,
      snippet: truncated || undefined,
      file_name: typeof data.file_name === "string" ? data.file_name : undefined,
      content_type: typeof data.content_type === "string" ? data.content_type : undefined,
      storage_bucket: typeof data.storage_bucket === "string" ? data.storage_bucket : undefined,
      storage_path: typeof data.storage_path === "string" ? data.storage_path : undefined,
      updated_at: typeof row?.updated_at === "string" ? row.updated_at : undefined,
    } satisfies MaterialRecommendation;
  });
}

export function toLibraryMaterialRecommendations(materials: MaterialRecommendation[]): UnifiedRecommendation[] {
  return materials.map((m) => ({
    source: "library-material",
    id: m.material_id,
    material_id: m.material_id,
    title: m.title,
    score: Number.isFinite(m.score) ? m.score : 0,
    snippet: m.snippet,
    why: m.snippet,
    file_name: m.file_name,
    content_type: m.content_type,
    storage_bucket: m.storage_bucket,
    storage_path: m.storage_path,
    updated_at: m.updated_at,
  }));
}

export function toCuratedRecommendations(materials: CuratedMaterialResult[], maxPreview = 260): UnifiedRecommendation[] {
  return materials.map((m) => {
    const preview = truncateSnippet(m.preview || "", maxPreview);
    const kdHint = Array.isArray(m.kd_codes) && m.kd_codes.length ? `KD: ${m.kd_codes.join(", ")}` : "";
    const why = preview || kdHint || undefined;
    return {
      source: "curated",
      id: m.id,
      title: m.title,
      score: Number.isFinite(m.score) ? m.score : 0,
      snippet: preview || undefined,
      why,
      storage_bucket: m.storage_bucket,
      storage_path: m.storage_path,
    };
  });
}

export async function recommendMesModules(args: {
  organizationId: string;
  embedding: number[];
  limit: number;
}): Promise<UnifiedRecommendation[]> {
  const raw = await retrievePrefix({
    organizationId: args.organizationId,
    prefix: "mes:",
    embedding: args.embedding,
    limit: Math.min(80, Math.max(args.limit * 8, 24)),
  });

  const byDoc = new Map<string, { doc_id: string; best: number; snippet: string }>();
  for (const c of raw) {
    const courseId = String(c.course_id || "");
    if (!courseId.startsWith("mes:")) continue;
    const docId = courseId.slice("mes:".length).trim();
    if (!docId) continue;
    const existing = byDoc.get(docId);
    if (!existing || c.similarity > existing.best) {
      byDoc.set(docId, { doc_id: docId, best: c.similarity, snippet: c.text });
    }
  }

  const meta = await loadMesIndexMeta(args.organizationId);

  return Array.from(byDoc.values())
    .sort((a, b) => b.best - a.best)
    .slice(0, Math.max(1, Math.min(12, args.limit)))
    .map((d) => {
      const title = meta?.[d.doc_id]?.title || d.doc_id;
      const url = meta?.[d.doc_id]?.url;
      const snippet = truncateSnippet(d.snippet || "");
      const courseId = deriveMesCourseId(d.doc_id);
      return {
        source: "mes",
        id: d.doc_id,
        title,
        score: Number.isFinite(d.best) ? d.best : 0,
        snippet: snippet || undefined,
        why: snippet || undefined,
        url,
        course_id: courseId,
      };
    });
}

export function mergeRecommendations(lists: UnifiedRecommendation[][], limit = 12): UnifiedRecommendation[] {
  const byKey = new Map<string, UnifiedRecommendation>();
  for (const list of lists) {
    for (const rec of list) {
      const key = `${rec.source}:${rec.id}`;
      const existing = byKey.get(key);
      if (!existing || (rec.score || 0) > (existing.score || 0)) {
        byKey.set(key, rec);
      }
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, Math.max(1, limit));
}

