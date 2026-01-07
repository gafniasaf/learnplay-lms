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

function ensureNumberedTitle(numRaw: unknown, titleRaw: unknown): string {
  const num = normalizeWs(typeof numRaw === "number" ? String(numRaw) : String(numRaw || ""));
  const title = normalizeWs(typeof titleRaw === "string" ? titleRaw : String(titleRaw || ""));
  const base = title || "";
  if (!num) return base;
  const baseNorm = normalizeWs(base);
  if (baseNorm.startsWith(`${num} `) || baseNorm.startsWith(`${num}.`) || baseNorm.startsWith(`${num})`)) return baseNorm;
  return normalizeWs(`${num} ${base}`.trim());
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(String(s || "").trim());
}

type Pass1Canonical = {
  chapters?: any[];
  meta?: { id?: string; title?: string; level?: string };
};

type SkeletonV1 = {
  meta: {
    bookId: string;
    bookVersionId: string;
    title: string;
    level: "n3" | "n4";
    language: string;
    schemaVersion: "skeleton_v1";
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

function buildOutlineSkeletonV1FromPass1(opts: { canonical: Pass1Canonical; bookId: string; bookVersionId: string }): SkeletonV1 {
  const meta = opts.canonical?.meta || {};
  const title = normalizeWs(meta.title) || `Book ${opts.bookId}`;
  const levelRaw = normalizeWs(meta.level).toLowerCase();
  const level = (levelRaw === "n3" || levelRaw === "n4" ? levelRaw : "n4") as "n3" | "n4";
  const language = "nl";

  const chaptersIn = Array.isArray(opts.canonical?.chapters) ? opts.canonical.chapters : [];
  if (!chaptersIn.length) throw new Error("BLOCKED: PASS1 JSON has no chapters[]");

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
    const chapterTitle = normalizeWs(ch?.title || "") || `Hoofdstuk ${chapterNumber}`;

    const sectionsIn = Array.isArray(ch?.sections) ? ch.sections : [];
    if (!sectionsIn.length) throw new Error(`BLOCKED: PASS1 JSON chapter[${idx}] has no sections[]`);

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
                throw new Error(`BLOCKED: PASS1 JSON section ${sectionId} has a subparagraph with no title/number`);
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

    // Deterministic full-page opener placeholder (works without assets.zip).
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

async function main() {
  const pass1PathRaw = String(process.argv[2] || "").trim();
  if (!pass1PathRaw) {
    console.error("Usage: npx tsx scripts/books/ingest-pass1-and-enqueue-bookgen.ts <path-to-pass1-json>");
    process.exit(1);
  }
  const pass1Path = path.isAbsolute(pass1PathRaw) ? pass1PathRaw : path.join(process.cwd(), pass1PathRaw);
  const raw = await readFile(pass1Path, "utf8");
  const canonical = JSON.parse(raw) as Pass1Canonical;

  const chaptersIn = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
  const meta = canonical?.meta || {};
  const chapterCount = chaptersIn.length;
  if (chapterCount !== 14) {
    throw new Error(`BLOCKED: Expected 14 chapters for A&F N4, got ${chapterCount}`);
  }

  const supabaseUrl = (() => {
    const vRaw = process.env.VITE_SUPABASE_URL;
    const v = typeof vRaw === "string" ? vRaw.trim() : "";
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const agentToken = requireEnv("AGENT_TOKEN");
  const orgId = requireEnv("ORGANIZATION_ID");

  const title = normalizeWs(meta.title) || "MBO A&F 4";
  const levelRaw = normalizeWs(meta.level).toLowerCase();
  const level = levelRaw === "n3" || levelRaw === "n4" ? levelRaw : "n4";

  // Prefer stable book id from PASS1 canonical.meta.id (uuid). Fall back to a new uuid.
  const bookId = isUuid(String(meta.id || "")) ? String(meta.id) : crypto.randomUUID();
  const bookVersionId = crypto.randomUUID();

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1) Create book row (idempotent)
  {
    const { error } = await supabase
      .from("books")
      .upsert({
        id: bookId,
        organization_id: orgId,
        title,
        level,
        source: "INGEST_PASS1_BUNDLE",
      })
      .eq("id", bookId);
    if (error) throw new Error(`Failed to upsert book: ${error.message}`);
  }

  // 2) Create version row
  {
    const { error } = await supabase.from("book_versions").insert({
      book_id: bookId,
      book_version_id: bookVersionId,
      schema_version: "1.0",
      status: "active",
      source: "INGEST_PASS1_BUNDLE",
      canonical_path: `${bookId}/${bookVersionId}/canonical.json`,
    });
    if (error) throw new Error(`Failed to create book version: ${error.message}`);
  }

  // 3) Convert PASS1 → skeleton_v1 outline and save via Edge (compiles canonical)
  const skeleton = buildOutlineSkeletonV1FromPass1({ canonical, bookId, bookVersionId });

  const saveRes = await callEdgeAsAgent({
    supabaseUrl,
    agentToken,
    orgId,
    path: "book-version-save-skeleton",
    body: { bookId, bookVersionId, skeleton, note: "Seeded from PASS1 (outline skeleton_v1)", compileCanonical: true },
  });

  // 4) Enqueue generation (chapter 1) via Edge enqueue-job (processed by cron in Supabase)
  const payload: Record<string, unknown> = {
    bookId,
    bookVersionId,
    chapterIndex: 0,
    chapterCount,
    topic: title,
    language: "nl",
    level,
    layoutProfile: "pass2",
    microheadingDensity: "medium",
    imagePromptLanguage: "book",
    writeModel: "anthropic:claude-sonnet-4-5",
    userInstructions:
      "Schrijf in vriendelijk, leerlinggericht Nederlands (zoals het referentieboek). " +
      "Gebruik vaak 'je'. " +
      "Leg begrippen stap voor stap uit met zinnen als: 'Dit betekent dat...' en 'Hierbij kun je bijvoorbeeld denken aan...'. " +
      "Vermijd een te academische toon en introduceer afkortingen pas als ze logisch zijn. " +
      "Houd de tekst vlot en begrijpelijk, met duidelijke verbanden ('Hierdoor...', 'Doordat...', 'Op dezelfde manier...'). " +
      "Zorg dat 'In de praktijk' en 'Verdieping' kaders concreet en relevant zijn waar de outline dat vraagt.",
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        title,
        bookId,
        bookVersionId,
        chapterCount,
        saved: { skeletonPath: saveRes?.skeletonPath, compiledCanonicalPath: saveRes?.compiledCanonicalPath },
        generationJobId: jobId,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ ingest-pass1-and-enqueue-bookgen failed: ${msg}`);
  process.exit(1);
});


