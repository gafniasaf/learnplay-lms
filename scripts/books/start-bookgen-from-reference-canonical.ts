import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function normalizeWs(s: unknown): string {
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(raw: string): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "book";
}

function inferBookIdFromFile(fileName: string, canonical: any): string {
  const isbnMatch = fileName.match(/(978\d{10})/);
  if (isbnMatch?.[1]) return isbnMatch[1];

  const metaTitle = typeof canonical?.meta?.title === "string" ? canonical.meta.title : "";
  if (metaTitle.trim()) return slugify(metaTitle);

  const base = path.basename(fileName).replace(/\.json$/i, "");
  return slugify(base);
}

function inferLevelFromCanonical(fileName: string, canonical: any): "n3" | "n4" {
  const metaLevel = typeof canonical?.meta?.level === "string" ? canonical.meta.level.trim().toLowerCase() : "";
  if (metaLevel === "n3" || metaLevel === "n4") return metaLevel;
  const upper = fileName.toUpperCase();
  if (upper.includes("_N3_") || upper.includes("N3")) return "n3";
  if (upper.includes("_N4_") || upper.includes("N4")) return "n4";
  throw new Error(`BLOCKED: cannot infer level (n3/n4) for ${fileName}`);
}

function ensureNumberedTitle(numRaw: unknown, titleRaw: unknown): string {
  const num = normalizeWs(typeof numRaw === "number" ? String(numRaw) : String(numRaw || ""));
  const title = normalizeWs(typeof titleRaw === "string" ? titleRaw : String(titleRaw || ""));
  const base = title || "";
  if (!num) return base;
  const baseNorm = normalizeWs(base);
  if (baseNorm.startsWith(`${num} `) || baseNorm.startsWith(`${num}.`) || baseNorm.startsWith(`${num})`)) return baseNorm;
  return normalizeWs(`${num} ${base}`.trim());
}

function normalizeChapterTitle(chNum: number, rawTitle: unknown): string {
  const t = normalizeWs(rawTitle);
  if (!t) return `Hoofdstuk ${chNum}`;

  // Common PASS1 export quirk: ".1 Inleiding" → "1. Inleiding"
  const m = t.match(/^\.(\d+)\s+(.+)$/);
  if (m && Number(m[1]) === chNum) return `${chNum}. ${normalizeWs(m[2])}`;

  // If already starts with "1." keep it.
  if (t.startsWith(`${chNum}.`)) return t;
  return t;
}

type Pass1Canonical = {
  chapters?: any[];
  meta?: { id?: string; title?: string; level?: string; language?: string };
};

type SkeletonV1 = {
  meta: {
    bookId: string;
    bookVersionId: string;
    title: string;
    level: "n3" | "n4";
    language: string;
    schemaVersion: "skeleton_v1";
    promptPackId?: string;
    promptPackVersion?: number;
  };
  styleProfile: null;
  chapters: Array<{
    id: string;
    number: number;
    title: string;
    openerImageSrc: string | null;
    sections: Array<{
      id: string;
      title: string;
      blocks: Array<{
        type: "subparagraph";
        id: string | null;
        title: string;
        blocks: Array<{ type: "paragraph"; id: string; basisHtml: string; images: null }>;
      }>;
    }>;
  }>;
};

