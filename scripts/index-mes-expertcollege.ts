/**
 * Index Expertcollege MES content into LearnPlay curated materials.
 * 
 * This script:
 * 1. Fetches courses from Kevin's MES Supabase via get_course_content RPC
 * 2. Extracts studytexts (theory) and exercises
 * 3. Stores them as curated materials in our LearnPlay system
 * 
 * Usage:
 *   npx tsx scripts/index-mes-expertcollege.ts --list                     # List available courses
 *   npx tsx scripts/index-mes-expertcollege.ts --category AG              # Index AG courses
 *   npx tsx scripts/index-mes-expertcollege.ts --course 6821              # Index specific course
 *   npx tsx scripts/index-mes-expertcollege.ts --courses-file file.txt    # Index courses from file (one ID per line)
 *   npx tsx scripts/index-mes-expertcollege.ts --dry-run                  # Preview without writing
 *   npx tsx scripts/index-mes-expertcollege.ts --update-metadata          # Patch metadata on existing records
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { parseLearnPlayEnv, loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";
import { createHash } from "node:crypto";
import { v5 as uuidv5 } from "uuid";
import { readFileSync } from "node:fs";

// ---------- MES Supabase (Kevin's project) ----------
const MES_SUPABASE_URL = "https://yqpqdtedhoffgmurpped.supabase.co";
const MES_ANON_KEY = "sb_publishable_s6WSybdYV_UqHRGLltgQgg_XZGHY-gD";

// ---------- Types ----------
interface MESCourse {
  mes_course_id: number;
  mes_course_name: string;
  mes_course_language: string;
}

interface MESCourseContent {
  course: Array<{
    id: number;
    name: string;
    category: string;
    image: string | null;
  }>;
  topics: Array<{
    mes_topic_id: number;
    mes_topic_name: string;
    mes_topic_parent_id: number | null;
    tree_level: number;
    mes_exercise_id: number | null;
    mes_exercise_studytext_id: string | null;
    mes_exercise_name: string | null;
    mes_exercise_type: string | null;
    mes_exercise_metadata: string | null;
    mes_exercise_key_metadata: string | null;
  }>;
  subjects: Array<{
    mes_subject_id: number;
    mes_subject_order: number;
    mes_subject_name: string;
    mes_subject_parent_id: number | null;
    tree_level: number;
    mes_studytext_id: number | null;
    mes_resource_language: string | null;
    mes_resource_displayname: string | null;
    regexp_replace: string | null; // HTML content
  }>;
}

interface CuratedPack {
  id: string;
  source: string;
  mes_course_id: number;
  course_name: string;
  category: string;
  material_type: "theorie" | "oefening";
  title: string;
  content_html: string;
  preview: string;
  keywords: string[];
  kd_codes: string[];
  language: string;
  mbo_level: string | null;
  metadata?: CuratedMetadata;
}

interface CuratedMetadata {
  mbo_track?: string;
  module_family?: string;
  topic_tags: string[];
  exercise_format?: string;
  scenario_present?: boolean;
  law_topics: string[];
  communication_context: string[];
}

// ---------- Helpers ----------
// UUID v5 namespace for MES content (deterministic)
const MES_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // DNS namespace

function mesIdToUuid(mesId: string): string {
  // Generate a deterministic UUID from the MES ID string
  return uuidv5(mesId, MES_NAMESPACE);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function extractMBOLevel(category: string): string | null {
  // Try to extract N3/N4 from category path
  const lower = category.toLowerCase();
  if (lower.includes("n4") || lower.includes("nivo 4") || lower.includes("niveau 4")) return "n4";
  if (lower.includes("n3") || lower.includes("nivo 3") || lower.includes("niveau 3")) return "n3";
  return null;
}

function extractKDCodes(category: string, courseName: string): string[] {
  // Extract KD codes from category/name if present
  const kdRegex = /K\d+|KD\s*\d+/gi;
  const codes: string[] = [];
  const catMatches = category.match(kdRegex) || [];
  const nameMatches = courseName.match(kdRegex) || [];
  codes.push(...catMatches, ...nameMatches);
  return [...new Set(codes.map(c => c.toUpperCase().replace(/\s+/g, "")))];
}

function extractKeywords(html: string, maxKeywords = 20): string[] {
  // Extract strong/emphasized terms from HTML
  const strongRegex = /<strong>([^<]+)<\/strong>/gi;
  const keywords: string[] = [];
  let match;
  while ((match = strongRegex.exec(html)) !== null && keywords.length < maxKeywords) {
    const term = match[1].trim().toLowerCase();
    if (term.length > 2 && term.length < 50 && !keywords.includes(term)) {
      keywords.push(term);
    }
  }
  return keywords;
}

function htmlToPreview(html: string, maxLen = 300): string {
  // Strip HTML tags and truncate
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

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

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

const SCENARIO_CUES = ["casus", "scenario", "situatie", "melding", "formulier", "rollenspel"];
const LAW_TOPIC_MAP = [
  { tag: "wkkgz", terms: ["wkkgz", "kwaliteit, klachten en geschillen"] },
  { tag: "wzd", terms: ["wzd", "wet zorg en dwang"] },
  { tag: "wvggz", terms: ["wvggz", "verplichte geestelijke gezondheidszorg"] },
  { tag: "zvw", terms: ["zvw", "zorgverzekeringswet"] },
  { tag: "wlz", terms: ["wlz", "wet langdurige zorg"] },
  { tag: "big", terms: ["big", "beroepen in de individuele gezondheidszorg"] },
  { tag: "wgbo", terms: ["wgbo", "geneeskundige behandelingsovereenkomst"] },
  { tag: "avg", terms: ["avg", "algemene verordening gegevensbescherming"] },
];

const TOPIC_TAG_MAP = [
  { tag: "communication", terms: ["communicatie", "gesprek", "voorlichting", "advies", "instructie", "triagegesprek", "clientgesprek"] },
  { tag: "woundcare", terms: ["wondzorg", "wond", "wondverzorging", "wondbehandeling", "wondgenezing", "wondinfectie", "decubitus", "ulcus", "verband"] },
  { tag: "medication", terms: ["medicatie", "medicijn", "geneesmiddel", "farmacologie", "farmacie", "toediening", "dosering", "bijwerking"] },
  { tag: "incident", terms: ["incident", "vim", "calamiteit", "veiligheidsincident", "incidentmelding"] },
  { tag: "law", terms: ["wetgeving", "wet- en regelgeving", "juridisch", "wkkgz", "wzd", "wvggz", "zvw", "wlz", "big", "wgbo", "avg"] },
  { tag: "privacy", terms: ["privacy", "avg", "datalek", "beroepsgeheim"] },
  { tag: "hygiene", terms: ["hygiene", "desinfectie", "infectiepreventie", "handhygiene"] },
  { tag: "clinical_reasoning", terms: ["klinisch redeneren", "pkr", "redeneer", "casuïstiek"] },
  { tag: "anatomy", terms: ["anatomie"] },
  { tag: "physiology", terms: ["fysiologie"] },
  { tag: "triage", terms: ["triage"] },
  { tag: "patient_safety", terms: ["patientveiligheid", "vms", "veilig werken"] },
  { tag: "ethics", terms: ["ethiek", "beroepshouding", "professionaliteit", "zorgplicht"] },
];

const COMMUNICATION_CONTEXT_MAP = [
  { tag: "triage", terms: ["triage", "triagegesprek"] },
  { tag: "voorlichting", terms: ["voorlichting"] },
  { tag: "advies", terms: ["advies"] },
  { tag: "instructie", terms: ["instructie"] },
  { tag: "weigering", terms: ["weigert", "weigeren", "weigering"] },
  { tag: "clientgesprek", terms: ["clientgesprek", "gesprek"] },
];

function deriveMboTrack(category: string, courseName: string): string | undefined {
  const src = normalizeText(`${category} ${courseName}`);
  if (src.includes("verpleegkunde")) return "verpleegkunde";
  if (src.includes("verzorgende ig")) return "verzorgende_ig";
  if (src.includes("assisterende gezondheidszorg")) return "assisterende_gezondheidszorg";
  if (src.includes("ggz")) return "ggz";
  const prefixMatch = courseName.match(/e-xpert mbo\s+([a-z0-9]+):/i);
  const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";
  if (prefix === "ag") return "assisterende_gezondheidszorg";
  if (prefix === "ggz") return "ggz";
  if (prefix === "da") return "doktersassistent";
  if (prefix === "aa") return "apothekersassistent";
  if (prefix === "ta") return "tandartsassistent";
  if (prefix === "vvt") return "vvt";
  return undefined;
}

function deriveModuleFamily(category: string, courseName: string): string | undefined {
  const src = normalizeText(`${category} ${courseName}`);
  if (src.includes("pvwh")) return "pvwh";
  if (src.includes("pkr") || src.includes("klinisch redeneren")) return "pkr";
  if (src.includes("triage")) return "triage";
  if (src.includes("vms")) return "vms";
  if (src.includes("wetgeving") || src.includes("wet- en regelgeving")) return "wetgeving";
  if (src.includes("communicatie, advies en instructie")) return "communicatie";
  if (src.includes("verpleegtechnische handelingen")) return "verpleegtechnische_handelingen";
  if (src.includes("pathologie")) return "pathologie";
  return undefined;
}

function deriveTopicTags(combinedText: string): string[] {
  const tags: string[] = [];
  for (const entry of TOPIC_TAG_MAP) {
    if (entry.terms.some((term) => combinedText.includes(normalizeText(term)))) {
      tags.push(entry.tag);
    }
  }
  return uniq(tags);
}

function deriveLawTopics(combinedText: string): string[] {
  const tags: string[] = [];
  for (const entry of LAW_TOPIC_MAP) {
    if (entry.terms.some((term) => combinedText.includes(normalizeText(term)))) {
      tags.push(entry.tag);
    }
  }
  return uniq(tags);
}

function deriveCommunicationContext(combinedText: string): string[] {
  const tags: string[] = [];
  for (const entry of COMMUNICATION_CONTEXT_MAP) {
    if (entry.terms.some((term) => combinedText.includes(normalizeText(term)))) {
      tags.push(entry.tag);
    }
  }
  return uniq(tags);
}

function deriveExerciseFormat(materialType: string, preview: string, title: string): string | undefined {
  if (materialType !== "oefening") return undefined;
  const src = normalizeText(`${preview} ${title}`);
  if (src.startsWith("casus")) return "casus";
  if (src.startsWith("stelling")) return "stelling";
  if (src.startsWith("vraag")) return "vraag";
  if (src.includes("meerkeuze")) return "meerkeuze";
  if (src.includes("rollenspel")) return "rollenspel";
  return undefined;
}

function deriveScenarioPresent(preview: string): boolean {
  const src = normalizeText(preview);
  return SCENARIO_CUES.some((cue) => src.includes(normalizeText(cue)));
}

function deriveMetadata(args: {
  courseName: string;
  category: string;
  title: string;
  preview: string;
  keywords: string[];
  materialType: string;
}): CuratedMetadata {
  const combined = normalizeText([args.courseName, args.category, args.title, args.preview, args.keywords.join(" ")].join(" "));
  const mboTrack = deriveMboTrack(args.category, args.courseName);
  const moduleFamily = deriveModuleFamily(args.category, args.courseName);
  const topicTags = deriveTopicTags(combined);
  const lawTopics = deriveLawTopics(combined);
  const communicationContext = deriveCommunicationContext(combined);
  const exerciseFormat = deriveExerciseFormat(args.materialType, args.preview, args.title);
  const scenarioPresent = deriveScenarioPresent(args.preview);

  return {
    ...(mboTrack ? { mbo_track: mboTrack } : {}),
    ...(moduleFamily ? { module_family: moduleFamily } : {}),
    topic_tags: topicTags,
    ...(exerciseFormat ? { exercise_format: exerciseFormat } : {}),
    ...(scenarioPresent ? { scenario_present: scenarioPresent } : {}),
    law_topics: lawTopics,
    communication_context: communicationContext,
  };
}

function collectKeywordStrings(value: unknown, target: string[]) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && item.trim()) target.push(item.trim());
  }
}

function extractKeywordsFromIndex(data: any): string[] {
  const keywords: string[] = [];
  collectKeywordStrings(data?.keywords, keywords);
  collectKeywordStrings(data?.nl_keywords, keywords);
  const variants = (data?.variants && typeof data.variants === "object") ? data.variants : {};
  for (const variant of [variants?.b2, variants?.b1, variants?.a2, variants?.ar]) {
    collectKeywordStrings(variant?.keywords, keywords);
    collectKeywordStrings(variant?.nl_keywords, keywords);
  }
  return uniq(keywords);
}

function extractPreviewFromIndex(data: any): string {
  if (typeof data?.preview === "string" && data.preview.trim()) return data.preview.trim();
  const variants = (data?.variants && typeof data.variants === "object") ? data.variants : {};
  for (const variant of [variants?.b2, variants?.b1, variants?.a2, variants?.ar]) {
    if (typeof variant?.preview === "string" && variant.preview.trim()) return variant.preview.trim();
  }
  return "";
}

function parseExerciseXML(metadata: string, keyMetadata: string): { question: string; choices: string[]; correct: number; explanation: string } | null {
  try {
    // Simple regex parsing for the MC exercise format
    const questionMatch = metadata.match(/<mc:question>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/mc:question>/i);
    const choicesMatches = [...metadata.matchAll(/<mc:choice id="(\d+)">\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/mc:choice>/gi)];
    const correctMatch = keyMetadata.match(/<mc:correctanswer id="(\d+)"\/>/i);
    const explanationMatch = keyMetadata.match(/<mc:text>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/mc:text>/i);
    
    if (!questionMatch) return null;
    
    return {
      question: questionMatch[1].trim(),
      choices: choicesMatches.map(m => m[2].trim()),
      correct: correctMatch ? parseInt(correctMatch[1], 10) : 1,
      explanation: explanationMatch ? explanationMatch[1].trim() : "",
    };
  } catch {
    return null;
  }
}

// ---------- Main ----------
async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const dryRun = args.includes("--dry-run");
  const updateMetadataOnly = args.includes("--update-metadata");
  const categoryArg = args.find((a, i) => args[i - 1] === "--category");
  const courseArg = args.find((a, i) => args[i - 1] === "--course");
  const coursesFileArg = args.find((a, i) => args[i - 1] === "--courses-file");
  const limitArg = args.find((a, i) => args[i - 1] === "--limit");
  const limit = limitArg ? parseInt(limitArg, 10) : 10000; // Default to high limit for file-based indexing

  console.log("🔄 Index MES Expertcollege Content\n");

  // Connect to MES Supabase (source)
  const mesSupabase = createClient(MES_SUPABASE_URL, MES_ANON_KEY);

  // ---------- List mode (doesn't need LearnPlay connection) ----------
  if (listOnly) {
    console.log("📋 Listing available course categories...\n");
    
    // Get all e-Xpert mbo courses grouped by prefix
    const { data: courses, error } = await mesSupabase
      .from("mes_course")
      .select("mes_course_id, mes_course_name")
      .ilike("mes_course_name", "e-Xpert mbo%")
      .not("mes_course_name", "ilike", "Copy of%")
      .order("mes_course_name");
    
    if (error) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }

    // Group by category prefix (AG, AA, DA, TA, etc.)
    const groups: Record<string, MESCourse[]> = {};
    for (const c of courses || []) {
      const match = c.mes_course_name.match(/e-Xpert mbo ([A-Z]{2,3}):/i);
      const prefix = match ? match[1].toUpperCase() : "OTHER";
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(c);
    }

    console.log("Category breakdown:");
    for (const [prefix, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${prefix}: ${list.length} courses`);
      if (list.length <= 5) {
        list.forEach(c => console.log(`    - [${c.mes_course_id}] ${c.mes_course_name}`));
      } else {
        list.slice(0, 3).forEach(c => console.log(`    - [${c.mes_course_id}] ${c.mes_course_name}`));
        console.log(`    ... and ${list.length - 3} more`);
      }
    }

    console.log(`\nTotal: ${courses?.length} courses`);
    console.log("\nUsage:");
    console.log("  --category AG              # Index all AG courses");
    console.log("  --course 6821              # Index specific course");
    console.log("  --courses-file file.txt    # Index courses from file (one ID per line)");
    console.log("  --limit 5                  # Limit number of courses");
    console.log("  --dry-run                  # Preview without writing");
    return;
  }

  // ---------- Connect to LearnPlay Supabase (destination) ----------
  let lpSupabase: SupabaseClient | null = null;
  let ORG_ID = "";
  
  if (!dryRun) {
    loadLocalEnvForTests();
    loadLearnPlayEnv(); // Sets process.env
    const lpEnv = parseLearnPlayEnv();
    const supabaseUrl = lpEnv.SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = lpEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const orgId = lpEnv.ORGANIZATION_ID || process.env.ORGANIZATION_ID;
    
    if (!supabaseUrl || !serviceRoleKey || !orgId) {
      console.error("❌ Missing LearnPlay env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORGANIZATION_ID)");
      console.error("   SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
      console.error("   SERVICE_ROLE_KEY:", serviceRoleKey ? "✓" : "✗");
      console.error("   ORGANIZATION_ID:", orgId ? "✓" : "✗");
      process.exit(1);
    }
    lpSupabase = createClient(supabaseUrl, serviceRoleKey);
    ORG_ID = orgId;
    console.log(`🔌 Connected to LearnPlay (org: ${ORG_ID.slice(0, 8)}...)\n`);
  } else {
    console.log("⚠️  DRY RUN mode - will not write to LearnPlay\n");
  }

  if (updateMetadataOnly) {
    if (!lpSupabase) {
      console.error("❌ Metadata update requires LearnPlay connection.");
      process.exit(1);
    }
    await patchMetadataOnly(lpSupabase, ORG_ID);
    return;
  }

  // ---------- Build course list to index ----------
  let coursesToIndex: MESCourse[] = [];

  if (courseArg) {
    // Single course
    const { data, error } = await mesSupabase
      .from("mes_course")
      .select("mes_course_id, mes_course_name, mes_course_language")
      .eq("mes_course_id", parseInt(courseArg, 10))
      .single();
    
    if (error || !data) {
      console.error(`❌ Course ${courseArg} not found`);
      process.exit(1);
    }
    coursesToIndex = [data];
  } else if (categoryArg) {
    // All courses in category
    const { data, error } = await mesSupabase
      .from("mes_course")
      .select("mes_course_id, mes_course_name, mes_course_language")
      .ilike("mes_course_name", `e-Xpert mbo ${categoryArg}:%`)
      .not("mes_course_name", "ilike", "Copy of%")
      .order("mes_course_name")
      .limit(limit);
    
    if (error) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
    coursesToIndex = data || [];
  } else if (coursesFileArg) {
    // Read course IDs from file (one ID per line)
    console.log(`📄 Reading course IDs from ${coursesFileArg}...`);
    const fileContent = readFileSync(coursesFileArg, "utf-8");
    const courseIds = fileContent
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !isNaN(parseInt(line, 10)))
      .map(line => parseInt(line, 10));
    
    console.log(`   Found ${courseIds.length} course IDs in file`);
    
    // Fetch course details for each ID
    const { data, error } = await mesSupabase
      .from("mes_course")
      .select("mes_course_id, mes_course_name, mes_course_language")
      .in("mes_course_id", courseIds);
    
    if (error) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
    
    // Sort to match file order
    const courseMap = new Map((data || []).map(c => [c.mes_course_id, c]));
    coursesToIndex = courseIds
      .map(id => courseMap.get(id))
      .filter((c): c is MESCourse => c !== undefined);
    
    console.log(`   Found ${coursesToIndex.length} courses in database\n`);
  } else {
    console.log("❌ Specify --category, --course, --courses-file, or --list");
    process.exit(1);
  }

  console.log(`📚 Processing ${coursesToIndex.length} courses...\n`);

  // ---------- Process each course ----------
  const results = {
    coursesProcessed: 0,
    studytextsIndexed: 0,
    exercisesIndexed: 0,
    errors: [] as string[],
  };

  // Helper: delay between courses to reduce server load
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Helper: fetch with retries
  async function fetchCourseWithRetry(courseId: number, retries = 3): Promise<{ data: MESCourseContent | null; error: any }> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const { data, error } = await mesSupabase
        .rpc("get_course_content", { p_course_id: courseId }) as { data: MESCourseContent | null; error: any };
      
      if (!error && data) {
        return { data, error: null };
      }
      
      if (attempt < retries && error?.message?.includes("timeout")) {
        console.log(`   ⏳ Retry ${attempt}/${retries} after timeout...`);
        await delay(2000 * attempt); // Exponential backoff
      } else {
        return { data, error };
      }
    }
    return { data: null, error: { message: "max retries exceeded" } };
  }

  for (const course of coursesToIndex) {
    console.log(`\n📖 [${course.mes_course_id}] ${course.mes_course_name}`);

    // Fetch full course content via RPC with retries
    const { data: content, error: rpcErr } = await fetchCourseWithRetry(course.mes_course_id);

    if (rpcErr || !content) {
      console.log(`   ❌ RPC error: ${rpcErr?.message || "no data"}`);
      results.errors.push(`${course.mes_course_id}: ${rpcErr?.message || "no data"}`);
      // Small delay before next course even on error
      await delay(500);
      continue;
    }

    const courseInfo = content.course?.[0];
    if (!courseInfo) {
      console.log(`   ⚠️  No course info returned`);
      continue;
    }

    const category = courseInfo.category || "";
    const mboLevel = extractMBOLevel(category);
    const kdCodes = extractKDCodes(category, courseInfo.name);

    console.log(`   Category: ${category}`);
    console.log(`   MBO Level: ${mboLevel || "unknown"}`);
    console.log(`   KD Codes: ${kdCodes.join(", ") || "none"}`);
    console.log(`   Topics: ${content.topics?.length || 0}, Subjects: ${content.subjects?.length || 0}`);

    // ---------- Index studytexts (theory) ----------
    for (const subject of content.subjects || []) {
      if (!subject.regexp_replace || !subject.mes_studytext_id) continue;

      const curatedId = mesIdToUuid(`mes-st-${course.mes_course_id}-${subject.mes_studytext_id}`);
      const keywords = extractKeywords(subject.regexp_replace);
      const preview = htmlToPreview(subject.regexp_replace);
      const metadata = deriveMetadata({
        courseName: courseInfo.name,
        category,
        title: subject.mes_resource_displayname || subject.mes_subject_name,
        preview,
        keywords,
        materialType: "theorie",
      });

      const pack: CuratedPack = {
        id: curatedId,
        source: "expertcollege-mes",
        mes_course_id: course.mes_course_id,
        course_name: courseInfo.name,
        category,
        material_type: "theorie",
        title: subject.mes_resource_displayname || subject.mes_subject_name,
        content_html: subject.regexp_replace,
        preview,
        keywords,
        kd_codes: kdCodes,
        language: subject.mes_resource_language || "nl-NL",
        mbo_level: mboLevel,
        metadata,
      };

      if (dryRun || !lpSupabase) {
        console.log(`   📝 [DRY] Studytext: ${pack.title} (${keywords.length} keywords)`);
      } else {
        await indexCuratedPack(lpSupabase, ORG_ID, pack);
        console.log(`   ✅ Studytext: ${pack.title}`);
      }
      results.studytextsIndexed++;
    }

    // ---------- Index exercises ----------
    const topicsWithExercises = (content.topics || []).filter(t => t.mes_exercise_id && t.mes_exercise_metadata);
    
    for (const topic of topicsWithExercises.slice(0, 20)) { // Limit exercises per course
      const parsed = parseExerciseXML(topic.mes_exercise_metadata || "", topic.mes_exercise_key_metadata || "");
      if (!parsed) continue;

      const curatedId = mesIdToUuid(`mes-ex-${course.mes_course_id}-${topic.mes_exercise_id}`);
      
      // Build exercise HTML
      const exerciseHtml = `
        <div class="exercise exercise-${topic.mes_exercise_type}">
          <h4>${topic.mes_exercise_name || topic.mes_topic_name}</h4>
          <div class="question">${parsed.question}</div>
          <ol class="choices" type="A">
            ${parsed.choices.map((c, i) => `<li class="${i + 1 === parsed.correct ? 'correct' : ''}">${c}</li>`).join("\n")}
          </ol>
          ${parsed.explanation ? `<div class="explanation"><strong>Uitleg:</strong> ${parsed.explanation}</div>` : ""}
        </div>
      `;

      const pack: CuratedPack = {
        id: curatedId,
        source: "expertcollege-mes",
        mes_course_id: course.mes_course_id,
        course_name: courseInfo.name,
        category,
        material_type: "oefening",
        title: topic.mes_exercise_name || topic.mes_topic_name,
        content_html: exerciseHtml,
        preview: htmlToPreview(parsed.question),
        keywords: extractKeywords(parsed.question + " " + parsed.choices.join(" ")),
        kd_codes: kdCodes,
        language: course.mes_course_language || "nl-NL",
        mbo_level: mboLevel,
        metadata: deriveMetadata({
          courseName: courseInfo.name,
          category,
          title: topic.mes_exercise_name || topic.mes_topic_name,
          preview: htmlToPreview(parsed.question),
          keywords: extractKeywords(parsed.question + " " + parsed.choices.join(" ")),
          materialType: "oefening",
        }),
      };

      if (dryRun || !lpSupabase) {
        console.log(`   📝 [DRY] Exercise: ${pack.title}`);
      } else {
        await indexCuratedPack(lpSupabase, ORG_ID, pack);
        console.log(`   ✅ Exercise: ${pack.title}`);
      }
      results.exercisesIndexed++;
    }

    results.coursesProcessed++;
    
    // Delay between courses to reduce server load
    await delay(300);
  }

  // ---------- Summary ----------
  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary");
  console.log("=".repeat(60));
  console.log(`Courses processed: ${results.coursesProcessed}`);
  console.log(`Studytexts indexed: ${results.studytextsIndexed}`);
  console.log(`Exercises indexed: ${results.exercisesIndexed}`);
  if (results.errors.length) {
    console.log(`Errors: ${results.errors.length}`);
    results.errors.forEach(e => console.log(`  - ${e}`));
  }
  if (dryRun) {
    console.log("\n⚠️  DRY RUN - no data was written");
  }
}

async function patchMetadataOnly(supabase: SupabaseClient, orgId: string): Promise<void> {
  const PAGE_SIZE = 500;
  const MAX_PAGES = 200;
  let page = 0;
  let updated = 0;

  console.log("🧩 Updating metadata for existing curated materials...\n");

  while (page < MAX_PAGES) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("entity_records")
      .select("id, data")
      .eq("organization_id", orgId)
      .eq("entity", "curated-material")
      .filter("data->>source", "eq", "expertcollege-mes")
      .range(from, to);

    if (error) {
      console.error("❌ Metadata scan failed:", error.message);
      process.exit(1);
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) break;

    const now = new Date().toISOString();
    const updates: Array<Promise<any>> = [];

    for (const row of rows) {
      const d = (row as any).data ?? {};
      const courseName = typeof d?.course_name === "string" ? d.course_name.trim() : "";
      const category = typeof d?.category === "string" ? d.category.trim() : "";
      const title = typeof d?.title === "string" ? d.title.trim() : "";
      const materialType = typeof d?.material_type === "string" ? d.material_type.trim() : "";
      const preview = extractPreviewFromIndex(d);
      const keywords = extractKeywordsFromIndex(d);

      const metadata = deriveMetadata({
        courseName,
        category,
        title,
        preview,
        keywords,
        materialType,
      });

      const nextData = { ...d, metadata };

      updates.push(
        supabase
          .from("entity_records")
          .update({ data: nextData, updated_at: now })
          .eq("id", row.id),
      );

      if (updates.length >= 25) {
        await Promise.all(updates);
        updates.length = 0;
      }
      updated += 1;
    }

    if (updates.length) {
      await Promise.all(updates);
    }

    console.log(`✅ Updated ${updated} records...`);

    if (rows.length < PAGE_SIZE) break;
    page += 1;
  }

  console.log(`\n✅ Metadata update complete. Total records updated: ${updated}`);
}

// ---------- Index a curated pack into LearnPlay ----------
async function indexCuratedPack(supabase: SupabaseClient, orgId: string, pack: CuratedPack): Promise<void> {
  const now = new Date().toISOString();
  const storagePath = `${orgId}/${pack.id}/curated/b2.json`;

  // 1. Upload pack JSON to storage
  const packJson = {
    schemaVersion: "1.0",
    id: pack.id,
    source: pack.source,
    mes_course_id: pack.mes_course_id,
    title: pack.title,
    content_html: pack.content_html,
    keywords: pack.keywords,
    kd_codes: pack.kd_codes,
    language: pack.language,
    mbo_level: pack.mbo_level,
    created_at: now,
  };

  const { error: uploadErr } = await supabase.storage
    .from("materials")
    .upload(storagePath, JSON.stringify(packJson, null, 2), {
      contentType: "application/json",
      upsert: true,
    });

  if (uploadErr) {
    console.error(`     ⚠️  Upload error: ${uploadErr.message}`);
    // Continue anyway to create the index record
  }

  // 2. Upsert entity_records index
  const indexRecord = {
    id: pack.id,
    organization_id: orgId,
    entity: "curated-material",
    data: {
      source: pack.source,
      mes_course_id: pack.mes_course_id,
      course_name: pack.course_name,
      category: pack.category,
      material_type: pack.material_type,
      title: pack.title,
      preview: pack.preview,
      keywords: pack.keywords,
      nl_keywords: pack.keywords, // Same as keywords for Dutch content
      kd_codes: pack.kd_codes,
      mbo_level: pack.mbo_level,
      ...(pack.metadata ? { metadata: pack.metadata } : {}),
      variants: {
        b2: {
          storage_bucket: "materials",
          storage_path: storagePath,
          keywords: pack.keywords,
          preview: pack.preview,
        },
      },
    },
    updated_at: now,
  };

  const { error: upsertErr } = await supabase
    .from("entity_records")
    .upsert(indexRecord, { onConflict: "id" });

  if (upsertErr) {
    console.error(`     ⚠️  Upsert error: ${upsertErr.message}`);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
