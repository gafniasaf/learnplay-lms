import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";
import {
  CURATED_MATERIAL_ENTITY,
  CURATED_STORAGE_BUCKET,
  CuratedMaterialIndexRecordV1Schema,
  CuratedMaterialPackV1Schema,
  buildCuratedPackStoragePath,
} from "../src/lib/types/curated-material";

type CanonicalMeta = {
  id?: string;
  title?: string;
  level?: string; // e.g. "n3" | "n4"
  language?: string; // e.g. "nl"
};

type CanonicalParagraph = {
  type?: "paragraph";
  id?: string;
  basis?: string; // HTML string
};

type CanonicalSubparagraph = {
  type?: "subparagraph";
  id?: string;
  title?: string;
  content?: CanonicalBlock[];
};

type CanonicalSteps = {
  type?: "steps";
  id?: string;
  items?: unknown[];
};

type CanonicalBlock = CanonicalParagraph | CanonicalSubparagraph | CanonicalSteps | Record<string, unknown>;

type CanonicalSection = {
  id?: string;
  title?: string;
  content?: CanonicalBlock[];
};

type CanonicalChapter = {
  number?: string | number;
  title?: string;
  sections?: CanonicalSection[];
  recap?: unknown;
};

type CanonicalBook = {
  meta?: CanonicalMeta;
  chapters?: CanonicalChapter[];
  export?: unknown;
};

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
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const v = argv[idx + 1];
  return v ? String(v) : null;
}

function stableUuidFromString(input: string): string {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32).split("");
  // UUID v4-ish (deterministic): set version nibble and variant nibble
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

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqStrings(values: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function extractStrongTerms(html: string): string[] {
  const out: string[] = [];
  const re = /<strong>([^<]{1,80})<\/strong>/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    out.push(String(m[1] || "").trim());
  }
  return out;
}

function renderBlocks(blocks: CanonicalBlock[] | undefined, depth = 0): string {
  if (!Array.isArray(blocks) || !blocks.length) return "";
  const parts: string[] = [];

  for (const b of blocks) {
    const t = (b as any)?.type;
    if (t === "paragraph") {
      const basis = typeof (b as any)?.basis === "string" ? String((b as any).basis).trim() : "";
      if (!basis) continue;
      parts.push(`<p>${basis}</p>`);
      continue;
    }

    if (t === "subparagraph") {
      const title = typeof (b as any)?.title === "string" ? String((b as any).title).trim() : "";
      const content = Array.isArray((b as any)?.content) ? ((b as any).content as CanonicalBlock[]) : [];
      if (title) {
        // Keep headings shallow so the teacher view stays readable.
        const tag = depth <= 0 ? "h4" : depth === 1 ? "h5" : "h6";
        parts.push(`<${tag}>${escapeHtml(title)}</${tag}>`);
      }
      const inner = renderBlocks(content, depth + 1);
      if (inner) parts.push(inner);
      continue;
    }

    if (t === "steps") {
      const items = Array.isArray((b as any)?.items) ? ((b as any).items as unknown[]) : [];
      // Some compiled corpora include empty steps. Skip empty; otherwise show as ordered list.
      if (!items.length) continue;
      parts.push("<ol>");
      for (const it of items.slice(0, 20)) {
        const s = typeof it === "string" ? it : (it && typeof it === "object" && "basis" in (it as any) ? String((it as any).basis) : "");
        const txt = stripHtml(String(s || ""));
        if (!txt) continue;
        parts.push(`<li>${escapeHtml(txt)}</li>`);
      }
      parts.push("</ol>");
      continue;
    }

    // Best-effort: recursively render any nested content arrays.
    const nested = (b as any)?.content;
    if (Array.isArray(nested)) {
      const inner = renderBlocks(nested as CanonicalBlock[], depth + 1);
      if (inner) parts.push(inner);
    }
  }

  return parts.join("\n");
}

