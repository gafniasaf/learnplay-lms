import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`❌ ${name} is REQUIRED`);
    process.exit(1);
  }
  return String(v).trim();
}

function getSupabaseUrl(): string {
  const v0 = typeof process.env.VITE_SUPABASE_URL === "string" ? process.env.VITE_SUPABASE_URL.trim() : "";
  if (v0) return v0.replace(/\/$/, "");
  return requireEnv("SUPABASE_URL").replace(/\/$/, "");
}

function normalizeWs(s: unknown): string {
  return String(s || "")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function downloadJson(supabase: any, bucket: string, path: string): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || `Failed to download ${bucket}/${path}`);
  const text = await data.text();
  if (!text) throw new Error(`Empty file: ${bucket}/${path}`);
  return JSON.parse(text);
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  const bookVersionId = String(process.argv[3] || "").trim();
  const chapterIndex = Number.parseInt(String(process.argv[4] || "").trim(), 10);
  const sectionIndex = Number.parseInt(String(process.argv[5] || "").trim(), 10);

  if (!bookId || !bookVersionId || !Number.isFinite(chapterIndex) || !Number.isFinite(sectionIndex)) {
    console.error(
      "Usage: npx tsx scripts/books/dump-skeleton-section-outline.ts <bookId> <bookVersionId> <chapterIndex(0-based)> <sectionIndex(0-based)>",
    );
    process.exit(1);
  }

  const SUPABASE_URL = getSupabaseUrl();
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
  const sk = await downloadJson(supabase, "books", skeletonPath);

  const ch = Array.isArray(sk?.chapters) ? sk.chapters[chapterIndex] : null;
  if (!ch) throw new Error(`No chapter at index ${chapterIndex}`);
  const sec = Array.isArray(ch?.sections) ? ch.sections[sectionIndex] : null;
  if (!sec) throw new Error(`No section at index ${sectionIndex}`);

  const blocks = Array.isArray(sec?.blocks) ? sec.blocks : [];
  const topSubs = blocks.filter((b: any) => b && typeof b === "object" && b.type === "subparagraph");
  const titles = topSubs.map((b: any) => normalizeWs(b.title));

  console.log(
    JSON.stringify(
      {
        ok: true,
        bookId,
        bookVersionId,
        chapterIndex,
        sectionIndex,
        sectionId: normalizeWs(sec?.id),
        sectionTitle: normalizeWs(sec?.title),
        topLevelSubparagraphCount: topSubs.length,
        topLevelSubparagraphTitles: titles,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ dump-skeleton-section-outline failed: ${msg}`);
  process.exit(1);
});


