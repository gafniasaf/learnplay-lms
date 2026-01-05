import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

type CanonicalPass1 = {
  meta?: { title?: string; level?: string; language?: string };
  chapters?: Array<{
    number?: string | number;
    title?: string;
    sections?: Array<{
      number?: string | number;
      title?: string;
      content?: Array<any>;
    }>;
  }>;
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
  styleProfile?: Record<string, unknown> | null;
  chapters: Array<{
    id: string;
    number: number;
    title: string;
    openerImageSrc?: string | null;
    sections: Array<{
      id: string;
      title: string;
      blocks: Array<{
        type: "subparagraph";
        id?: string | null;
        title: string;
        blocks: Array<{
          type: "paragraph";
          id: string;
          basisHtml: string;
          images?: null;
        }>;
      }>;
    }>;
  }>;
};

function normalizeWs(s: string): string {
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
  const candidate = `${num} ${base}`.trim();
  // Avoid double-prefixing if title already begins with the number.
  return normalizeWs(base).startsWith(`${num} `) ? normalizeWs(base) : candidate;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`❌ ${name} is REQUIRED`);
    process.exit(1);
  }
  return String(v).trim();
}

function pickPass1FileForTopic(topic: string): string {
  const t = normalizeWs(topic).toLowerCase();
  if (t.includes("a&f") || t.includes("anatomie") || t.includes("fysiologie")) return "af4_full_skeleton.json";
  if (t.includes("communicatie")) return "communicatie_full_skeleton.json";
  if (t.includes("klinisch")) return "klinisch_redeneren_full_skeleton.json";
  if (t.includes("methodisch")) return "methodisch_werken_full_skeleton.json";
  if (t.includes("persoonlijke")) return "persoonlijke_verzorging_full_skeleton.json";
  if (t.includes("wetgeving")) return "wetgeving_full_skeleton.json";
  throw new Error(`BLOCKED: Cannot map topic to PASS1 file: "${topic}"`);
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
  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!resp.ok) {
    throw new Error(`Edge ${opts.path} failed (${resp.status}): ${text.slice(0, 400)}`);
  }
  return json;
}

function buildOutlineSkeletonV1(opts: {
  canonical: CanonicalPass1;
  bookId: string;
  bookVersionId: string;
}): SkeletonV1 {
  const title = normalizeWs(opts.canonical?.meta?.title || "");
  const levelRaw = normalizeWs(opts.canonical?.meta?.level || "");
  const level = (levelRaw === "n3" || levelRaw === "n4" ? levelRaw : "n4") as "n3" | "n4";
  const language = normalizeWs(opts.canonical?.meta?.language || "") || "nl";

  const chaptersIn = Array.isArray(opts.canonical?.chapters) ? opts.canonical.chapters : [];
  if (!chaptersIn.length) {
    throw new Error("BLOCKED: PASS1 JSON has no chapters[]");
  }

  let seedCounter = 0;
  const mkSeedParagraph = () => ({
    type: "paragraph" as const,
    id: `seed-p-${String(++seedCounter).padStart(6, "0")}`,
    basisHtml: "",
    images: null,
  });

  const chapters = chaptersIn.map((ch, chIdx) => {
    const sectionsIn = Array.isArray(ch?.sections) ? ch.sections : [];
    if (!sectionsIn.length) {
      throw new Error(`BLOCKED: PASS1 JSON chapter[${chIdx}] has no sections[]`);
    }

    const sections = sectionsIn.map((sec, secIdx) => {
      const sectionId = normalizeWs(sec?.number ?? "") || `${chIdx + 1}.${secIdx + 1}`;
      const sectionTitleRaw = normalizeWs(sec?.title || "");
      // Some PASS1 extracts omit section titles for intro/opening sections. This is a warning
      // in skeleton_v1 validation, so we supply a deterministic fallback title.
      const sectionTitle = sectionTitleRaw || `Section ${sectionId}`;

      const contentIn = Array.isArray(sec?.content) ? sec.content : [];
      const subparagraphs = contentIn.filter((b) => b && typeof b === "object" && b.type === "subparagraph");
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
              // Some sections are "flat" (no numbered subparagraph blocks). Seed a single
              // non-numbered subparagraph so validation passes; BookGen will generate 3–7 subs.
              {
                type: "subparagraph" as const,
                id: null,
                title: sectionTitle,
                blocks: [mkSeedParagraph()],
              },
            ];

      return { id: sectionId, title: sectionTitle, blocks };
    });

    const chapterNumberParsed = Number.parseInt(String(ch?.number ?? ""), 10);
    const chapterNumber = Number.isFinite(chapterNumberParsed) && chapterNumberParsed > 0 ? chapterNumberParsed : chIdx + 1;
    const chapterTitle = normalizeWs(ch?.title || "") || `Hoofdstuk ${chapterNumber}`;

    return {
      id: `ch-${chapterNumber}`,
      number: chapterNumber,
      title: chapterTitle,
      openerImageSrc: null,
      sections,
    };
  });

  return {
    meta: {
      bookId: opts.bookId,
      bookVersionId: opts.bookVersionId,
      title: title || `Book ${opts.bookId}`,
      level,
      language,
      schemaVersion: "skeleton_v1",
    },
    styleProfile: null,
    chapters,
  };
}