function buildChapterHtml(args: {
  bookTitle: string;
  bookLevel: string | null;
  bookId: string;
  chapter: CanonicalChapter;
}): { html: string; preview: string; strongTerms: string[] } {
  const chapterTitleRaw = typeof args.chapter?.title === "string" ? args.chapter.title.trim() : "";
  const chapterTitle = chapterTitleRaw || "Hoofdstuk";
  const levelLabel = args.bookLevel ? args.bookLevel.toUpperCase() : "";

  const htmlParts: string[] = [];

  htmlParts.push(`<article data-source="book-corpus" data-book-id="${escapeHtml(args.bookId)}">`);
  htmlParts.push(
    `<p><strong>${escapeHtml(args.bookTitle)}</strong>${levelLabel ? ` · Niveau ${escapeHtml(levelLabel)}` : ""}</p>`,
  );
  htmlParts.push(`<h2>${escapeHtml(chapterTitle)}</h2>`);

  const sections = Array.isArray(args.chapter?.sections) ? args.chapter.sections : [];
  for (const sec of sections) {
    const secTitle = typeof sec?.title === "string" ? sec.title.trim() : "";
    const blocks = Array.isArray(sec?.content) ? sec.content : [];
    const bodyHtml = renderBlocks(blocks, 0);
    if (!secTitle && !bodyHtml) continue;

    htmlParts.push(`<section>`);
    if (secTitle) htmlParts.push(`<h3>${escapeHtml(secTitle)}</h3>`);
    if (bodyHtml) htmlParts.push(bodyHtml);
    htmlParts.push(`</section>`);
  }

  htmlParts.push("</article>");

  const html = htmlParts.join("\n");
  const previewRaw = stripHtml(html);
  const preview = previewRaw.length > 240 ? `${previewRaw.slice(0, 240).trim()}…` : previewRaw;
  return { html, preview, strongTerms: uniqStrings(extractStrongTerms(html), 40) };
}

