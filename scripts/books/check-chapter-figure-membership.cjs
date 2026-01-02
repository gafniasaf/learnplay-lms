/**
 * Diagnostic: verify whether auto-attached library figures for a chapter are likely correct.
 *
 * What it does:
 * - Calls `book-version-input-urls` (Edge) for a specific bookVersion + chapter.
 * - Downloads the *source* `canonical.json` (no secrets printed).
 * - Compares:
 *   - embedded image srcs inside the canonical chapter
 *   - autoChapterFigures inferred from the library index (by figureNumber/chapter number)
 *   - text mentions in the canonical chapter (e.g. "Afbeelding 5.1", "Gordon", "voeding")
 *
 * Required env:
 * - BOOK_ID
 * - BOOK_VERSION_ID
 * - BOOK_CHAPTER_INDEX (0-based)
 *
 * Uses env resolution order:
 * - process.env (already set)
 * - supabase/.deploy.env, learnplay.env, .env*
 * - learnplay.env heading-style (via tests/helpers/parse-learnplay-env.cjs)
 *
 * NOTE: This script NEVER prints signed URLs or secret values.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

function loadKeyValueEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed
        .slice(idx + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
      if (!key) continue;
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore unreadable local env files
  }
}

function loadLocalEnvFiles(root) {
  const candidates = [
    path.join(root, "supabase", ".deploy.env"),
    path.join(root, "learnplay.env"),
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.development"),
    path.join(root, ".env.production"),
  ];
  for (const f of candidates) loadKeyValueEnvFile(f);
}

function loadLearnplayHeadingEnv() {
  try {
    const { loadLearnPlayEnv } = require(path.join(process.cwd(), "tests", "helpers", "parse-learnplay-env.cjs"));
    if (typeof loadLearnPlayEnv === "function") loadLearnPlayEnv();
  } catch {
    // ignore
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env`);
  }
  return v.trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function collectEmbeddedImageSrcs(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const v of node) collectEmbeddedImageSrcs(v, out);
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node.images)) {
    for (const im of node.images) {
      const src = im && typeof im.src === "string" ? im.src.trim() : "";
      if (src) out.add(src);
    }
  }
  for (const v of Object.values(node)) collectEmbeddedImageSrcs(v, out);
}

function collectAllText(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const v of node) collectAllText(v, out);
    return;
  }
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (typeof node !== "object") return;
  for (const v of Object.values(node)) collectAllText(v, out);
}

async function main() {
  const root = process.cwd();
  loadLocalEnvFiles(root);
  loadLearnplayHeadingEnv();

  const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL")).replace(/\/$/, "");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const BOOK_ID = requireEnv("BOOK_ID");
  const BOOK_VERSION_ID = requireEnv("BOOK_VERSION_ID");
  const CHAPTER_INDEX = Number(requireEnv("BOOK_CHAPTER_INDEX"));
  if (!Number.isFinite(CHAPTER_INDEX) || CHAPTER_INDEX < 0) {
    throw new Error("BLOCKED: BOOK_CHAPTER_INDEX must be a number >= 0");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-version-input-urls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": ORGANIZATION_ID,
    },
    body: JSON.stringify({
      bookId: BOOK_ID,
      bookVersionId: BOOK_VERSION_ID,
      target: "chapter",
      chapterIndex: CHAPTER_INDEX,
      includeChapterOpeners: true,
      autoAttachLibraryImages: true,
      allowMissingImages: false,
    }),
  });

  const text = await res.text().catch(() => "");
  const json = text ? safeJsonParse(text) : null;
  if (!json || json.ok !== true) {
    throw new Error(`Edge error: ${(json && json.error && (json.error.message || json.error.code)) || res.status}`);
  }

  const canonicalSignedUrl = json?.urls?.canonical?.signedUrl;
  const canonicalPath = json?.urls?.canonical?.path;
  if (!canonicalSignedUrl || !canonicalPath) throw new Error("Missing canonical URL/path in response");

  const auto = json?.autoChapterFigures || null;
  const figsFor = auto ? (auto[String(CHAPTER_INDEX)] || auto[CHAPTER_INDEX]) : null;
  const figsSummary = Array.isArray(figsFor)
    ? figsFor.map((f) => ({
        figureNumber: String(f?.figureNumber || ""),
        src: String(f?.src || ""),
        caption: String(f?.caption || ""),
      }))
    : [];

  // Download canonical.json (source)
  const outDir = path.join(root, "tmp", "source-canonical", `book-${BOOK_ID}`, `version-${BOOK_VERSION_ID}`);
  await fsp.mkdir(outDir, { recursive: true });
  const canonOut = path.join(outDir, "canonical.json");
  const canonRes = await fetch(canonicalSignedUrl);
  if (!canonRes.ok) throw new Error(`canonical download failed (${canonRes.status})`);
  const canonText = await canonRes.text();
  await fsp.writeFile(canonOut, canonText, "utf8");

  const canonical = canonText ? JSON.parse(canonText) : null;
  const ch = canonical?.chapters?.[CHAPTER_INDEX] || null;
  const chapterNum = String(ch?.number || "");
  const chapterTitle = String(ch?.title || "");

  const embedded = new Set();
  collectEmbeddedImageSrcs(ch, embedded);
  const embeddedArr = Array.from(embedded);

  const textChunks = [];
  collectAllText(ch, textChunks);
  const plain = stripHtml(textChunks.join("\n")).toLowerCase();
  const mention = (needle) => (plain.includes(needle) ? plain.split(needle).length - 1 : 0);

  const autoSrcs = new Set(figsSummary.map((f) => f.src));
  const overlap = embeddedArr.filter((s) => autoSrcs.has(s));

  console.log(
    JSON.stringify(
      {
        canonicalPath,
        savedCanonical: path.relative(root, canonOut),
        chapter: { chapterIndex: CHAPTER_INDEX, chapterNum, chapterTitle },
        embeddedImageSrcCount: embeddedArr.length,
        embeddedImageSrcSample: embeddedArr.slice(0, 12),
        autoChapterFiguresCount: figsSummary.length,
        autoChapterFiguresSample: figsSummary.slice(0, 20),
        embeddedVsAutoOverlap: { overlapCount: overlap.length, overlapSample: overlap.slice(0, 12) },
        textMentions: {
          gordon: mention("gordon"),
          patroon: mention("patroon"),
          voedsel: mention("voedsel"),
          voeding: mention("voeding"),
          afbeelding_5_1: mention("afbeelding 5.1"),
          afbeelding_5_2: mention("afbeelding 5.2"),
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});


