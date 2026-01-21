/**
 * book_content_index (Factory / ai_agent_jobs)
 *
 * Indexes book/module content into content_embeddings for SAM semantic search.
 *
 * Input payload:
 *   - organization_id: string (required)
 *   - book_id: string (required) - e.g. "9789083412016"
 *   - book_version_id?: string (optional) - if not provided, finds latest version
 *
 * Output:
 *   - Embeddings stored in content_embeddings with course_id = "book:{bookId}"
 *   - Index manifest at materials/{org}/book-corpus/index.json
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import type { JobContext, JobExecutor } from "./types.ts";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { chunkText } from "../../_shared/materials/ingest-utils.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`BLOCKED: ${name} is REQUIRED`);
  return v;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`BLOCKED: ${key} is REQUIRED`);
  return v.trim();
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function truncateForEmbedding(input: string, maxChars = 12000): string {
  const s = String(input ?? "");
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
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

type BookCorpusIndexFile = {
  version: 1;
  updated_at: string;
  books: Record<string, {
    title?: string;
    level?: string;
    book_version_id?: string;
    indexed_at: string;
    chapter_count: number;
    chunk_count: number;
  }>;
};

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

async function downloadJsonOrNull(
  supabase: any,
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
  supabase: any,
  bucket: string,
  path: string,
  data: unknown,
): Promise<void> {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
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
      // Extract text from basis, praktijk, verdieping fields
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

    // Recursively process nested content
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

async function findLatestBookVersion(
  supabase: any,
  bookId: string,
): Promise<{ bookVersionId: string; canonicalPath: string } | null> {
  // List directories under books/{bookId}/
  const { data: folders, error } = await supabase.storage.from("books").list(bookId, {
    limit: 100,
    sortBy: { column: "name", order: "desc" },
  });

  if (error || !folders || folders.length === 0) return null;

  // Find folders that have a canonical.json file
  for (const folder of folders) {
    if (!folder.name || folder.name.startsWith(".")) continue;
    
    const canonicalPath = `${bookId}/${folder.name}/canonical.json`;
    const { data } = await supabase.storage.from("books").download(canonicalPath);
    
    if (data) {
      return { bookVersionId: folder.name, canonicalPath };
    }
  }

  return null;
}

export class BookContentIndex implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { jobId } = context;
    const payload = (context.payload || {}) as Record<string, unknown>;

    const organizationId =
      optionalString(payload, "organization_id") ||
      optionalString(payload, "organizationId");
    if (!organizationId) throw new Error("BLOCKED: organization_id is REQUIRED");

    const bookId =
      optionalString(payload, "book_id") ||
      optionalString(payload, "bookId") ||
      requireString(payload, "book_id");

    let bookVersionId =
      optionalString(payload, "book_version_id") ||
      optionalString(payload, "bookVersionId");

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
    const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();

    await emitAgentJobEvent(jobId, "generating", 5, "Preparing book content indexing", {
      organizationId,
      bookId,
      bookVersionId: bookVersionId || "(auto-detect)",
      model: EMBEDDING_MODEL,
    });

    // Find canonical path
    let canonicalPath: string;
    if (bookVersionId) {
      canonicalPath = `${bookId}/${bookVersionId}/canonical.json`;
    } else {
      const found = await findLatestBookVersion(supabase, bookId);
      if (!found) {
        throw new Error(`BLOCKED: No canonical.json found for book_id=${bookId}`);
      }
      bookVersionId = found.bookVersionId;
      canonicalPath = found.canonicalPath;
    }

    await emitAgentJobEvent(jobId, "storage_read", 10, "Downloading canonical.json", {
      bookId,
      bookVersionId,
      canonicalPath,
    });

    // Download canonical JSON
    const canonical = await downloadJsonOrNull(supabase, "books", canonicalPath) as CanonicalBook | null;
    if (!canonical) {
      throw new Error(`BLOCKED: canonical.json could not be parsed at ${canonicalPath}`);
    }

    const bookTitle = canonical.meta?.title || bookId;
    const bookLevel = canonical.meta?.level;
    const chapters = Array.isArray(canonical.chapters) ? canonical.chapters : [];

    if (chapters.length === 0) {
      throw new Error(`BLOCKED: Book has no chapters (book_id=${bookId})`);
    }

    await emitAgentJobEvent(jobId, "generating", 15, "Extracting text from chapters", {
      bookId,
      bookTitle,
      chapterCount: chapters.length,
    });

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
      throw new Error(`BLOCKED: No extractable text found in book (book_id=${bookId})`);
    }

    // Combine all text and chunk
    const fullText = chapterTexts.map((c) => c.text).join(" ");
    const chunks = chunkText(fullText, 900, 1600, 200);

    if (chunks.length === 0) {
      throw new Error(`BLOCKED: Chunking produced 0 chunks for book_id=${bookId}`);
    }

    await emitAgentJobEvent(jobId, "enriching", 25, `Chunked ${chunks.length} segments`, {
      bookId,
      chapterCount: chapterTexts.length,
      chunkCount: chunks.length,
    });

    // Clear existing embeddings for this book
    const bookKey = `book:${bookId}`;
    await supabase
      .from("content_embeddings")
      .delete()
      .eq("organization_id", organizationId)
      .eq("course_id", bookKey)
      .eq("content_type", "reference");

    // Generate and store embeddings
    const BATCH_SIZE = 32;
    const maxChars = 12000;
    let embedded = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map((t) => truncateForEmbedding(t, maxChars));
      const vectors = await generateEmbeddings(batch, { apiKey: OPENAI_API_KEY, model: EMBEDDING_MODEL });

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

      const { error } = await supabase.from("content_embeddings").insert(rows);
      if (error) throw new Error(`Failed to store embeddings for book_id=${bookId}: ${error.message}`);

      embedded += rows.length;
      const progress = Math.min(90, 30 + Math.floor((embedded / chunks.length) * 60));
      await emitAgentJobEvent(jobId, "enriching", progress, `Embedded ${embedded}/${chunks.length} chunks`, {
        bookId,
        embedded,
        total: chunks.length,
      });
    }

    // Update book corpus index
    const indexPath = `${organizationId}/book-corpus/index.json`;
    const existingIndex = await downloadJsonOrNull(supabase, "materials", indexPath);
    const mergedIndex: BookCorpusIndexFile = {
      version: 1,
      updated_at: nowIso,
      books: {},
    };
    if (existingIndex && typeof existingIndex === "object" && typeof (existingIndex as any).books === "object") {
      mergedIndex.books = { ...(existingIndex as any).books };
    }

    mergedIndex.books[bookId] = {
      title: bookTitle,
      level: bookLevel,
      book_version_id: bookVersionId,
      indexed_at: nowIso,
      chapter_count: chapterTexts.length,
      chunk_count: chunks.length,
    };

    await emitAgentJobEvent(jobId, "storage_write", 95, "Saving book corpus index", {
      indexPath,
      bookCount: Object.keys(mergedIndex.books).length,
    });
    await uploadJson(supabase, "materials", indexPath, mergedIndex);

    await emitAgentJobEvent(jobId, "done", 100, "Book content indexed", {
      bookId,
      bookVersionId,
      bookTitle,
      chapterCount: chapterTexts.length,
      chunkCount: chunks.length,
      embedded,
    });

    return {
      ok: true,
      bookId,
      bookVersionId,
      bookTitle,
      chapterCount: chapterTexts.length,
      chunkCount: chunks.length,
      embedded,
      indexPath,
    };
  }
}