function buildOutlineSkeletonV1FromCanonical(opts: {
  canonical: Pass1Canonical;
  bookId: string;
  bookVersionId: string;
  promptPackId: string;
  promptPackVersion: number;
}): SkeletonV1 {
  const meta = opts.canonical?.meta || {};
  const title = normalizeWs(meta.title) || `Book ${opts.bookId}`;
  const levelRaw = normalizeWs(meta.level).toLowerCase();
  const level = (levelRaw === "n3" || levelRaw === "n4" ? levelRaw : "n4") as "n3" | "n4";
  const language = normalizeWs(meta.language) || "nl";

  const chaptersIn = Array.isArray(opts.canonical?.chapters) ? opts.canonical.chapters : [];
  if (!chaptersIn.length) throw new Error("BLOCKED: reference canonical has no chapters[]");

  let seedCounter = 0;
  const mkSeedParagraph = () => ({
    type: "paragraph" as const,
    id: `seed-p-${String(++seedCounter).padStart(6, "0")}`,
    basisHtml: "",
    images: null,
  });

  const chapters = chaptersIn.map((ch: any, idx: number) => {
    const chapterNumberParsed = Number.parseInt(String(ch?.number ?? ""), 10);
    const chapterNumber = Number.isFinite(chapterNumberParsed) && chapterNumberParsed > 0 ? chapterNumberParsed : idx + 1;
    const chapterTitle = normalizeChapterTitle(chapterNumber, ch?.title);

    const sectionsIn = Array.isArray(ch?.sections) ? ch.sections : [];
    if (!sectionsIn.length) throw new Error(`BLOCKED: reference canonical chapter[${idx}] has no sections[]`);

    const sections = sectionsIn.map((sec: any, secIdx: number) => {
      const sectionId = normalizeWs(sec?.number ?? "") || `${chapterNumber}.${secIdx + 1}`;
      const sectionTitleRaw = normalizeWs(sec?.title || "");
      const sectionTitle = ensureNumberedTitle(sectionId, sectionTitleRaw || `Section ${sectionId}`);

      const contentIn = Array.isArray(sec?.content) ? sec.content : [];
      const subparagraphs = contentIn.filter((b: any) => b && typeof b === "object" && b.type === "subparagraph");

      const blocks =
        subparagraphs.length > 0
          ? subparagraphs.map((sp: any) => {
              const spTitle = ensureNumberedTitle(sp?.number, sp?.title);
              if (!spTitle) {
                throw new Error(`BLOCKED: reference canonical section ${sectionId} has a subparagraph with no title/number`);
              }
              return {
                type: "subparagraph" as const,
                id: typeof sp?.id === "string" ? normalizeWs(sp.id) : null,
                title: spTitle,
                blocks: [mkSeedParagraph()],
              };
            })
          : [
              {
                type: "subparagraph" as const,
                id: null,
                title: sectionTitle,
                blocks: [mkSeedParagraph()],
              },
            ];

      return { id: sectionId, title: sectionTitle, blocks };
    });

    const openerImageSrc = `placeholder://chapter-opener/ch${chapterNumber}`;

    return {
      id: `ch-${chapterNumber}`,
      number: chapterNumber,
      title: chapterTitle,
      openerImageSrc,
      sections,
    };
  });

  return {
    meta: {
      bookId: opts.bookId,
      bookVersionId: opts.bookVersionId,
      title,
      level,
      language,
      schemaVersion: "skeleton_v1",
      promptPackId: opts.promptPackId,
      promptPackVersion: opts.promptPackVersion,
    },
    styleProfile: null,
    chapters,
  };
}

async function callEdgeAsAgent(opts: {
  supabaseUrl: string;
  agentToken: string;
  orgId: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<any> {
  const url = `${opts.supabaseUrl.replace(/\/$/, "")}/functions/v1/${opts.path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": opts.agentToken,
      "x-organization-id": opts.orgId,
    },
    body: JSON.stringify(opts.body),
  });
  const text = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!resp.ok || json?.ok === false) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${resp.status}`;
    throw new Error(`Edge ${opts.path} failed: ${msg}`);
  }
  return json;
}

async function ensureLibraryIndexExists(opts: { supabase: any; bookId: string }) {
  const libraryIndexPath = `library/${opts.bookId}/images-index.json`;
  const dl = await opts.supabase.storage.from("books").download(libraryIndexPath);
  if (!dl.error && dl.data) return libraryIndexPath;

  const payload = { bookSlug: opts.bookId, updatedAt: new Date().toISOString(), srcMap: {} };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const up = await opts.supabase.storage.from("books").upload(libraryIndexPath, blob, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "no-cache",
  });
  if (up.error) throw new Error(up.error.message);
  return libraryIndexPath;
}

async function uploadMinimalDesignTokens(opts: { supabase: any; path: string }) {
  const payload = { schemaVersion: "1.0", source: "BOOKGEN_REFERENCE" };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const up = await opts.supabase.storage.from("books").upload(opts.path, blob, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "no-cache",
  });
  if (up.error) throw new Error(up.error.message);
}

