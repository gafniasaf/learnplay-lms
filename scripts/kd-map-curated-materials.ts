import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";

type KdItemKind = "kerntaak" | "werkproces";

interface KdItem {
  code: string;
  title: string;
  description?: string;
  result?: string;
  roles?: string[];
  parentCode?: string;
  kind: KdItemKind;
}

interface KdIndexItem extends KdItem {
  phrases: string[];
  terms: string[];
  minScore: number;
}

const STOPWORDS = new Set([
  "de", "het", "een", "en", "of", "voor", "van", "op", "in", "met", "bij", "aan", "als", "is", "zijn", "wordt",
  "worden", "door", "naar", "te", "tot", "dat", "die", "dit", "daar", "daarmee", "niet", "wel", "kan", "kunnen",
  "moet", "moeten", "heeft", "hebben", "word", "waar", "waarbij", "zich", "zijn", "haar", "hem", "hen", "zij",
  "deze", "bijvoorbeeld", "zoals", "ook", "eigen", "zorg", "zorgvrager", "zorgvragers", "zorgverlener",
]);

const DEFAULT_PAGE_SIZE = 1000;
const KD_JSON_PATH = path.resolve("data", "kd-2026-vigvp.json");

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

function extractTerms(text: string): string[] {
  const tokens = normalizeText(text).split(" ");
  return uniq(tokens.filter((token) => token.length >= 4 && !STOPWORDS.has(token)));
}

function buildKdItems(kdJson: any): KdItem[] {
  const items: KdItem[] = [];
  const basisdeel = kdJson?.basisdeel?.kerntaken ?? [];
  for (const kerntaak of basisdeel) {
    items.push({
      code: kerntaak.code,
      title: kerntaak.titel,
      kind: "kerntaak",
    });
    for (const wp of kerntaak?.werkprocessen ?? []) {
      items.push({
        code: wp.code,
        title: wp.titel,
        description: wp.omschrijving,
        result: wp.resultaat,
        roles: wp.rollen,
        parentCode: kerntaak.code,
        kind: "werkproces",
      });
    }
  }

  const profieldeel = kdJson?.profieldeel ?? {};
  for (const profile of Object.values(profieldeel)) {
    const extraKerntaken = (profile as any)?.extra_kerntaken ?? [];
    for (const kerntaak of extraKerntaken) {
      items.push({
        code: kerntaak.code,
        title: kerntaak.titel,
        kind: "kerntaak",
      });
      for (const wp of kerntaak?.werkprocessen ?? []) {
        items.push({
          code: wp.code,
          title: wp.titel,
          description: wp.omschrijving,
          result: wp.resultaat,
          roles: wp.rollen,
          parentCode: kerntaak.code,
          kind: "werkproces",
        });
      }
    }
  }

  return items;
}

function buildKdIndex(items: KdItem[]): KdIndexItem[] {
  return items.map((item) => {
    const phrase = normalizeText(item.title);
    const terms = extractTerms([item.title, item.description, item.result, ...(item.roles ?? [])].join(" "));
    return {
      ...item,
      phrases: phrase ? [phrase] : [],
      terms,
      minScore: item.kind === "werkproces" ? 4 : 3,
    };
  });
}

function collectMaterialText(data: any): string {
  const parts: string[] = [];
  const pushString = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  };
  const pushArray = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) pushString(item);
  };

  pushString(data?.title);
  pushString(data?.preview);
  pushString(data?.course_name);
  pushString(data?.category);
  pushString(data?.material_type);
  pushString(data?.module_id);
  pushArray(data?.keywords);
  pushArray(data?.nl_keywords);

  const metadata = data?.metadata ?? {};
  pushString(metadata?.mbo_track);
  pushString(metadata?.module_family);
  pushArray(metadata?.topic_tags);
  pushString(metadata?.exercise_format);
  pushArray(metadata?.law_topics);
  pushArray(metadata?.communication_context);

  const variants = data?.variants ?? {};
  for (const variant of [variants?.b2, variants?.b1, variants?.a2, variants?.ar]) {
    pushString(variant?.preview);
    pushArray(variant?.keywords);
    pushArray(variant?.nl_keywords);
  }

  return normalizeText(parts.join(" "));
}

function matchKdCodes(materialText: string, kdIndex: KdIndexItem[]): { codes: string[]; scores: Record<string, number> } {
  const matches: { code: string; score: number; parentCode?: string }[] = [];

  for (const item of kdIndex) {
    let score = 0;
    for (const phrase of item.phrases) {
      if (materialText.includes(phrase)) score += 3;
    }
    for (const term of item.terms) {
      if (materialText.includes(term)) score += 1;
    }
    if (score >= item.minScore) {
      matches.push({ code: item.code, score, parentCode: item.parentCode });
    }
  }

  const scoreMap: Record<string, number> = {};
  for (const match of matches) {
    scoreMap[match.code] = Math.max(scoreMap[match.code] ?? 0, match.score);
    if (match.parentCode) {
      scoreMap[match.parentCode] = Math.max(scoreMap[match.parentCode] ?? 0, 2);
    }
  }

  const codes = Object.keys(scoreMap).sort((a, b) => scoreMap[b] - scoreMap[a]);
  return { codes, scores: scoreMap };
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/\"/g, "\"\"")}"`;
    }
    return str;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

