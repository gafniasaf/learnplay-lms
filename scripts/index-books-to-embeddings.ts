/**
 * Index book content into content_embeddings for SAM semantic search.
 *
 * This script indexes canonical book JSON into the content_embeddings table
 * so SAM can search through book/module content.
 *
 * Usage:
 *   npx tsx scripts/index-books-to-embeddings.ts --book-id 9789083412016           # Index specific book
 *   npx tsx scripts/index-books-to-embeddings.ts --list                            # List available books
 *   npx tsx scripts/index-books-to-embeddings.ts --all                             # Index all books
 *   npx tsx scripts/index-books-to-embeddings.ts --dry-run --book-id 9789083412016 # Preview without writing
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { loadLearnPlayEnv, parseLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

// Load environment
loadLocalEnvForTests();
loadLearnPlayEnv();

// ---------- Types ----------
type CanonicalBlock = {
  type?: string;
  id?: string;
  title?: string;
  basis?: string;
  praktijk?: string;
  verdieping?: string;
  content?: CanonicalBlock[];
  items?: unknown[];
};

type CanonicalSection = {
  id?: string;
  title?: string;
  content?: CanonicalBlock[];
};

type CanonicalChapter = {
  number?: number | string;
  title?: string;
  sections?: CanonicalSection[];
};

type CanonicalBook = {
  meta?: {
    id?: string;
    title?: string;
    level?: string;
    language?: string;
  };
  chapters?: CanonicalChapter[];
};

type BookInfo = {
  bookId: string;
  bookVersionId: string;
  canonicalPath: string;
  title?: string;
  level?: string;
  chapterCount?: number;
};

// ---------- Helpers ----------
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in learnplay.env or environment`);
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

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextFromBlocks(blocks: CanonicalBlock[] | undefined, depth = 0): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  const parts: string[] = [];

  for (const block of blocks) {
    const t = block?.type;

    if (t === "paragraph") {
      if (block.basis) parts.push(stripHtml(block.basis));
      if (block.praktijk) parts.push(stripHtml(block.praktijk));
      if (block.verdieping) parts.push(stripHtml(block.verdieping));
      continue;
    }

    if (t === "subparagraph") {
      if (block.title) parts.push(stripHtml(block.title));
      if (Array.isArray(block.content)) {
        const inner = extractTextFromBlocks(block.content, depth + 1);
        if (inner) parts.push(inner);
      }
      continue;
    }

    if (t === "steps" && Array.isArray(block.items)) {
      for (const item of block.items.slice(0, 50)) {
        if (typeof item === "string") {
          parts.push(stripHtml(item));
        } else if (item && typeof item === "object" && "basis" in (item as any)) {
          parts.push(stripHtml(String((item as any).basis || "")));
        }
      }
      continue;
    }

    if (Array.isArray(block.content)) {
      const inner = extractTextFromBlocks(block.content, depth + 1);
      if (inner) parts.push(inner);
    }
  }

  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function extractChapterText(chapter: CanonicalChapter): string {
  const parts: string[] = [];

  if (chapter.title) {
    parts.push(stripHtml(chapter.title));
  }

  const sections = Array.isArray(chapter.sections) ? chapter.sections : [];
  for (const section of sections) {
    if (section.title) {
      parts.push(stripHtml(section.title));
    }
    if (Array.isArray(section.content)) {
      const sectionText = extractTextFromBlocks(section.content);
      if (sectionText) parts.push(sectionText);
    }
  }

  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function chunkText(text: string, minSize: number, maxSize: number, overlap: number): string[] {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + maxSize, cleaned.length);

    if (end < cleaned.length) {
      const searchStart = Math.max(start + minSize, end - 400);
      const segment = cleaned.substring(searchStart, end);
      const sentenceEnd = segment.lastIndexOf(". ");
      if (sentenceEnd !== -1) {
        end = searchStart + sentenceEnd + 1;
      } else {
        const spaceIndex = segment.lastIndexOf(" ");
        if (spaceIndex !== -1) {
          end = searchStart + spaceIndex;
        }
      }
    }

    const chunk = cleaned.substring(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    start = end - overlap;
    if (start <= chunks[chunks.length - 1]?.length || start >= cleaned.length) {
      start = end;
    }
  }

  return chunks;
}

async function generateEmbeddings(
  inputs: string[],
  opts: { apiKey: string; model: string },
): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      input: inputs,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embeddings error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const rows = (data?.data ?? []) as Array<{ embedding: number[] }>;
  return rows.map((r) => r.embedding);
}

async function downloadJsonOrNull(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<any | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  try {
    const text = await data.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function uploadJson(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  data: unknown,
): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
}

async function listBooks(supabase: SupabaseClient): Promise<BookInfo[]> {
  const books: BookInfo[] = [];

  // List top-level folders in books bucket (each is a bookId)
  const { data: bookFolders, error: listErr } = await supabase.storage.from("books").list("", {
    limit: 500,
    sortBy: { column: "name", order: "asc" },
  });

  if (listErr || !bookFolders) {
    console.error("Failed to list books:", listErr?.message);
    return [];
  }

  for (const folder of bookFolders) {
    if (!folder.name || folder.name.startsWith(".") || folder.name === "library") continue;

    const bookId = folder.name;

    // List version folders under this book
    const { data: versionFolders } = await supabase.storage.from("books").list(bookId, {
      limit: 50,
      sortBy: { column: "name", order: "desc" },
    });

    if (!versionFolders || versionFolders.length === 0) continue;

    // Find the first version that has a canonical.json
    for (const vf of versionFolders) {
      if (!vf.name || vf.name.startsWith(".")) continue;

      const canonicalPath = `${bookId}/${vf.name}/canonical.json`;
      const canonical = await downloadJsonOrNull(supabase, "books", canonicalPath);

      if (canonical) {
        books.push({
          bookId,
          bookVersionId: vf.name,
          canonicalPath,
          title: canonical?.meta?.title,
          level: canonical?.meta?.level,
          chapterCount: Array.isArray(canonical?.chapters) ? canonical.chapters.length : undefined,
        });
        break; // Only add the latest version
      }
    }
  }

  return books;
}

async function indexBook(
  supabase: SupabaseClient,
  organizationId: string,
  bookInfo: BookInfo,
  openaiApiKey: string,
  dryRun: boolean,
): Promise<{ ok: boolean; chunkCount: number; embedded: number }> {
  console.log(`\n📖 Indexing: ${bookInfo.title || bookInfo.bookId}`);
  console.log(`   Path: ${bookInfo.canonicalPath}`);

  // Download canonical JSON
  const canonical = await downloadJsonOrNull(supabase, "books", bookInfo.canonicalPath) as CanonicalBook | null;
  if (!canonical) {
    console.error(`   ❌ Failed to download canonical.json`);
    return { ok: false, chunkCount: 0, embedded: 0 };
  }

  const bookTitle = canonical.meta?.title || bookInfo.bookId;
  const chapters = Array.isArray(canonical.chapters) ? canonical.chapters : [];

  if (chapters.length === 0) {
    console.error(`   ❌ Book has no chapters`);
    return { ok: false, chunkCount: 0, embedded: 0 };
  }

  console.log(`   📚 ${chapters.length} chapters`);

  // Extract text from all chapters
  const chapterTexts: Array<{ chapterIndex: number; title: string; text: string }> = [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];
    const chapterTitle = chapter.title || `Hoofdstuk ${ci + 1}`;
    const text = extractChapterText(chapter);

    if (text.length > 100) {
      chapterTexts.push({
        chapterIndex: ci,
        title: chapterTitle,
        text: `${bookTitle} - ${chapterTitle}: ${text}`,
      });
    }
  }

  if (chapterTexts.length === 0) {
    console.error(`   ❌ No extractable text found`);
    return { ok: false, chunkCount: 0, embedded: 0 };
  }

  // Combine all text and chunk
  const fullText = chapterTexts.map((c) => c.text).join(" ");
  const chunks = chunkText(fullText, 900, 1600, 200);

  console.log(`   ✂️  ${chunks.length} chunks`);

  if (dryRun) {
    console.log(`   [DRY RUN] Would index ${chunks.length} chunks`);
    return { ok: true, chunkCount: chunks.length, embedded: 0 };
  }

  // Clear existing embeddings for this book
  const bookKey = `book:${bookInfo.bookId}`;
  const { error: delErr } = await supabase
    .from("content_embeddings")
    .delete()
    .eq("organization_id", organizationId)
    .eq("course_id", bookKey)
    .eq("content_type", "reference");

  if (delErr) {
    console.warn(`   ⚠️  Failed to clear existing embeddings: ${delErr.message}`);
  }

  // Generate and store embeddings
  const BATCH_SIZE = 32;
  const EMBEDDING_MODEL = "text-embedding-3-small";
  const maxChars = 12000;
  let embedded = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE).map((t) =>
      t.length > maxChars ? t.slice(0, maxChars) : t
    );

    const vectors = await generateEmbeddings(batch, { apiKey: openaiApiKey, model: EMBEDDING_MODEL });

    const rows = vectors.map((embedding, idx) => ({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      course_id: bookKey,
      group_index: 0,
      item_index: i + idx,
      content_type: "reference",
      option_id: null,
      text_content: chunks[i + idx],
      embedding,
    }));

    const { error: insErr } = await supabase.from("content_embeddings").insert(rows);
    if (insErr) {
      console.error(`   ❌ Failed to store embeddings: ${insErr.message}`);
      return { ok: false, chunkCount: chunks.length, embedded };
    }

    embedded += rows.length;
    process.stdout.write(`   ⚡ Embedded ${embedded}/${chunks.length}\r`);
  }

  console.log(`   ✅ Indexed ${embedded} chunks`);
  return { ok: true, chunkCount: chunks.length, embedded };
}

// ---------- Main ----------
async function main() {
  const dryRun = parseFlag("--dry-run");
  const listMode = parseFlag("--list");
  const allBooks = parseFlag("--all");
  const bookId = parseArg("--book-id");

  console.log("📚 Book Content Indexer for SAM");
  console.log("================================\n");

  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`🔗 Supabase: ${SUPABASE_URL}`);
  console.log(`🏢 Organization: ${ORGANIZATION_ID}`);

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - no data will be written\n");
  }

  // List available books
  console.log("\n📋 Scanning for books...");
  const books = await listBooks(supabase);

  if (books.length === 0) {
    console.log("   No books found in storage.");
    return;
  }

  console.log(`   Found ${books.length} book(s):\n`);

  if (listMode) {
    for (const book of books) {
      console.log(`   📖 ${book.bookId}`);
      console.log(`      Title: ${book.title || "(untitled)"}`);
      console.log(`      Level: ${book.level || "(unknown)"}`);
      console.log(`      Version: ${book.bookVersionId}`);
      console.log(`      Chapters: ${book.chapterCount ?? "?"}`);
      console.log();
    }
    return;
  }

  // Filter books to index
  let booksToIndex: BookInfo[];
  if (bookId) {
    const found = books.find((b) => b.bookId === bookId);
    if (!found) {
      console.error(`❌ Book not found: ${bookId}`);
      console.log("   Available books:");
      for (const b of books) {
        console.log(`     - ${b.bookId} (${b.title || "untitled"})`);
      }
      process.exit(1);
    }
    booksToIndex = [found];
  } else if (allBooks) {
    booksToIndex = books;
  } else {
    console.log("Usage:");
    console.log("  --list               List available books");
    console.log("  --book-id <id>       Index specific book");
    console.log("  --all                Index all books");
    console.log("  --dry-run            Preview without writing");
    return;
  }

  // Index selected books
  let totalChunks = 0;
  let totalEmbedded = 0;
  let indexed = 0;

  for (const book of booksToIndex) {
    try {
      const result = await indexBook(supabase, ORGANIZATION_ID, book, OPENAI_API_KEY, dryRun);
      if (result.ok) {
        indexed++;
        totalChunks += result.chunkCount;
        totalEmbedded += result.embedded;
      }
    } catch (err) {
      console.error(`   ❌ Error indexing ${book.bookId}:`, err);
    }
  }

  // Update book corpus index
  if (!dryRun && indexed > 0) {
    const indexPath = `${ORGANIZATION_ID}/book-corpus/index.json`;
    const existingIndex = await downloadJsonOrNull(supabase, "materials", indexPath);
    const mergedIndex: any = {
      version: 1,
      updated_at: new Date().toISOString(),
      books: {},
    };
    if (existingIndex?.books) {
      mergedIndex.books = { ...existingIndex.books };
    }

    for (const book of booksToIndex) {
      mergedIndex.books[book.bookId] = {
        title: book.title,
        level: book.level,
        book_version_id: book.bookVersionId,
        indexed_at: new Date().toISOString(),
        chapter_count: book.chapterCount,
      };
    }

    await uploadJson(supabase, "materials", indexPath, mergedIndex);
    console.log(`\n📇 Updated index at: ${indexPath}`);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary");
  console.log("=".repeat(50));
  console.log(`Books indexed: ${indexed}/${booksToIndex.length}`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Total embeddings: ${totalEmbedded}`);
  if (dryRun) {
    console.log("\n⚠️  DRY RUN - no data was written");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