async function main() {
  loadLocalEnvForTests();
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const pass1Dir = path.join("tmp", "ingest", "tmp", "skeletons", "pass1_json");

  // Hard requirement: we seed skeletons for the 6 ingested book versions created earlier.
  // If you reran ingestion and got different IDs, update these.
  const targets = [
    {
      topic: "MBO A&F 4",
      bookId: "a7d69d8e-90b0-4237-8cd3-fec76fe14ecb",
      bookVersionId: "bc57a1e0-fb49-45b1-b25f-4f7548a2b7df",
    },
    {
      topic: "MBO Communicatie",
      bookId: "1ac0cf3d-c0e2-443d-8044-b7de5283e77f",
      bookVersionId: "39dcbbf2-0f7b-4a0c-8ac1-f45ed2265a39",
    },
    {
      topic: "MBO Praktijkgestuurd klinisch redeneren",
      bookId: "22cfbb25-d7cc-4f01-a6c5-ff2a64d59fdc",
      bookVersionId: "6397b434-5bd8-478a-b7c0-9ef11ec8c934",
    },
    {
      topic: "MBO Methodisch werken",
      bookId: "26b0fada-fa6c-4563-b328-2488c5a42d72",
      bookVersionId: "6988c4f3-c1cc-4568-802f-71bd33bb8781",
    },
    {
      topic: "MBO Persoonlijke Verzorging",
      bookId: "bdf628e6-4965-4962-a595-afb8c057f3fc",
      bookVersionId: "d6b5a6fd-64f5-4028-bbcc-b486196d164c",
    },
    {
      topic: "MBO Wetgeving",
      bookId: "b4ae4b77-9f9e-49db-949c-56e99e0e8314",
      bookVersionId: "78080c59-e5b9-42fc-8f8e-85d5486167cf",
    },
  ];

  // Quick sanity: ensure bundle files exist
  const pass1Files = new Set((await readdir(pass1Dir)).filter((f) => f.endsWith(".json")));

  for (const t of targets) {
    const pass1File = pickPass1FileForTopic(t.topic);
    if (!pass1Files.has(pass1File)) {
      throw new Error(`BLOCKED: Missing PASS1 file ${pass1File} in ${pass1Dir}`);
    }

    const pass1Path = path.join(pass1Dir, pass1File);
    const canonical = JSON.parse(await readFile(pass1Path, "utf8")) as CanonicalPass1;
    const skeleton = buildOutlineSkeletonV1({
      canonical,
      bookId: t.bookId,
      bookVersionId: t.bookVersionId,
    });

    const res = await callEdgeAsAgent({
      supabaseUrl: SUPABASE_URL,
      agentToken: AGENT_TOKEN,
      orgId: ORG_ID,
      path: "book-version-save-skeleton",
      body: {
        bookId: t.bookId,
        bookVersionId: t.bookVersionId,
        skeleton,
        note: "Seeded outline skeleton_v1 from PASS1 bundle (structure-only)",
        compileCanonical: true,
      },
    });

    if (!res || res.ok !== true) {
      throw new Error(`Save-skeleton failed for ${t.topic}: ${JSON.stringify(res)?.slice(0, 400)}`);
    }

    console.log(`✅ Seeded skeleton_v1: ${t.topic} (${t.bookId}/${t.bookVersionId})`);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ seed-skeleton-v1-from-pass1-bundle failed: ${msg}`);
  process.exit(1);
});


