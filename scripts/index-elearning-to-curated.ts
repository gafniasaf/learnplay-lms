/**
 * Index e-learning modules into curated materials.
 *
 * Supports two directory structures:
 * 1. docentstart/ - manually mapped modules (legacy)
 * 2. kd-2026/ - auto-mapped by KD code from path
 *
 * This script:
 * 1. Reads all .txt files from specified directories
 * 2. Converts them to HTML format
 * 3. Creates curated material packs (JSON)
 * 4. Uploads to Supabase Storage (materials bucket)
 * 5. Creates entity_records with entity="curated-material"
 *
 * Usage:
 *   npx tsx scripts/index-elearning-to-curated.ts [--dry-run] [--dir=docentstart|kd-2026|all] [--files=X]
 *
 * Flags:
 *   --dry-run    Preview what would be indexed without making changes
 *   --dir=X      Which directory to index (default: all)
 *   --files=X    Only index specific files (comma-separated prefixes)
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";
import {
  CURATED_MATERIAL_ENTITY,
  CURATED_STORAGE_BUCKET,
  CuratedMaterialIndexRecordV1Schema,
  CuratedMaterialPackV1Schema,
  buildCuratedPackStoragePath,
} from "../src/lib/types/curated-material";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MaterialType = "theorie" | "oefening" | "casus" | "werkopdracht";

type ModuleMapping = {
  codes: string[];
  tags: string[];
  title: string;
  materialType: MaterialType;
  topicTags?: string[];
};

type IndexedFile = {
  filePath: string;
  source: string;
  moduleId: string;
  kdCodes: string[];
  title: string;
  materialType: MaterialType;
  tags: string[];
  topicTags: string[];
  category: string;
  courseName: string;
};

// ---------------------------------------------------------------------------
// KD-code mapping for docentstart modules (legacy)
// ---------------------------------------------------------------------------

const DOCENTSTART_MAPPING: Record<string, ModuleMapping> = {
  "01-systematisch-observeren": {
    codes: ["B1-K1-W1"],
    tags: ["observatie", "vroegsignalering", "vitale functies", "trends"],
    title: "Systematisch observeren en vroegsignalering",
    materialType: "theorie",
    topicTags: ["observation", "early_warning"],
  },
  "02-sbar-rapporteren": {
    codes: ["B1-K2-W2"],
    tags: ["communicatie", "overdracht", "sbar", "rapportage", "samenwerking"],
    title: "Rapporteren met SBAR",
    materialType: "theorie",
    topicTags: ["communication", "handover"],
  },
  "03-participatie-netwerk": {
    codes: ["B1-K2-W1"],
    tags: ["netwerk", "participatie", "mantelzorg", "samenwerking", "sociaal"],
    title: "Participatie en netwerk",
    materialType: "theorie",
    topicTags: ["social_network", "informal_care"],
  },
  "04-adl-waardigheid-health-literacy": {
    codes: ["B1-K1-W3", "B1-K1-W6"],
    tags: ["adl", "waardigheid", "gezondheidsvaardigheden", "eigen regie", "zelfzorg"],
    title: "ADL, waardigheid en health literacy",
    materialType: "theorie",
    topicTags: ["adl", "dignity", "health_literacy"],
  },
  "05-medicatieveiligheid-5js": {
    codes: ["B1-K1-W4"],
    tags: ["medicatie", "veiligheid", "5js", "toediening", "controle"],
    title: "Medicatieveiligheid en de 5 juistheden",
    materialType: "theorie",
    topicTags: ["medication", "patient_safety"],
  },
  "06-klinisch-redeneren-basisloop": {
    codes: ["B1-K1-W1", "B1-K1-W2"],
    tags: ["klinisch redeneren", "besluitvorming", "zorgplan", "analyseren"],
    title: "Klinisch redeneren - basisloop",
    materialType: "theorie",
    topicTags: ["clinical_reasoning"],
  },
  "07-risico-inventarisatie": {
    codes: ["B1-K1-W1", "B1-K3-W3"],
    tags: ["risico", "inventarisatie", "vallen", "decubitus", "ondervoeding", "preventie"],
    title: "Risico-inventarisatie",
    materialType: "theorie",
    topicTags: ["risk_assessment", "prevention"],
  },
  "08-infectiepreventie": {
    codes: ["B1-K1-W3", "B1-K3-W3"],
    tags: ["infectie", "hygiëne", "handhygiëne", "isolatie", "preventie"],
    title: "Infectiepreventie",
    materialType: "theorie",
    topicTags: ["infection_prevention", "hygiene"],
  },
  "09-digitale-dossiervoering-avg": {
    codes: ["B1-K1-W2", "B1-K3-W2"],
    tags: ["dossier", "rapportage", "avg", "privacy", "digitaal"],
    title: "Digitale dossiervoering en AVG",
    materialType: "theorie",
    topicTags: ["documentation", "privacy"],
  },
  "10-ai-in-de-zorg": {
    codes: ["B1-K3-W1"],
    tags: ["ai", "technologie", "innovatie", "digitalisering"],
    title: "AI in de zorg",
    materialType: "theorie",
    topicTags: ["innovation", "technology"],
  },
  "11-coordineren-prioriteren": {
    codes: ["B1-K2-W2", "B1-K3-W2"],
    tags: ["coördinatie", "prioriteren", "planning", "tijdmanagement"],
    title: "Coördineren en prioriteren",
    materialType: "theorie",
    topicTags: ["coordination", "time_management"],
  },
  "12-coachend-werken-feedback": {
    codes: ["B1-K3-W2"],
    tags: ["coaching", "feedback", "begeleiding", "reflectie", "ontwikkeling"],
    title: "Coachend werken en feedback",
    materialType: "theorie",
    topicTags: ["coaching", "feedback", "professional_development"],
  },
  "13-overdracht-mdo": {
    codes: ["B1-K2-W2"],
    tags: ["overdracht", "mdo", "multidisciplinair", "samenwerking", "communicatie"],
    title: "Overdracht en MDO",
    materialType: "theorie",
    topicTags: ["handover", "multidisciplinary"],
  },
  "14-speak-up-closed-loop": {
    codes: ["B1-K1-W5", "B1-K3-W3"],
    tags: ["speak up", "closed loop", "veiligheid", "communicatie", "assertiviteit"],
    title: "Speak up en closed loop communicatie",
    materialType: "theorie",
    topicTags: ["patient_safety", "communication"],
  },
  "15-bekwaam-bevoegd": {
    codes: ["B1-K1-W4", "B1-K3-W2"],
    tags: ["bekwaamheid", "bevoegdheid", "wet big", "verantwoordelijkheid", "professioneel"],
    title: "Bekwaam en bevoegd",
    materialType: "theorie",
    topicTags: ["competence", "authorization", "law"],
  },
  "16-abcde-acute-situaties": {
    codes: ["B1-K1-W5"],
    tags: ["abcde", "acute", "nood", "eerste hulp", "levensreddend", "checklist"],
    title: "ABCDE-methodiek bij acute situaties",
    materialType: "theorie",
    topicTags: ["acute_care", "emergency", "abcde"],
  },
  "17-reflectie-stagegesprek": {
    codes: ["B1-K3-W2"],
    tags: ["reflectie", "starr", "stage", "gesprek", "ontwikkeling", "leerdoelen"],
    title: "Reflecteren met de STARR-methode",
    materialType: "oefening",
    topicTags: ["reflection", "professional_development", "internship"],
  },
  "18-scenario-allergische-reactie": {
    codes: ["B1-K1-W5"],
    tags: ["scenario", "simulatie", "allergie", "anafylaxie", "acute", "oefening"],
    title: "Simulatiescenario: Acute allergische reactie",
    materialType: "casus",
    topicTags: ["acute_care", "simulation", "allergy"],
  },
  "19-checklist-veilige-interventies": {
    codes: ["B1-K1-W3", "B1-K1-W4"],
    tags: ["checklist", "veiligheid", "interventie", "protocol", "controle", "handeling"],
    title: "Veilig uitvoeren van zorginterventies",
    materialType: "theorie",
    topicTags: ["patient_safety", "procedures", "checklists"],
  },
  "20-observatieformulier-eigen-regie": {
    codes: ["B1-K1-W1", "B1-K1-W3"],
    tags: ["observatie", "eigen regie", "zelfredzaamheid", "formulier", "adl", "participatie"],
    title: "Observeren en stimuleren van eigen regie",
    materialType: "oefening",
    topicTags: ["observation", "self_management", "autonomy"],
  },
};

// KD werkproces titles for auto-generated titles
const KD_WERKPROCES_TITLES: Record<string, string> = {
  "B1-K1-W1": "Inventariseert de behoefte aan zorg en/of ondersteuning",
  "B1-K1-W2": "Stelt het zorgplan op en/of bij",
  "B1-K1-W3": "Voert zorginterventies en/of begeleidingsactiviteiten uit",
  "B1-K1-W4": "Voert verpleegtechnische handelingen uit",
  "B1-K1-W5": "Handelt in onvoorziene en/of acute situaties",
  "B1-K1-W6": "Geeft informatie en advies over zorg en gezondheid",
  "B1-K2-W1": "Stemt af met informele zorgverleners",
  "B1-K2-W2": "Werkt samen met andere zorgprofessionals",
  "B1-K3-W1": "Draagt bij aan het innoveren van zorg",
  "B1-K3-W2": "Evalueert de werkzaamheden en ontwikkelt zichzelf als professional",
  "B1-K3-W3": "Draagt bij aan een sociaal en fysiek veilige werkomgeving",
  "P2-K1-W1": "Stelt een verpleegkundige diagnose",
  "P2-K1-W2": "Coacht en begeleidt collega's",
  "P2-K1-W3": "Coördineert en optimaliseert de zorgverlening",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or local env files before running`);
  }
  return String(v).trim();
}

function parseFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function parseArg(name: string): string | null {
  const argv = process.argv.slice(2);
  for (const arg of argv) {
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
  }
  return null;
}

function stableUuidFromString(input: string): string {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32).split("");
  hex[12] = ((parseInt(hex[12], 16) & 0x0f) | 0x04).toString(16);
  hex[16] = ((parseInt(hex[16], 16) & 0x03) | 0x08).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripForPreview(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// KD-2026 Auto-Detection
// ---------------------------------------------------------------------------

const KD_CODE_PATTERN = /^(B\d-K\d-W\d|P\d-K\d-W\d)$/;
const MATERIAL_TYPE_SUFFIXES: Record<string, MaterialType> = {
  "theorie": "theorie",
  "oefening": "oefening",
  "casus": "casus",
  "scenario": "casus",
  "werkopdracht": "werkopdracht",
};

function parseKd2026File(filePath: string): { kdCode: string; materialType: MaterialType; suffix: string } | null {
  const fileName = basename(filePath, ".txt");
  const dirName = basename(dirname(filePath));

  // Check if directory is a valid KD code
  if (!KD_CODE_PATTERN.test(dirName)) {
    return null;
  }

  // Parse material type from filename suffix
  // Expected format: B1-K1-W1-theorie.txt, B1-K1-W1-oefening.txt, B1-K1-W1-casus.txt
  const parts = fileName.split("-");
  const suffix = parts[parts.length - 1].toLowerCase();
  const materialType = MATERIAL_TYPE_SUFFIXES[suffix];

  if (!materialType) {
    return null;
  }

  return {
    kdCode: dirName,
    materialType,
    suffix,
  };
}

function getKerntaakFromWerkproces(wpCode: string): string {
  // B1-K1-W1 -> B1-K1
  const match = wpCode.match(/^([BP]\d-K\d)-W\d$/);
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// Text to HTML conversion
// ---------------------------------------------------------------------------

function convertModuleToHtml(content: string, title: string): { html: string; preview: string } {
  const lines = content.split("\n");
  const htmlParts: string[] = [];

  const titleLine = lines[0]?.trim() || title;
  htmlParts.push(`<article data-source="elearning-kd2026">`);
  htmlParts.push(`<h1>${escapeHtml(titleLine)}</h1>`);

  let inSection = false;
  let inList = false;
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(" ").trim();
      if (text) {
        htmlParts.push(`<p>${escapeHtml(text)}</p>`);
      }
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (inList) {
      htmlParts.push("</ul>");
      inList = false;
    }
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const sectionMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (sectionMatch) {
      flushParagraph();
      flushList();
      if (inSection) {
        htmlParts.push("</section>");
      }
      htmlParts.push("<section>");
      htmlParts.push(`<h2>${escapeHtml(sectionMatch[2])}</h2>`);
      inSection = true;
      continue;
    }

    const subMatch = trimmed.match(/^([A-Z])\s*[-–]\s*(.+)$/) ||
                     trimmed.match(/^(Stap\s+\d+):\s*(.+)$/i) ||
                     trimmed.match(/^(Vraag\s+\d+):\s*(.*)$/i) ||
                     trimmed.match(/^(Checklist\s+.+):?$/i);
    if (subMatch) {
      flushParagraph();
      flushList();
      const subTitle = subMatch[2] ? `${subMatch[1]} - ${subMatch[2]}` : subMatch[1];
      htmlParts.push(`<h3>${escapeHtml(subTitle)}</h3>`);
      continue;
    }

    const checkMatch = trimmed.match(/^\[[\sx]?\]\s*(.+)$/);
    if (checkMatch) {
      flushParagraph();
      if (!inList) {
        htmlParts.push("<ul class=\"checklist\">");
        inList = true;
      }
      htmlParts.push(`<li>${escapeHtml(checkMatch[1])}</li>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-•]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      htmlParts.push(`<li>${escapeHtml(bulletMatch[1])}</li>`);
      continue;
    }

    const colonMatch = trimmed.match(/^([A-Za-z\s]+):\s*(.*)$/);
    if (colonMatch && colonMatch[1].length < 40 && colonMatch[2]) {
      flushParagraph();
      flushList();
      htmlParts.push(`<p><strong>${escapeHtml(colonMatch[1])}:</strong> ${escapeHtml(colonMatch[2])}</p>`);
      continue;
    }

    flushList();
    currentParagraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (inSection) {
    htmlParts.push("</section>");
  }
  htmlParts.push("</article>");

  const html = htmlParts.join("\n");
  const previewRaw = stripForPreview(content.slice(0, 500));
  const preview = previewRaw.length > 240 ? `${previewRaw.slice(0, 240).trim()}…` : previewRaw;

  return { html, preview };
}

// ---------------------------------------------------------------------------
// Directory Scanners
// ---------------------------------------------------------------------------

async function scanDocentstartDir(baseDir: string, filterPrefixes: string[] | null): Promise<IndexedFile[]> {
  const moduleDir = join(baseDir, "docentstart");
  const files = await readdir(moduleDir);
  const txtFiles = files.filter((f) => f.endsWith(".txt") && !f.startsWith("_")).sort();

  const result: IndexedFile[] = [];

  for (const file of txtFiles) {
    const fileKey = file.replace(".txt", "");

    if (filterPrefixes && !filterPrefixes.some((p) => fileKey.startsWith(p))) {
      continue;
    }

    const mapping = DOCENTSTART_MAPPING[fileKey];
    if (!mapping) {
      console.log(`⚠️  docentstart/${file}: No mapping found, skipping`);
      continue;
    }

    result.push({
      filePath: join(moduleDir, file),
      source: "elearning-docentstart",
      moduleId: `elearning-docentstart-${fileKey}`,
      kdCodes: mapping.codes,
      title: mapping.title,
      materialType: mapping.materialType,
      tags: mapping.tags,
      topicTags: mapping.topicTags || [],
      category: "MBO Verpleegkunde - Beroepstaak 1",
      courseName: "Docentstart Verpleegkunde",
    });
  }

  return result;
}

async function scanKd2026Dir(baseDir: string, filterPrefixes: string[] | null): Promise<IndexedFile[]> {
  const kd2026Dir = join(baseDir, "kd-2026");
  const result: IndexedFile[] = [];

  let subdirs: string[];
  try {
    subdirs = await readdir(kd2026Dir);
  } catch {
    console.log(`⚠️  kd-2026/ directory not found, skipping`);
    return result;
  }

  for (const subdir of subdirs) {
    if (subdir.startsWith("_")) continue;

    const subdirPath = join(kd2026Dir, subdir);
    const subdirStat = await stat(subdirPath);
    if (!subdirStat.isDirectory()) continue;

    if (!KD_CODE_PATTERN.test(subdir)) {
      console.log(`⚠️  kd-2026/${subdir}: Not a valid KD code directory, skipping`);
      continue;
    }

    const files = await readdir(subdirPath);
    const txtFiles = files.filter((f) => f.endsWith(".txt") && !f.startsWith("_"));

    for (const file of txtFiles) {
      const filePath = join(subdirPath, file);
      const parsed = parseKd2026File(filePath);

      if (!parsed) {
        console.log(`⚠️  kd-2026/${subdir}/${file}: Cannot parse KD code or material type, skipping`);
        continue;
      }

      if (filterPrefixes && !filterPrefixes.some((p) => parsed.kdCode.startsWith(p) || file.startsWith(p))) {
        continue;
      }

      const wpTitle = KD_WERKPROCES_TITLES[parsed.kdCode] || parsed.kdCode;
      const materialTypeLabel = parsed.materialType === "theorie" ? "Theorie" :
                                parsed.materialType === "oefening" ? "Oefening" :
                                parsed.materialType === "casus" ? "Casus" : "Werkopdracht";
      const title = `${materialTypeLabel}: ${wpTitle}`;

      const kerntaak = getKerntaakFromWerkproces(parsed.kdCode);
      const kdCodes = kerntaak ? [parsed.kdCode, kerntaak] : [parsed.kdCode];

      // Generate tags based on KD code and material type
      const tags: string[] = [
        parsed.kdCode.toLowerCase().replace(/-/g, " "),
        parsed.materialType,
        wpTitle.toLowerCase(),
      ];

      const topicTags: string[] = [
        `kd_${parsed.kdCode.toLowerCase().replace(/-/g, "_")}`,
        parsed.materialType,
      ];

      result.push({
        filePath,
        source: "elearning-kd2026",
        moduleId: `kd2026-${parsed.kdCode}-${parsed.suffix}`,
        kdCodes,
        title,
        materialType: parsed.materialType,
        tags,
        topicTags,
        category: `KD 2026 - ${kerntaak || parsed.kdCode}`,
        courseName: `KD 2026 Werkproces ${parsed.kdCode}`,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadLocalEnvForTests();
  loadLearnPlayEnv();

  const dryRun = parseFlag("--dry-run");
  const dirArg = parseArg("--dir") || "all";
  const filesArg = parseArg("--files");
  const filterPrefixes = filesArg ? filesArg.split(",").map((s) => s.trim()).filter(Boolean) : null;

  const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!SUPABASE_URL) throw new Error("BLOCKED: SUPABASE_URL/VITE_SUPABASE_URL missing");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const baseDir = join(process.cwd(), "docs", "e-learningmodules");

  // Collect files to index
  let filesToIndex: IndexedFile[] = [];

  if (dirArg === "all" || dirArg === "docentstart") {
    const docentstartFiles = await scanDocentstartDir(baseDir, filterPrefixes);
    filesToIndex = filesToIndex.concat(docentstartFiles);
  }

  if (dirArg === "all" || dirArg === "kd-2026") {
    const kd2026Files = await scanKd2026Dir(baseDir, filterPrefixes);
    filesToIndex = filesToIndex.concat(kd2026Files);
  }

  console.log(`\n📚 E-Learning Module Indexer`);
  console.log(`   Mode: ${dryRun ? "DRY-RUN (no changes)" : "LIVE"}`);
  console.log(`   Organization: ${ORGANIZATION_ID}`);
  console.log(`   Directory: ${dirArg}`);
  console.log(`   Found ${filesToIndex.length} files to index\n`);

  let indexed = 0;
  let skipped = 0;
  const errors: Array<{ file: string; message: string }> = [];

  for (const indexedFile of filesToIndex) {
    try {
      const content = await readFile(indexedFile.filePath, "utf-8");
      
      // Skip template files or empty files
      if (content.includes("[TITEL]") || content.includes("[WERKPROCES_TITEL]") || content.trim().length < 100) {
        console.log(`⚠️  ${indexedFile.moduleId}: Template or empty file, skipping`);
        skipped++;
        continue;
      }

      const { html, preview } = convertModuleToHtml(content, indexedFile.title);

      const now = new Date().toISOString();
      const sourceKey = [ORGANIZATION_ID, indexedFile.source, indexedFile.moduleId].join("|");
      const curatedId = stableUuidFromString(sourceKey);

      const packPath = buildCuratedPackStoragePath({
        organizationId: ORGANIZATION_ID,
        materialId: curatedId,
        languageVariant: "b2",
      });

      const sharedKeywords = [
        "MBO",
        "Verpleegkunde",
        "VIG",
        "e-learning",
        ...indexedFile.kdCodes,
      ];

      const variantKeywords = [
        indexedFile.title,
        ...indexedFile.tags,
      ];

      const pack = CuratedMaterialPackV1Schema.parse({
        schema_version: 1,
        id: curatedId,
        title: indexedFile.title,
        material_type: indexedFile.materialType,
        language_variant: "b2",
        module_id: indexedFile.moduleId,
        kd_codes: indexedFile.kdCodes,
        keywords: variantKeywords,
        nl_keywords: indexedFile.tags,
        preview: preview || undefined,
        content_html: html,
        created_at: now,
        updated_at: now,
      });

      const indexRecordBase = CuratedMaterialIndexRecordV1Schema.parse({
        id: curatedId,
        title: indexedFile.title,
        material_type: indexedFile.materialType,
        module_id: indexedFile.moduleId,
        kd_codes: indexedFile.kdCodes,
        keywords: sharedKeywords,
        metadata: {
          mbo_track: "verpleegkunde",
          module_family: indexedFile.source === "elearning-docentstart" ? "docentstart" : "kd2026",
          topic_tags: indexedFile.topicTags,
        },
        variants: {
          b2: {
            storage_bucket: CURATED_STORAGE_BUCKET,
            storage_path: packPath,
            preview: pack.preview,
            keywords: variantKeywords,
            nl_keywords: indexedFile.tags,
            updated_at: now,
          },
        },
        pack_schema_version: 1,
        created_at: now,
        updated_at: now,
      });

      const indexRecord = {
        ...indexRecordBase,
        source: indexedFile.source,
        course_name: indexedFile.courseName,
        category: indexedFile.category,
      };

      if (dryRun) {
        console.log(`✓  ${indexedFile.moduleId}`);
        console.log(`   Title: ${indexedFile.title}`);
        console.log(`   KD: ${indexedFile.kdCodes.join(", ")}`);
        console.log(`   Type: ${indexedFile.materialType}`);
        console.log(`   ID: ${curatedId}\n`);
      } else {
        const uploadBody = Buffer.from(JSON.stringify(pack, null, 2), "utf-8");
        const { error: upErr } = await supabase.storage.from(CURATED_STORAGE_BUCKET).upload(packPath, uploadBody, {
          upsert: true,
          contentType: "application/json",
        });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

        const { error: recErr } = await supabase
          .from("entity_records")
          .upsert(
            {
              id: curatedId,
              organization_id: ORGANIZATION_ID,
              entity: CURATED_MATERIAL_ENTITY,
              title: indexedFile.title,
              data: indexRecord,
              updated_at: now,
            },
            { onConflict: "id" },
          );
        if (recErr) throw new Error(`DB upsert failed: ${recErr.message}`);

        console.log(`✓  ${indexedFile.moduleId} → ${indexedFile.title} (indexed)`);
      }

      indexed++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ file: indexedFile.moduleId, message });
      console.error(`❌ ${indexedFile.moduleId}: ${message}`);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Indexed: ${indexed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors.length}`);
  console.log(`  Mode:    ${dryRun ? "DRY-RUN" : "LIVE"}`);

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of errors) {
      console.log(`  - ${err.file}: ${err.message}`);
    }
    process.exitCode = 1;
  }

  if (dryRun && indexed > 0) {
    console.log(`\n💡 Run without --dry-run to apply changes to Supabase.`);
  }

  if (!dryRun && indexed > 0) {
    console.log(`\n✅ e-Xpert SAM can now find these materials!`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