async function main() {
  const canonicalPathRaw = String(process.argv[2] || "").trim();
  if (!canonicalPathRaw) {
    console.error("Usage: npx tsx scripts/books/start-bookgen-from-reference-canonical.ts <path-to-reference-canonical.json>");
    process.exit(1);
  }
  const canonicalPath = path.isAbsolute(canonicalPathRaw) ? canonicalPathRaw : path.join(process.cwd(), canonicalPathRaw);
  const canonicalText = await readFile(canonicalPath, "utf8");
  const canonical = JSON.parse(canonicalText) as Pass1Canonical;

  const chaptersIn = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
  const chapterCount = chaptersIn.length;
  if (chapterCount < 1) throw new Error("BLOCKED: reference canonical has no chapters[]");
  if (chapterCount > 60) throw new Error(`BLOCKED: chapterCount too large (${chapterCount})`);

  const supabaseUrl = (() => {
    const v = typeof process.env.VITE_SUPABASE_URL === "string" ? process.env.VITE_SUPABASE_URL.trim() : "";
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const agentToken = requireEnv("AGENT_TOKEN");
  const orgId = requireEnv("ORGANIZATION_ID");

  const title = normalizeWs(canonical?.meta?.title) || path.basename(canonicalPath, ".json");
  const level = inferLevelFromCanonical(path.basename(canonicalPath), canonical);
  const language = "nl";

  const bookId = inferBookIdFromFile(path.basename(canonicalPath), canonical);
  const bookVersionId = crypto.randomUUID();

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Upsert book (idempotent) — but NEVER overwrite a book that belongs to another org.
  {
    const { data: existing, error: exErr } = await supabase
      .from("books")
      .select("id, organization_id")
      .eq("id", bookId)
      .maybeSingle();
    if (exErr) throw new Error(`Failed to check existing book: ${exErr.message}`);
    if (existing && String((existing as any).organization_id || "") !== orgId) {
      throw new Error(`BLOCKED: BookId '${bookId}' belongs to a different organization`);
    }

    const { error } = await supabase.from("books").upsert({
      id: bookId,
      organization_id: orgId,
      title,
      level,
      source: "BOOKGEN_REFERENCE",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new Error(`Failed to upsert book: ${error.message}`);
  }

  // 2) Ensure shared library index exists (for figures/openers, even if empty)
  const figuresPath = await ensureLibraryIndexExists({ supabase, bookId });

  // 3) Create version row (skeleton-first; canonical is produced by compileCanonical)
  const canonicalOutPath = `${bookId}/${bookVersionId}/canonical.json`;
  const designTokensPath = `${bookId}/${bookVersionId}/design_tokens.json`;
  {
    const { error } = await supabase.from("book_versions").insert({
      book_id: bookId,
      book_version_id: bookVersionId,
      schema_version: "1.0",
      status: "active",
      source: "BOOKGEN_REFERENCE",
      exported_at: new Date().toISOString(),
      canonical_path: canonicalOutPath,
      figures_path: figuresPath,
      design_tokens_path: designTokensPath,
    });
    if (error) throw new Error(`Failed to create book version: ${error.message}`);
  }

  // 4) Upload minimal design tokens so the bundle is complete
  await uploadMinimalDesignTokens({ supabase, path: designTokensPath });

  // 5) Convert reference canonical → skeleton_v1 outline and save via Edge (compiles canonical)
  const promptPackId = `canonicaljsonsfrommacbook/${path.basename(canonicalPath)}`;
  const promptPackVersion = 1;
  const skeleton = buildOutlineSkeletonV1FromCanonical({ canonical, bookId, bookVersionId, promptPackId, promptPackVersion });

  const saveRes = await callEdgeAsAgent({
    supabaseUrl,
    agentToken,
    orgId,
    path: "book-version-save-skeleton",
    body: { bookId, bookVersionId, skeleton, note: `Seeded from reference canonical: ${path.basename(canonicalPath)}`, compileCanonical: true },
  });

  // 6) Enqueue generation (chapter 1) via enqueue-job
  const payload: Record<string, unknown> = {
    bookId,
    bookVersionId,
    chapterIndex: 0,
    chapterCount,
    topic: title,
    language,
    level,
    layoutProfile: "pass2",
    microheadingDensity: "medium",
    imagePromptLanguage: "book",
    writeModel: "anthropic:claude-sonnet-4-5",
    userInstructions:
      "Schrijf in duidelijk, leerlinggericht Nederlands (MBO niveau 4). " +
      "Gebruik vaak 'je'. " +
      "Leg begrippen stap voor stap uit met concrete voorbeelden. " +
      "Houd microheadings kort (alleen de titel); zet uitleg nooit in de heading. " +
      "Gebruik 'In de praktijk' en 'Verdieping' kaders waar de outline daarom vraagt, met concrete situaties uit de zorg/kliniek. " +
      "Markeer kernbegrippen consistent met <strong>... </strong>.",
    promptPackId,
    promptPackVersion,
  };

  const enqueueRes = await callEdgeAsAgent({
    supabaseUrl,
    agentToken,
    orgId,
    path: "enqueue-job",
    body: { jobType: "book_generate_chapter", payload },
  });

  const jobId = typeof enqueueRes?.jobId === "string" ? enqueueRes.jobId : "";
  if (!jobId) throw new Error("BLOCKED: enqueue-job returned no jobId");

  console.log(JSON.stringify({
    ok: true,
    reference: path.relative(process.cwd(), canonicalPath),
    title,
    bookId,
    bookVersionId,
    chapterCount,
    saved: { skeletonPath: saveRes?.skeletonPath, compiledCanonicalPath: saveRes?.compiledCanonicalPath },
    generationJobId: jobId,
  }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ start-bookgen-from-reference-canonical failed: ${msg}`);
  process.exit(1);
});


