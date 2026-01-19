import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

type ImageBlock = Record<string, any>;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function requireId(name: string, raw: unknown): string {
  const v = String(raw || "").trim();
  if (!v) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v;
}

function stripNumberPrefix(raw: string): string {
  let t = String(raw || "").trim();
  if (!t) return t;
  t = t.replace(/^\.\d+\s+/, "");
  t = t.replace(/^\d+\.\d+\s+/, "");
  t = t.replace(/^\d+\s+/, "");
  return t.trim();
}

function isAutoFiguresBlock(block: any): boolean {
  if (!block || typeof block !== "object") return false;
  const id = typeof block.id === "string" ? block.id : "";
  const role = typeof block.role === "string" ? block.role : "";
  return id.startsWith("auto-figures-ch") || role === "auto_figures";
}

function collectAndRemoveAutoFigures(blocks: any[]): { blocks: any[]; images: ImageBlock[] } {
  const kept: any[] = [];
  const images: ImageBlock[] = [];

  for (const block of blocks) {
    if (isAutoFiguresBlock(block)) {
      if (Array.isArray(block.images)) images.push(...block.images);
      continue;
    }

    if (block && typeof block === "object" && block.type === "subparagraph") {
      if (Array.isArray(block.blocks)) {
        const child = collectAndRemoveAutoFigures(block.blocks);
        block.blocks = child.blocks;
        images.push(...child.images);
      } else if (Array.isArray(block.content)) {
        const child = collectAndRemoveAutoFigures(block.content);
        block.content = child.blocks;
        images.push(...child.images);
      }
    }

    kept.push(block);
  }

  return { blocks: kept, images };
}

type InsertionPoint = { blocks: any[]; index: number };

function collectInsertionPoints(blocks: any[], points: InsertionPoint[]): void {
  if (!Array.isArray(blocks)) return;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block || typeof block !== "object") continue;
    if (block.type === "paragraph" || block.type === "list" || block.type === "steps") {
      points.push({ blocks, index: i });
    }
    if (block.type === "subparagraph") {
      if (Array.isArray(block.blocks)) collectInsertionPoints(block.blocks, points);
      else if (Array.isArray(block.content)) collectInsertionPoints(block.content, points);
    }
  }
}

function distributeImagesAcrossChapter(chapter: any, images: ImageBlock[]): { inserted: number; points: number } {
  if (!images.length) return { inserted: 0, points: 0 };

  const points: InsertionPoint[] = [];
  const sections = Array.isArray(chapter.sections) ? chapter.sections : [];
  for (const section of sections) {
    const blocks = section?.blocks || section?.content || section?.items;
    if (Array.isArray(blocks)) collectInsertionPoints(blocks, points);
  }

  if (!points.length) {
    // Fallback: append all images to the last section.
    const lastSection = sections[sections.length - 1];
    if (!lastSection) return { inserted: 0, points: 0 };
    if (!Array.isArray(lastSection.blocks)) lastSection.blocks = [];
    images.forEach((img, idx) => {
      lastSection.blocks.push({
        type: "paragraph",
        id: `auto-figure-ch${chapter.number}-${idx + 1}`,
        basisHtml: "",
        images: [img],
      });
    });
    return { inserted: images.length, points: 0 };
  }

  const insertions: Array<{ blocks: any[]; index: number; block: any }> = [];
  for (let i = 0; i < images.length; i += 1) {
    const pointIndex = Math.min(points.length - 1, Math.floor(((i + 1) * points.length) / (images.length + 1)));
    const point = points[pointIndex];
    insertions.push({
      blocks: point.blocks,
      index: point.index,
      block: {
        type: "paragraph",
        id: `auto-figure-ch${chapter.number}-${i + 1}`,
        basisHtml: "",
        images: [images[i]],
      },
    });
  }

  const byBlocks = new Map<any[], Array<{ index: number; block: any }>>();
  for (const ins of insertions) {
    const list = byBlocks.get(ins.blocks) || [];
    list.push({ index: ins.index, block: ins.block });
    byBlocks.set(ins.blocks, list);
  }

  for (const [blocks, list] of byBlocks.entries()) {
    list.sort((a, b) => b.index - a.index);
    for (const item of list) {
      blocks.splice(item.index + 1, 0, item.block);
    }
  }

  return { inserted: images.length, points: points.length };
}

async function main() {
  const bookId = requireId("bookId", process.argv[2]);
  const bookVersionId = requireId("bookVersionId", process.argv[3]);

  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");
  if (!SUPABASE_URL) {
    console.error("BLOCKED: SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
  const { data: blob, error: dlErr } = await supabase.storage.from("books").download(skeletonPath);
  if (dlErr || !blob) throw new Error(dlErr?.message || `BLOCKED: failed to download ${skeletonPath}`);
  const skeleton = JSON.parse(await blob.text());

  const chapterStats: Array<{ chapter: number; titleBefore: string; titleAfter: string; images: number; points: number }> = [];

  if (Array.isArray(skeleton.chapters)) {
    for (const chapter of skeleton.chapters) {
      const chNum = typeof chapter?.number === "number" ? chapter.number : 0;

      const firstSectionTitle = chapter?.sections?.[0]?.title ? String(chapter.sections[0].title) : "";
      const nextTitle = stripNumberPrefix(firstSectionTitle || chapter.title || "");
      const beforeTitle = String(chapter.title || "");
      if (nextTitle && nextTitle !== beforeTitle) {
        chapter.title = nextTitle;
      }

      let images: ImageBlock[] = [];
      const sections = Array.isArray(chapter.sections) ? chapter.sections : [];
      for (const section of sections) {
        const blocks = Array.isArray(section.blocks)
          ? section.blocks
          : Array.isArray(section.content)
            ? section.content
            : null;
        if (!blocks) continue;
        const extracted = collectAndRemoveAutoFigures(blocks);
        section.blocks = extracted.blocks;
        images = images.concat(extracted.images);
      }

      const { inserted, points } = distributeImagesAcrossChapter(chapter, images);
      chapterStats.push({
        chapter: chNum,
        titleBefore: beforeTitle,
        titleAfter: String(chapter.title || ""),
        images: inserted,
        points,
      });
    }
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-version-save-skeleton`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": ORG_ID,
    },
    body: JSON.stringify({
      bookId,
      bookVersionId,
      skeleton,
      note: "Fix chapter titles (.1 -> actual names) + distribute auto-figures across chapters",
      compileCanonical: true,
    }),
  });

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok || json?.ok === false) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  console.log(JSON.stringify({ ok: true, chapters: chapterStats }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ fix-chapter-titles-and-distribute-images failed: ${msg}`);
  process.exit(1);
});
