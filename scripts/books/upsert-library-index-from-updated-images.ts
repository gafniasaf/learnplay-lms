import { existsSync, readFileSync } from "fs";
import path from "path";
import { loadLearnPlayEnv } from "../../tests/helpers/parse-learnplay-env";

type UploadedState = {
  bookSlug?: string;
  uploadedByOriginal?: Record<string, { storagePath?: string }>;
};

type PlacementRow = Record<string, string>;

function loadDeployEnv(): void {
  // Local-only deployment env (gitignored). Do NOT print values.
  try {
    const deployEnvPath = path.resolve(process.cwd(), "supabase", ".deploy.env");
    if (!existsSync(deployEnvPath)) return;
    const content = readFileSync(deployEnvPath, "utf-8");
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line
        .slice(idx + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
      if (!key) continue;
      if (!process.env[key] && value) process.env[key] = value;
    }
  } catch {
    // ignore; script will fail loudly if required vars are missing
  }
}

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function basenameLike(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const parts = s.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : s;
}

function csvParseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      // Escape sequence: "" inside quoted string
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): PlacementRow[] {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/g)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const header = csvParseLine(lines[0]!).map((h) => h.replace(/^\uFEFF/, ""));
  const rows: PlacementRow[] = [];

  for (const raw of lines.slice(1)) {
    const cells = csvParseLine(raw);
    const row: PlacementRow = {};
    for (let i = 0; i < header.length; i++) {
      const k = header[i]!;
      row[k] = cells[i] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function toPngName(rawId: string): string {
  const s = String(rawId || "").trim();
  if (!s) return "";
  if (/\.(png)$/i.test(s)) return s;
  return `${s}.png`;
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== "object") {
    return { ok: false, error: { code: "invalid_response", message: `Invalid JSON response (http ${res.status})` } };
  }
  return data;
}

async function main(): Promise<void> {
  loadDeployEnv();
  loadLearnPlayEnv();

  const bookId = getArg("--bookId") || getArg("--book-id") || getArg("--only-book");
  const placementsPath = getArg("--placements");
  const statePath =
    getArg("--state") || (bookId ? path.resolve(process.cwd(), "tmp", "book-images-upload-state", `${bookId}.json`) : null);
  const dryRun = process.argv.includes("--dry-run");

  if (!bookId) {
    console.error("❌ BLOCKED: missing required arg: --bookId <bookId>");
    process.exit(1);
  }
  if (!placementsPath) {
    console.error("❌ BLOCKED: missing required arg: --placements <path/to/placements.csv>");
    process.exit(1);
  }
  if (!statePath) {
    console.error("❌ BLOCKED: missing state path (pass --state or ensure tmp/book-images-upload-state/<bookId>.json exists)");
    process.exit(1);
  }
  if (!existsSync(placementsPath)) {
    console.error(`❌ BLOCKED: placements.csv not found: ${placementsPath}`);
    process.exit(1);
  }
  if (!existsSync(statePath)) {
    console.error(`❌ BLOCKED: upload state not found: ${statePath}`);
    console.error("   Run: python scripts/books/upload-book-image-library.py --root books --only-book <bookId> --upsert");
    process.exit(1);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const AGENT_TOKEN = process.env.AGENT_TOKEN;
  const ORGANIZATION_ID = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;

  const missingEnv: string[] = [];
  if (!SUPABASE_URL) missingEnv.push("SUPABASE_URL");
  if (!AGENT_TOKEN) missingEnv.push("AGENT_TOKEN");
  if (!ORGANIZATION_ID) missingEnv.push("ORGANIZATION_ID");
  if (missingEnv.length) {
    console.error(`❌ BLOCKED: missing required env var(s): ${missingEnv.join(", ")}`);
    process.exit(1);
  }

  const state = JSON.parse(readFileSync(statePath, "utf-8")) as UploadedState;
  const uploadedByOriginal = (state?.uploadedByOriginal && typeof state.uploadedByOriginal === "object")
    ? state.uploadedByOriginal
    : {};

  const placements = parseCsv(readFileSync(placementsPath, "utf-8"));
  if (!placements.length) {
    console.error(`❌ BLOCKED: no rows parsed from placements: ${placementsPath}`);
    process.exit(1);
  }

  const missingOriginals = new Set<string>();
  const mappings = new Map<string, string>(); // canonicalSrc -> storagePath

  function addMapping(canonicalSrc: string, storagePath: string) {
    const k = String(canonicalSrc || "").trim();
    const v = String(storagePath || "").trim();
    if (!k || !v) return;
    if (!mappings.has(k)) mappings.set(k, v);
  }

  for (const row of placements) {
    const outputRel = String(row["output_image_relpath"] || "").trim();
    if (!outputRel) continue;
    const originalName = basenameLike(outputRel);
    if (!originalName) continue;

    const entry = uploadedByOriginal[originalName];
    const storagePath = entry && typeof entry.storagePath === "string" ? entry.storagePath.trim() : "";
    if (!storagePath) {
      missingOriginals.add(originalName);
      continue;
    }

    const sourceLinkName = String(row["source_link_name"] || "").trim();
    if (sourceLinkName) addMapping(sourceLinkName, storagePath);

    const figureId = String(row["figure_id"] || "").trim();
    const numKey = String(row["num_key_guess"] || "").trim();
    const chapterStr = String(row["canonical_chapter_number"] || "").trim();
    const chapterNum = chapterStr && /^\d+$/.test(chapterStr) ? chapterStr : "";

    // Some books have reliable canonical figure_id (e.g. Afbeelding_4.13),
    // but also include num_key_guess derived from the source link name.
    //
    // We map BOTH when present:
    // - figure_id helps when canonicals store src as Afbeelding_<id>.png
    // - num_key_guess helps when canonicals store src as Afbeelding_<numKey>.png (or when one system is off-by-one).
    const pngFromFigureId = figureId ? toPngName(figureId) : "";
    const pngFromNumKey = numKey ? `Afbeelding_${numKey}.png` : "";

    const pngNames = [pngFromFigureId, pngFromNumKey].filter((s) => !!s);
    for (const pngName of pngNames) {
      addMapping(pngName, storagePath);
      if (chapterNum) {
        addMapping(`new_pipeline/assets/figures/ch${chapterNum}/${pngName}`, storagePath);
        addMapping(`assets/figures/ch${chapterNum}/${pngName}`, storagePath);
      }
    }
  }

  // Some canonicals use a conventional opener src even when the Updated Images placements
  // pack does not include a matching row. If we can identify a likely opener image that
  // WAS uploaded for this book, add a deterministic alias for the canonical opener path.
  //
  // This specifically fixes cases like Methodisch werken where opener images are named
  // per chapter (e.g. "*ChapterOpener1*") rather than "Book_chapter_opener.jpg".
  const openerKeys = [
    "new_pipeline/assets/images/ch1/Book_chapter_opener.jpg",
    "assets/images/ch1/Book_chapter_opener.jpg",
    "Book_chapter_opener.jpg",
    "new_pipeline/assets/images/ch1/Book_chapter_opener.png",
    "assets/images/ch1/Book_chapter_opener.png",
    "Book_chapter_opener.png",
  ];
  const alreadyHasOpenerMapping = openerKeys.some((k) => mappings.has(k));
  if (!alreadyHasOpenerMapping) {
    const uploadedNames = Object.keys(uploadedByOriginal || {}).sort((a, b) => a.localeCompare(b));
    const openerCandidate =
      uploadedNames.find((n) => /book[_\s-]*chapter[_\s-]*opener/i.test(n)) ??
      uploadedNames.find((n) => /chapteropener1/i.test(n)) ??
      uploadedNames.find((n) => /chapteropener/i.test(n)) ??
      null;

    const storagePath = openerCandidate && typeof uploadedByOriginal[openerCandidate]?.storagePath === "string"
      ? String(uploadedByOriginal[openerCandidate]?.storagePath || "").trim()
      : "";

    if (storagePath) {
      for (const k of openerKeys) addMapping(k, storagePath);
    }
  }

  if (missingOriginals.size) {
    const sample = Array.from(missingOriginals).slice(0, 20);
    console.error(`❌ BLOCKED: ${missingOriginals.size} placement row(s) reference images not found in upload state.`);
    console.error(`   Missing (first ${sample.length}): ${sample.join(", ")}${missingOriginals.size > sample.length ? ", ..." : ""}`);
    process.exit(1);
  }

  const mappingRows = Array.from(mappings.entries()).map(([canonicalSrc, storagePath]) => ({ canonicalSrc, storagePath }));
  if (!mappingRows.length) {
    console.error("❌ BLOCKED: produced 0 mappings (unexpected).");
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[DRY-RUN] bookId=${bookId} placements=${placements.length} mappings=${mappingRows.length}`);
    return;
  }

  const endpoint = `${String(SUPABASE_URL).replace(/\/$/, "")}/functions/v1/book-library-upsert-index`;
  const authHeaders = { "x-agent-token": String(AGENT_TOKEN), "x-organization-id": String(ORGANIZATION_ID) };
  const res = await postJson(endpoint, { bookId, mappings: mappingRows }, authHeaders);

  if (res?.ok !== true) {
    const code = String(res?.error?.code || "error");
    const msg = String(res?.error?.message || "Unknown error");
    console.error(`❌ BLOCKED: upsert failed (${code}): ${msg}`);
    process.exit(1);
  }

  console.log(`[OK] Upserted ${Number(res.updated || 0)} mappings into ${String(res.indexPath || "")}`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("❌ Unhandled error:", msg);
  process.exit(1);
});


