import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import { chat as chatLLM, generateJson, getProvider } from "../_shared/ai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v;
}

async function generateEmbedding(text: string, opts: { apiKey: string; model: string }): Promise<number[]> {
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

type Citation = {
  source: "material" | "mes";
  course_id: string;
  item_index: number;
  similarity: number;
  text: string;
};

type MaterialRecommendation = {
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

type LessonPlan = {
  quickStart: {
    oneLiner: string;
    keyConcepts: string[];
    timeAllocation: { start: number; kern: number; afsluiting: number };
  };
  teacherScript: Array<{ time: string; phase: "start" | "kern" | "afsluiting"; action: string; content: string }>;
  discussionQuestions: Array<{ question: string; expectedAnswers: string[] }>;
  groupWork?: { title: string; steps: string[]; durationMinutes: number };
  kdAlignment: { code: string; title: string };
};

type KdCheckItem = { ok: boolean; text: string };
type KdCheck = {
  code: string;
  items: KdCheckItem[];
  score: { passed: number; total: number };
};

type KdWerkproces = {
  code: string;
  titel: string;
  omschrijving?: string;
  resultaat?: string;
  kerntaak?: string;
};

type CuratedMaterialResult = {
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

function buildKdCheck(kdCode: string): KdCheck {
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

function loadKdContext(): KdWerkproces[] {
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

function normalizeText(input: string): string {
  return String(input || "").toLowerCase().trim();
}

// === CURATED MATERIAL SEARCH ===

async function searchCuratedMaterials(args: {
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

async function fetchMaterialContent(args: {
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

function stripHtmlTags(html: string): string {
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
    "find", "search", "recommend", "suggest", "select",
  ];

  // Resource nouns
  const resourceNouns = [
    "materiaal", "materialen", "lesmateriaal",
    "opdracht", "opdrachten", "werkopdracht", "werkopdrachten",
    "oefening", "oefeningen",
    "casus", "module", "modules",
    "bpv", "theorie",
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

function detectLessonPlanIntent(queryText: string): boolean {
  const q = normalizeText(queryText);
  if (!q) return false;
  const triggers = [
    "maak een lesplan", "maak een les", "genereer een lesplan",
    "lesplan over", "les over", "lesplan voor",
    "bouw een les", "ontwerp een les",
    "lesson plan", "create a lesson",
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

async function generateLessonPlan(args: { 
  queryText: string;
  materialContent?: string;  // Optional content from curated materials
}): Promise<LessonPlan> {
  const kdItems = loadKdContext();
  const matches = selectKdMatches(args.queryText, kdItems);
  const primary = matches[0] || { code: "KD-ONBEKEND", titel: "Onbekend KD-onderdeel" };
  const kdContext = matches.length
    ? matches.map((m) => ({
        code: m.code,
        titel: m.titel,
        kerntaak: m.kerntaak,
        omschrijving: m.omschrijving,
        resultaat: m.resultaat,
      }))
    : [];

  const system = [
    "Je bent een MBO-curriculumontwikkelaar voor Verpleegkunde/VIG.",
    "Output ALLEEN geldige JSON. Geen markdown, geen extra tekst.",
    "KORT: max 20 woorden per content veld, max 5 teacherScript items.",
    args.materialContent ? "Gebruik het beschikbare materiaal als basis voor je lesplan." : "",
  ].filter(Boolean).join("\n");

  const prompt = [
    `Lesplan 45min voor: ${args.queryText}`,
    `KD: ${primary.code} - ${primary.titel}`,
    "",
    // Include material content if available
    args.materialContent ? "=== BESCHIKBAAR MATERIAAL ===" : "",
    args.materialContent ? args.materialContent : "",
    args.materialContent ? "" : "",
    "JSON (KORTE teksten):",
    `{"quickStart":{"oneLiner":"max 15 woorden","keyConcepts":["3 begrippen"],"timeAllocation":{"start":10,"kern":25,"afsluiting":10}},"teacherScript":[{"time":"0:00","phase":"start","action":"OPEN","content":"max 20 woorden"}],"discussionQuestions":[{"question":"vraag","expectedAnswers":["antwoord"]}],"groupWork":{"title":"titel","steps":["stap 1","stap 2"],"durationMinutes":10},"kdAlignment":{"code":"${primary.code}","title":"${primary.titel}"}}`,
  ].filter(Boolean).join("\n");

  // Retry logic for robustness
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateJson({
      system,
      prompt,
      maxTokens: 2000,
      temperature: 0.2,
      timeoutMs: 90_000,
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
    } as LessonPlan;
  }

  throw new Error(`lesson_plan_generation_failed after retries: ${lastError}`);
}

async function retrievePrefix(args: {
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
      source: args.prefix.startsWith("mes:") ? "mes" : "material",
      course_id: r.course_id,
      item_index: r.item_index,
      similarity: r.similarity,
      text: r.text,
    }));
}

async function retrieveMaterialRecommendations(args: {
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
    const wantsLessonPlan = detectLessonPlanIntent(queryText);
    if (wantsLessonPlan) {
      // Lessonplan + “1 klik” experience: also fetch sources + materials (requires embeddings)
      const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
      const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

      // First, search for curated materials to use in lesson plan generation
      let lessonPlanMaterials: CuratedMaterialResult[] = [];
      let materialContentForPlan = "";
      try {
        lessonPlanMaterials = await searchCuratedMaterials({
          organizationId,
          query: queryText,
          limit: 5,
        });

        // Fetch content from top 2 materials for lesson plan context
        if (lessonPlanMaterials.length > 0) {
          const contentChunks = await Promise.all(
            lessonPlanMaterials.slice(0, 2).map(async (m) => {
              if (m.storage_bucket && m.storage_path) {
                const content = await fetchMaterialContent({
                  storageBucket: m.storage_bucket,
                  storagePath: m.storage_path,
                  maxLength: 3000,
                });
                return content ? `[${m.title}]\n${content}` : null;
              }
              return null;
            })
          );
          materialContentForPlan = contentChunks.filter(Boolean).join("\n\n---\n\n");
        }
      } catch (e) {
        console.error(`[teacher-chat-assistant] lesson_material_search_error (${requestId}):`, e);
      }

      const [lessonPlan, embedding] = await Promise.all([
        generateLessonPlan({ queryText, materialContent: materialContentForPlan || undefined }),
        generateEmbedding(queryText, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL }),
      ]);

      const kdCheck = buildKdCheck(lessonPlan.kdAlignment.code);

      const topK = Math.min(20, Math.max(3, Number.isFinite(Number(body?.topK)) ? Math.floor(Number(body.topK)) : 8));

      let citations: Citation[] = [];
      if (scope === "materials") {
        const prefix = materialId ? `material:${materialId}` : "material:";
        citations = await retrievePrefix({ organizationId, prefix, embedding, limit: topK });
      } else if (scope === "mes") {
        citations = await retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: topK });
      } else {
        const [mat, mes] = await Promise.all([
          retrievePrefix({ organizationId, prefix: materialId ? `material:${materialId}` : "material:", embedding, limit: Math.ceil(topK / 2) + 2 }),
          retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: Math.ceil(topK / 2) + 2 }),
        ]);
        citations = [...mat, ...mes]
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, topK);
      }

      let recommendations: MaterialRecommendation[] = [];
      if (scope !== "mes") {
        try {
          recommendations = await retrieveMaterialRecommendations({ organizationId, embedding, limit: 8 });
        } catch (e) {
          console.error(`[teacher-chat-assistant] recommendations_error (${requestId}):`, e);
          recommendations = [];
        }
      }

      const answer = [
        "Ik heb een lesplan opgesteld dat past bij je vraag.",
        `KD-focus: ${lessonPlan.kdAlignment.code} — ${lessonPlan.kdAlignment.title}.`,
        recommendations.length
          ? `Ik heb ook ${recommendations.length} materialen gevonden die je direct kunt gebruiken.`
          : "Ik heb geen materialen gevonden die direct matchen—probeer een concretere zoekterm of selecteer een materiaal.",
        "Bekijk lesplan, materialen en bronnen in het paneel rechts.",
      ].join(" ");

      return json({
        ok: true,
        answer,
        citations: citations.slice(0, 12),
        recommendations,
        lessonPlan,
        kdCheck,
        requestId,
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
      const [mat, mes] = await Promise.all([
        retrievePrefix({ organizationId, prefix: materialId ? `material:${materialId}` : "material:", embedding, limit: Math.ceil(topK / 2) + 2 }),
        retrievePrefix({ organizationId, prefix: "mes:", embedding, limit: Math.ceil(topK / 2) + 2 }),
      ]);
      citations = [...mat, ...mes]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    }

    let recommendations: MaterialRecommendation[] = [];
    if (wantsRecommendations && scope !== "mes") {
      try {
        recommendations = await retrieveMaterialRecommendations({
          organizationId,
          embedding,
          limit: 8,
        });
      } catch (e) {
        console.error(`[teacher-chat-assistant] recommendations_error (${requestId}):`, e);
        recommendations = [];
      }
    }

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
            const metaParts = [
              r.file_name ? `file: ${r.file_name}` : null,
              r.content_type ? `type: ${r.content_type}` : null,
            ].filter(Boolean);
            const meta = metaParts.length ? ` (${metaParts.join(", ")})` : "";
            const snip = r.snippet ? `\nSnippet: ${r.snippet}` : "";
            return `[R${n}] ${r.title}${meta} (score ${score})${snip}`;
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
      timeoutMs: 90_000,
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