function recommendationFor(count: number): string {
  if (count === 0) return "Create 1 theory + 2 exercises (incl. casus)";
  if (count < 3) return "Add 1 exercise or casus";
  return "Coverage ok";
}

async function main() {
  const args = process.argv.slice(2);
  const applyUpdates = args.includes("--apply");
  const limitArg = args.find((a, i) => args[i - 1] === "--limit");
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  loadLocalEnvForTests();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const organizationId = process.env.ORGANIZATION_ID;

  if (!supabaseUrl) {
    console.error("BLOCKED: SUPABASE_URL is required.");
    process.exit(1);
  }
  if (!serviceKey) {
    console.error("BLOCKED: SUPABASE_SERVICE_ROLE_KEY is required.");
    process.exit(1);
  }
  if (!organizationId) {
    console.error("BLOCKED: ORGANIZATION_ID is required.");
    process.exit(1);
  }

  const kdRaw = readFileSync(KD_JSON_PATH, "utf-8");
  const kdJson = JSON.parse(kdRaw);
  const kdItems = buildKdItems(kdJson);
  const kdIndex = buildKdIndex(kdItems);
  const validCodes = new Set(kdItems.map((item) => item.code));

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const pageSize = DEFAULT_PAGE_SIZE;
  let from = 0;
  let totalProcessed = 0;
  const mappingRows: Array<{
    id: string;
    title: string;
    material_type?: string;
    kd_codes: string[];
    kd_scores: Record<string, number>;
  }> = [];

  const updates: any[] = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("entity_records")
      .select("id, data")
      .eq("entity", "curated-material")
      .eq("organization_id", organizationId)
      .range(from, to);

    if (error) {
      console.error("Error fetching entity_records:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    for (const record of data) {
      if (limit && totalProcessed >= limit) break;
      totalProcessed += 1;

      const recordData = record.data ?? {};
      const materialText = collectMaterialText(recordData);
      const { codes: matchedCodes, scores } = matchKdCodes(materialText, kdIndex);
      const existingCodes = Array.isArray(recordData.kd_codes) ? recordData.kd_codes : [];
      const filteredExisting = existingCodes.filter((code: string) => validCodes.has(code));
      const nextCodes = uniq([...filteredExisting, ...matchedCodes]);

      mappingRows.push({
        id: record.id,
        title: recordData.title ?? "",
        material_type: recordData.material_type,
        kd_codes: nextCodes,
        kd_scores: scores,
      });

      const changed = JSON.stringify(filteredExisting.sort()) !== JSON.stringify(nextCodes.slice().sort());
      if (applyUpdates && changed) {
        updates.push({
          id: record.id,
          organization_id: organizationId,
          entity: "curated-material",
          data: { ...recordData, kd_codes: nextCodes },
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (limit && totalProcessed >= limit) break;
    from += pageSize;
  }

  if (applyUpdates && updates.length) {
    const batchSize = 200;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const { error } = await supabase
        .from("entity_records")
        .upsert(batch, { onConflict: "id" });
      if (error) {
        console.error("Error upserting entity_records:", error.message);
        process.exit(1);
      }
    }
  }

  const kdCoverage: Record<string, { count: number; examples: string[] }> = {};
  for (const item of kdItems) {
    kdCoverage[item.code] = { count: 0, examples: [] };
  }
  for (const row of mappingRows) {
    for (const code of row.kd_codes) {
      const entry = kdCoverage[code];
      if (!entry) continue;
      entry.count += 1;
      if (entry.examples.length < 3 && row.title) entry.examples.push(row.title);
    }
  }

  const reportItems = kdItems.map((item) => {
    const coverage = kdCoverage[item.code];
    const count = coverage?.count ?? 0;
    return {
      code: item.code,
      title: item.title,
      kind: item.kind,
      parent: item.parentCode ?? "",
      count,
      status: count === 0 ? "missing" : count < 3 ? "low" : "covered",
      recommendation: recommendationFor(count),
      examples: coverage?.examples ?? [],
    };
  });

  const missing = reportItems.filter((item) => item.status === "missing");
  const lowCoverage = reportItems.filter((item) => item.status === "low");
  const covered = reportItems.filter((item) => item.status === "covered");

  const report = {
    generated_at: new Date().toISOString(),
    organization_id: organizationId,
    total_materials: mappingRows.length,
    kd_codes_total: reportItems.length,
    coverage_summary: {
      covered: covered.length,
      low: lowCoverage.length,
      missing: missing.length,
    },
    items: reportItems,
  };

  const mappingPath = path.resolve("tmp", "kd-2026-material-kd-mapping.json");
  const reportPath = path.resolve("tmp", "kd-2026-gap-report.json");
  const csvPath = path.resolve("tmp", "kd-2026-gap-report.csv");

  writeFileSync(mappingPath, JSON.stringify(mappingRows, null, 2));
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const csvRows = reportItems.map((item) => ({
    code: item.code,
    title: item.title,
    kind: item.kind,
    parent: item.parent,
    count: item.count,
    status: item.status,
    recommendation: item.recommendation,
  }));
  writeFileSync(csvPath, toCsv(csvRows));

  console.log("KD mapping complete.");
  console.log(`Materials processed: ${mappingRows.length}`);
  console.log(`Gap report: ${reportPath}`);
  console.log(`Gap report CSV: ${csvPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err?.message ?? err);
  process.exit(1);
});
