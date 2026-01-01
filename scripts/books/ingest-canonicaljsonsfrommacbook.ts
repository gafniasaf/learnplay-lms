import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { loadLearnPlayEnv } from "../../tests/helpers/parse-learnplay-env";

type IngestResult =
  | {
      ok: true;
      bookId: string;
      bookVersionId: string;
      versionRowId?: string;
      status?: string;
      message?: string;
      requestId?: string;
    }
  | {
      ok: false;
      error?: { code?: string; message?: string };
      httpStatus?: number;
      requestId?: string;
    };

function loadDeployEnv(): void {
  // Local-only deployment env (gitignored) used for function deploy + live verification.
  // Do NOT print values.
  try {
    const deployEnvPath = path.resolve(process.cwd(), "supabase", ".deploy.env");
    if (!existsSync(deployEnvPath)) return;
    const content = readFileSync(deployEnvPath, "utf-8");
    const lines = content.split("\n");
    for (const raw of lines) {
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
      // Only set if not already set (process env wins)
      if (!process.env[key] && value) process.env[key] = value;
    }
  } catch {
    // ignore; script will fail loudly if required vars are missing
  }
}

function slugify(raw: string): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\u2013\u2014]/g, "-") // en/em dash
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "book";
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function pickPreferredFile(files: string[]): string {
  // Prefer non-assembled canonical if present
  const nonAssembled = files.filter((f) => !f.toLowerCase().includes(".assembled."));
  const pool = nonAssembled.length ? nonAssembled : files;

  // Prefer MBO_* naming (usually includes ISBN and clearer provenance)
  const mbo = pool.filter((f) => path.basename(f).startsWith("MBO_"));
  if (mbo.length) return mbo.sort()[0];

  return pool.sort()[0];
}

function inferBookId(fileName: string, canonical: any): string {
  const isbnMatch = fileName.match(/(978\d{10})/);
  if (isbnMatch?.[1]) return isbnMatch[1];

  const metaTitle = typeof canonical?.meta?.title === "string" ? canonical.meta.title : "";
  if (metaTitle.trim()) return slugify(metaTitle);

  // Fallback: slugify filename base
  const base = fileName
    .replace(/__canonical_book_with_figures\.json$/i, "")
    .replace(/__canonical_[^.]+\.json$/i, "")
    .replace(/\.json$/i, "");
  return slugify(base);
}

function inferLevel(fileName: string, canonical: any): "n3" | "n4" {
  const metaLevel = typeof canonical?.meta?.level === "string" ? canonical.meta.level.trim().toLowerCase() : "";
  if (metaLevel === "n3" || metaLevel === "n4") return metaLevel;

  // If meta is missing, infer from filename as a last resort
  const upper = fileName.toUpperCase();
  if (upper.includes("_N3_") || upper.includes("N3")) return "n3";
  if (upper.includes("_N4_") || upper.includes("N4")) return "n4";

  throw new Error(`BLOCKED: cannot infer level (n3/n4) for ${fileName}`);
}