async function findCanonicalPath(args: {
  supabase: ReturnType<typeof createClient>;
  root: string;
}): Promise<{ canonicalPath: string; versionDir: string } | null> {
  const { data, error } = await args.supabase.storage.from("books").list(args.root, {
    limit: 50,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) return null;
  const subs = (Array.isArray(data) ? data : []).map((o: any) => String(o?.name || "")).filter(Boolean);

  // Prefer UUID-like version folders
  const uuidish = subs.filter((n) => /^[0-9a-f-]{36}$/i.test(n));
  const candidates = uuidish.length ? uuidish : subs;

  for (const dir of candidates) {
    const p = `${args.root}/${dir}/canonical.json`;
    const { error: dlErr } = await args.supabase.storage.from("books").download(p);
    if (!dlErr) return { canonicalPath: p, versionDir: dir };
  }
  return null;
}

async function main(): Promise<void> {
  // Load local-only env files without printing secrets.
  loadLocalEnvForTests();
  loadLearnPlayEnv();

  const dryRun = parseFlag("--dry-run");
  const rootsArg = parseArg("--roots");
  const maxBooksRaw = parseArg("--max-books");
  const maxBooks = maxBooksRaw ? Math.max(1, Math.floor(Number(maxBooksRaw))) : null;

  const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!SUPABASE_URL) throw new Error("BLOCKED: SUPABASE_URL/VITE_SUPABASE_URL missing");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rootsRaw, error: rootsErr } = await supabase.storage.from("books").list("", {
    limit: 200,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (rootsErr) throw new Error(`Failed to list books bucket: ${rootsErr.message}`);

  const allRoots = (Array.isArray(rootsRaw) ? rootsRaw : [])
    .map((o: any) => String(o?.name || ""))
    .filter(Boolean)
    .filter((n) => n !== "library" && n !== "books" && !n.startsWith("e2e-"));

  const explicitRoots =
    rootsArg
      ? rootsArg
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

  const candidateRoots = explicitRoots
    ? explicitRoots
    : allRoots.filter((n) => n.startsWith("mbo-") || /^\d{13}$/.test(n));

  const roots = maxBooks ? candidateRoots.slice(0, maxBooks) : candidateRoots;

  let booksSeen = 0;
  let booksIngested = 0;
  let chaptersIngested = 0;
  const errors: Array<{ root: string; message: string }> = [];

  for (const root of roots) {
    booksSeen += 1;
    try {
      const found = await findCanonicalPath({ supabase, root });
      if (!found) continue;

      const { data: blob, error: dlErr } = await supabase.storage.from("books").download(found.canonicalPath);
      if (dlErr || !blob) continue;
      const text = await blob.text();
      if (!text.trim()) continue;

      const book = JSON.parse(text) as CanonicalBook;
      const meta = (book && typeof book === "object" ? book.meta : null) as CanonicalMeta | null;
      const bookTitle = String(meta?.title || root).trim();
      const bookLevelRaw = String(meta?.level || "").trim().toLowerCase();
      const bookLevel = bookLevelRaw === "n3" || bookLevelRaw === "n4" ? bookLevelRaw : null;
      const bookId = String(meta?.id || root).trim();

      // Only ingest MBO N3/N4 books by default; override with --roots to force others.
      if (!explicitRoots) {
        const isMbo = bookTitle.toLowerCase().startsWith("mbo");
        if (!isMbo) continue;
        if (!bookLevel) continue;
      }

      const chapters = Array.isArray(book?.chapters) ? book.chapters : [];
      if (!chapters.length) continue;

      const now = new Date().toISOString();
      const levelLabel = bookLevel ? bookLevel.toUpperCase() : "";
      booksIngested += 1;

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i] as CanonicalChapter;
        const chapterTitleRaw = typeof chapter?.title === "string" ? chapter.title.trim() : "";
        const chapterTitle = chapterTitleRaw || `Hoofdstuk ${i + 1}`;
        const curatedTitle = `${levelLabel ? `[${levelLabel}] ` : ""}${bookTitle} — ${chapterTitle}`;
        const sourceKey = [
          ORGANIZATION_ID,
          "books",
          root,
          found.versionDir,
          String(chapter?.number ?? i + 1),
          chapterTitle,
        ].join("|");
        const curatedId = stableUuidFromString(sourceKey);

        const packPath = buildCuratedPackStoragePath({
          organizationId: ORGANIZATION_ID,
          materialId: curatedId,
          languageVariant: "b2",
        });

        const { html, preview, strongTerms } = buildChapterHtml({
          bookTitle,
          bookLevel,
          bookId,
          chapter,
        });

        if (!html.trim()) continue;

        const sharedKeywords = uniqStrings(
          [
            "MBO",
            levelLabel ? `N${levelLabel.replace(/^N/, "")}` : "",
            bookTitle,
            bookId,
            root,
          ],
          20,
        );
        const variantKeywords = uniqStrings(
          [
            bookTitle,
            chapterTitle,
            ...strongTerms,
          ],
          60,
        );

        const nlKeywords = uniqStrings(
          [
            ...strongTerms,
          ],
          40,
        );

        const pack = CuratedMaterialPackV1Schema.parse({
          schema_version: 1,
          id: curatedId,
          title: curatedTitle,
          material_type: "theorie",
          language_variant: "b2",
          module_id: root,
          kd_codes: [],
          keywords: variantKeywords,
          nl_keywords: nlKeywords,
          preview: preview || undefined,
          content_html: html,
          created_at: now,
          updated_at: now,
        });

        const indexRecordBase = CuratedMaterialIndexRecordV1Schema.parse({
          id: curatedId,
          title: curatedTitle,
          material_type: "theorie",
          module_id: root,
          kd_codes: [],
          keywords: sharedKeywords,
          variants: {
            b2: {
              storage_bucket: CURATED_STORAGE_BUCKET,
              storage_path: packPath,
              preview: pack.preview,
              keywords: variantKeywords,
              nl_keywords: nlKeywords,
              updated_at: now,
            },
          },
          pack_schema_version: 1,
          created_at: now,
          updated_at: now,
        });

        // Persist extra metadata for debugging (search/index ignores unknown keys).
        const indexRecord = {
          ...indexRecordBase,
          source: {
            type: "book-corpus",
            book_root: root,
            book_version: found.versionDir,
            canonical_path: found.canonicalPath,
            book_id: bookId,
            book_title: bookTitle,
            book_level: bookLevel,
            chapter_number: chapter?.number ?? i + 1,
            chapter_title: chapterTitle,
          },
        } as typeof indexRecordBase & { source: Record<string, unknown> };

        if (!dryRun) {
          // 1) Upload pack JSON to Storage
          const uploadBody = Buffer.from(JSON.stringify(pack, null, 2), "utf-8");
          const { error: upErr } = await supabase.storage.from(CURATED_STORAGE_BUCKET).upload(packPath, uploadBody, {
            upsert: true,
            contentType: "application/json",
          });
          if (upErr) throw new Error(`Storage upload failed for ${packPath}: ${upErr.message}`);

          // 2) Upsert index record in entity_records
          const { error: recErr } = await supabase
            .from("entity_records")
            .upsert(
              {
                id: curatedId,
                organization_id: ORGANIZATION_ID,
                entity: CURATED_MATERIAL_ENTITY,
                title: curatedTitle,
                data: indexRecord,
                updated_at: now,
              },
              { onConflict: "id" },
            );
          if (recErr) throw new Error(`DB upsert failed for curated-material ${curatedId}: ${recErr.message}`);
        }

        chaptersIngested += 1;
      }
    } catch (e) {
      errors.push({ root, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Summary (no secrets)
  const summary = {
    ok: errors.length === 0,
    dryRun,
    rootsSeen: booksSeen,
    rootsIngested: booksIngested,
    chaptersIngested,
    errors: errors.slice(0, 10),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (errors.length) {
    // Fail loudly so CI/scripts can detect partial ingests
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