async function callIngest({
  supabaseUrl,
  agentToken,
  organizationId,
  bookId,
  title,
  level,
  source,
  canonical,
  includeFigures,
}: {
  supabaseUrl: string;
  agentToken: string;
  organizationId: string;
  bookId: string;
  title: string;
  level: "n3" | "n4";
  source: string;
  canonical: any;
  includeFigures: boolean;
}): Promise<IngestResult> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/book-ingest-version`;

  const body: Record<string, unknown> = {
    bookId,
    title,
    level,
    source,
    canonical,
  };

  // If we can't rely on a pre-existing library index, we can still ingest by supplying a
  // version-scoped figures.json with an empty srcMap. This is NOT intended as a long-term
  // mapping; it just unblocks ingest so the Missing Images workflow can run.
  if (includeFigures) {
    body.figures = { srcMap: {} };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": agentToken,
      "x-organization-id": organizationId,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as IngestResult | null;
  if (data && typeof data === "object") return data;
  return { ok: false, error: { code: "invalid_response", message: `Invalid JSON response (${res.status})` }, httpStatus: res.status };
}

async function main(): Promise<void> {
  loadDeployEnv();
  loadLearnPlayEnv();

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const AGENT_TOKEN = process.env.AGENT_TOKEN;
  const ORGANIZATION_ID = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;

  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!AGENT_TOKEN) missing.push("AGENT_TOKEN");
  if (!ORGANIZATION_ID) missing.push("ORGANIZATION_ID");
  if (missing.length) {
    console.error(`❌ BLOCKED: missing required env var(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  const dir = path.resolve(process.cwd(), "canonicaljsonsfrommacbook");
  if (!existsSync(dir)) {
    console.error(`❌ BLOCKED: folder not found: ${dir}`);
    process.exit(1);
  }

  const allJsonFiles = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"));
  if (!allJsonFiles.length) {
    console.log("No JSON files found to ingest.");
    return;
  }

  // Group by SHA256 to avoid ingesting exact duplicates (we have some duplicate exports).
  const byHash = new Map<string, string[]>();
  for (const name of allJsonFiles) {
    const full = path.join(dir, name);
    const buf = readFileSync(full);
    const hash = sha256Hex(buf);
    const list = byHash.get(hash) || [];
    list.push(name);
    byHash.set(hash, list);
  }

  const chosenFiles = Array.from(byHash.entries())
    .map(([hash, files]) => ({ hash, files, chosen: pickPreferredFile(files) }))
    .sort((a, b) => a.chosen.localeCompare(b.chosen));

  console.log(`Found ${allJsonFiles.length} JSON file(s), ${chosenFiles.length} unique content blob(s).`);

  const results: Array<{
    fileName: string;
    sha256: string;
    bookId: string;
    level: "n3" | "n4";
    title: string;
    includeFigures: boolean;
    response: IngestResult;
  }> = [];

  for (const { hash, chosen } of chosenFiles) {
    const fileName = chosen;
    const fullPath = path.join(dir, fileName);
    const canonicalText = readFileSync(fullPath, "utf-8");
    let canonical: any;
    try {
      canonical = JSON.parse(canonicalText);
    } catch {
      console.error(`❌ Skipping ${fileName}: invalid JSON`);
      continue;
    }

    const bookId = inferBookId(fileName, canonical);
    const level = inferLevel(fileName, canonical);
    const title = typeof canonical?.meta?.title === "string" && canonical.meta.title.trim()
      ? canonical.meta.title.trim()
      : bookId;

    // Attempt ingest WITHOUT figures first (preferred: stable book_version_id derived from canonical only,
    // and figures_path can point to the shared library index if it already exists).
    let includeFigures = false;
    let response = await callIngest({
      supabaseUrl: SUPABASE_URL!,
      agentToken: AGENT_TOKEN!,
      organizationId: ORGANIZATION_ID!,
      bookId,
      title,
      level,
      source: "MACBOOK_CANONICAL",
      canonical,
      includeFigures,
    });

    // If blocked due to missing shared library index, re-try with an empty figures payload so we can still ingest.
    if (
      response?.ok === false &&
      response?.error?.code === "missing_image_library"
    ) {
      includeFigures = true;
      response = await callIngest({
        supabaseUrl: SUPABASE_URL!,
        agentToken: AGENT_TOKEN!,
        organizationId: ORGANIZATION_ID!,
        bookId,
        title,
        level,
        source: "MACBOOK_CANONICAL",
        canonical,
        includeFigures,
      });
    }

    results.push({ fileName, sha256: hash, bookId, level, title, includeFigures, response });

    if (response.ok) {
      const shortVer = response.bookVersionId.slice(0, 12);
      console.log(`✅ Ingested ${fileName} → bookId=${bookId} level=${level} version=${shortVer}…${includeFigures ? " (figures:empty)" : ""}`);
    } else {
      const code = response.error?.code || "error";
      const msg = response.error?.message || "Unknown error";
      console.error(`❌ FAILED ${fileName} → bookId=${bookId} (${code}): ${msg}`);
    }
  }

  const outDir = path.resolve(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "canonicaljsonsfrommacbook.ingest-report.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf-8");
  console.log(`\nWrote report: ${path.relative(process.cwd(), outPath)}`);
}

await main();



