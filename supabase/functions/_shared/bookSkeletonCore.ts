/**
 * Shared Book Skeleton core for Supabase Edge Functions (Deno).
 *
 * IMPORTANT:
 * - Keep this aligned with `src/lib/books/bookSkeletonCore.js`
 * - No Node/Deno imports (pure TS)
 * - No silent fallbacks: validation returns issues; callers decide how to treat warnings
 */

export type SkeletonSeverity = "error" | "warning";

export type SkeletonIssue = {
  severity: SkeletonSeverity;
  code: string;
  message: string;
  path: string[];
};

export type SkeletonMeta = {
  bookId: string;
  bookVersionId: string;
  title: string;
  level: "n3" | "n4";
  language: string;
  schemaVersion: "skeleton_v1";
  promptPackId?: string;
  promptPackVersion?: number;
};

export type SkeletonImage = {
  src: string;
  alt?: string | null;
  caption?: string | null;
  figureNumber?: string | null;
  layoutHint?: string | null;
  /**
   * Optional LLM suggestion used later for AI image generation or manual briefing.
   * This is authoring-only metadata and must NOT affect deterministic canonical compilation.
   */
  suggestedPrompt?: string | null;
};

export type SkeletonParagraphBlock = {
  type: "paragraph";
  id: string;
  basisHtml: string;
  praktijkHtml?: string | null;
  verdiepingHtml?: string | null;
  images?: SkeletonImage[] | null;
};

export type SkeletonListBlock = {
  type: "list";
  id: string;
  ordered?: boolean | null;
  items: string[];
  images?: SkeletonImage[] | null;
};

export type SkeletonStepsBlock = {
  type: "steps";
  id: string;
  items: string[];
  images?: SkeletonImage[] | null;
};

export type SkeletonSubparagraphBlock = {
  type: "subparagraph";
  id?: string | null;
  title: string;
  blocks: SkeletonBlock[];
};

export type SkeletonBlock =
  | SkeletonParagraphBlock
  | SkeletonListBlock
  | SkeletonStepsBlock
  | SkeletonSubparagraphBlock;

export type SkeletonSection = {
  id: string;
  title: string;
  blocks: SkeletonBlock[];
};

export type SkeletonChapterRecapObjective = {
  text: string;
  sectionId: string;
};

export type SkeletonChapterRecapGlossaryItem = {
  term: string;
  definition: string;
  sectionId: string;
};

export type SkeletonChapterRecapQuestion = {
  question: string;
  sectionId: string;
};

export type SkeletonChapterRecap = {
  objectives: SkeletonChapterRecapObjective[];
  glossary: SkeletonChapterRecapGlossaryItem[];
  selfCheckQuestions: SkeletonChapterRecapQuestion[];
};

export type SkeletonChapter = {
  id: string;
  number: number;
  title: string;
  openerImageSrc?: string | null;
  recap?: SkeletonChapterRecap | null;
  sections: SkeletonSection[];
};

export type BookSkeletonV1 = {
  meta: SkeletonMeta;
  styleProfile?: Record<string, unknown> | null;
  chapters: SkeletonChapter[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Detect disallowed <<...>> markers in book text.
 * BookGen Pro allows ONLY <<BOLD_START>> and <<BOLD_END>> in generated book text.
 */
function findDisallowedMarkers(raw: unknown): string[] {
  const s = String(raw || "");
  const re = /<<\s*([A-Za-z0-9_:-]+)\s*>>/g;
  const bad: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const tag = String(m[1] || "").trim();
    if (!tag) continue;
    if (tag === "BOLD_START" || tag === "BOLD_END") continue;
    bad.push(tag);
  }
  return bad;
}

export function validateBookSkeleton(
  raw: unknown,
): { ok: true; skeleton: BookSkeletonV1; issues: SkeletonIssue[] } | { ok: false; issues: SkeletonIssue[] } {
  const issues: SkeletonIssue[] = [];
  const push = (severity: SkeletonSeverity, code: string, message: string, path: string[]) => {
    issues.push({ severity, code, message, path: Array.isArray(path) ? path : [] });
  };

  if (!isPlainObject(raw)) {
    push("error", "invalid_type", "Skeleton must be a JSON object", []);
    return { ok: false, issues };
  }

  const meta = raw.meta;
  if (!isPlainObject(meta)) {
    push("error", "missing_meta", "Skeleton.meta is required", ["meta"]);
  } else {
    const bookId = asString(meta.bookId).trim();
    const bookVersionId = asString(meta.bookVersionId).trim();
    const title = asString(meta.title).trim();
    const level = asString(meta.level).trim();
    const language = asString(meta.language).trim();
    const schemaVersion = asString(meta.schemaVersion).trim();

    if (!bookId) push("error", "missing_bookId", "meta.bookId is required", ["meta", "bookId"]);
    if (!bookVersionId) push("error", "missing_bookVersionId", "meta.bookVersionId is required", ["meta", "bookVersionId"]);
    if (!title) push("warning", "missing_title", "meta.title is missing", ["meta", "title"]);
    if (level !== "n3" && level !== "n4") {
      push("error", "invalid_level", "meta.level must be 'n3' or 'n4'", ["meta", "level"]);
    }
    if (!language) push("error", "missing_language", "meta.language is required", ["meta", "language"]);
    if (schemaVersion !== "skeleton_v1") {
      push("error", "invalid_schemaVersion", "meta.schemaVersion must be 'skeleton_v1'", ["meta", "schemaVersion"]);
    }
    if (typeof (meta as any).promptPackVersion !== "undefined" && typeof (meta as any).promptPackVersion !== "number") {
      push("warning", "invalid_promptPackVersion", "meta.promptPackVersion must be a number", ["meta", "promptPackVersion"]);
    }
  }

  const chapters = raw.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    push("error", "missing_chapters", "Skeleton.chapters must be a non-empty array", ["chapters"]);
  }

  // Uniqueness checks
  const seenChapterIds = new Set<string>();
  const seenSectionIds = new Set<string>();
  const seenBlockIds = new Set<string>();

  const validateImages = (imgs: unknown, pathBase: string[]) => {
    if (imgs == null) return;
    if (!Array.isArray(imgs)) {
      push("error", "invalid_images", "images must be an array", pathBase.concat(["images"]));
      return;
    }
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (!isPlainObject(img)) {
        push("error", "invalid_image", "image must be an object", pathBase.concat(["images", String(i)]));
        continue;
      }
      const src = asString((img as any).src).trim();
      if (!src) push("error", "missing_image_src", "image.src is required", pathBase.concat(["images", String(i), "src"]));
    }
  };

  const validateBlock = (b: unknown, pathBase: string[]) => {
    if (!isPlainObject(b)) {
      push("error", "invalid_block", "block must be an object", pathBase);
      return;
    }
    const t = asString((b as any).type).trim();
    if (!t) {
      push("error", "missing_block_type", "block.type is required", pathBase.concat(["type"]));
      return;
    }

    if (t === "paragraph") {
      const id = asString((b as any).id).trim();
      const basisHtml = asString((b as any).basisHtml);
      if (!id) push("error", "missing_paragraph_id", "paragraph.id is required", pathBase.concat(["id"]));
      if (id) {
        if (seenBlockIds.has(id)) push("error", "duplicate_block_id", `Duplicate block id: ${id}`, pathBase.concat(["id"]));
        seenBlockIds.add(id);
      }
      if (!String(basisHtml || "").trim()) push("warning", "empty_paragraph", "paragraph.basisHtml is empty", pathBase.concat(["basisHtml"]));

      const badMarkers = findDisallowedMarkers(basisHtml);
      if (badMarkers.length) {
        push("error", "disallowed_markers", `Disallowed markers in paragraph: ${badMarkers.join(", ")}`, pathBase.concat(["basisHtml"]));
      }
      const praktijk = asString((b as any).praktijkHtml);
      const verdieping = asString((b as any).verdiepingHtml);
      for (const [k, v] of [
        ["praktijkHtml", praktijk],
        ["verdiepingHtml", verdieping],
      ] as const) {
        const bad = findDisallowedMarkers(v);
        if (bad.length) push("error", "disallowed_markers", `Disallowed markers in ${k}: ${bad.join(", ")}`, pathBase.concat([k]));
      }

      validateImages((b as any).images, pathBase);
      return;
    }

    if (t === "list" || t === "steps") {
      const id = asString((b as any).id).trim();
      if (!id) push("error", "missing_block_id", `${t}.id is required`, pathBase.concat(["id"]));
      if (id) {
        if (seenBlockIds.has(id)) push("error", "duplicate_block_id", `Duplicate block id: ${id}`, pathBase.concat(["id"]));
        seenBlockIds.add(id);
      }
      const items = Array.isArray((b as any).items) ? ((b as any).items as unknown[]) : null;
      if (!items || items.length === 0) push("warning", "empty_items", `${t}.items is empty`, pathBase.concat(["items"]));
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (typeof items[i] !== "string" || !String(items[i]).trim()) {
            push("warning", "empty_item", `${t}.items[${i}] is empty`, pathBase.concat(["items", String(i)]));
          }
          const bad = findDisallowedMarkers(items[i]);
          if (bad.length) {
            push("error", "disallowed_markers", `Disallowed markers in ${t}.items[${i}]: ${bad.join(", ")}`, pathBase.concat(["items", String(i)]));
          }
        }
      }
      validateImages((b as any).images, pathBase);
      return;
    }

    if (t === "subparagraph") {
      const title = asString((b as any).title).trim();
      if (!title) push("warning", "missing_subparagraph_title", "subparagraph.title is empty", pathBase.concat(["title"]));
      const blocks = (b as any).blocks;
      if (!Array.isArray(blocks)) {
        push("error", "invalid_subparagraph_blocks", "subparagraph.blocks must be an array", pathBase.concat(["blocks"]));
        return;
      }
      for (let i = 0; i < blocks.length; i++) {
        validateBlock(blocks[i], pathBase.concat(["blocks", String(i)]));
      }
      return;
    }

    push("error", "unknown_block_type", `Unknown block.type: ${t}`, pathBase.concat(["type"]));
  };

  if (Array.isArray(chapters)) {
    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      const chPath = ["chapters", String(ci)];
      if (!isPlainObject(ch)) {
        push("error", "invalid_chapter", "chapter must be an object", chPath);
        continue;
      }
      const id = asString((ch as any).id).trim();
      const number = asNumber((ch as any).number);
      const title = asString((ch as any).title).trim();
      if (!id) push("error", "missing_chapter_id", "chapter.id is required", chPath.concat(["id"]));
      if (id) {
        if (seenChapterIds.has(id)) push("error", "duplicate_chapter_id", `Duplicate chapter id: ${id}`, chPath.concat(["id"]));
        seenChapterIds.add(id);
      }
      if (number === null || number <= 0) push("warning", "invalid_chapter_number", "chapter.number should be a positive number", chPath.concat(["number"]));
      if (!title) push("warning", "missing_chapter_title", "chapter.title is missing", chPath.concat(["title"]));

      const sections = (ch as any).sections;
      if (!Array.isArray(sections) || sections.length === 0) {
        push("error", "missing_sections", "chapter.sections must be a non-empty array", chPath.concat(["sections"]));
        continue;
      }

      const allowedSectionIds = new Set<string>();
      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        const sPath = chPath.concat(["sections", String(si)]);
        if (!isPlainObject(s)) {
          push("error", "invalid_section", "section must be an object", sPath);
          continue;
        }
        const sid = asString((s as any).id).trim();
        const st = asString((s as any).title).trim();
        if (!sid) push("error", "missing_section_id", "section.id is required", sPath.concat(["id"]));
        if (sid) {
          allowedSectionIds.add(sid);
          const key = `${id || ci}:${sid}`;
          if (seenSectionIds.has(key)) push("error", "duplicate_section_id", `Duplicate section id: ${sid}`, sPath.concat(["id"]));
          seenSectionIds.add(key);
        }
        if (!st) push("warning", "missing_section_title", "section.title is missing", sPath.concat(["title"]));

        const blocks = (s as any).blocks;
        if (!Array.isArray(blocks) || blocks.length === 0) {
          push("error", "missing_blocks", "section.blocks must be a non-empty array", sPath.concat(["blocks"]));
          continue;
        }
        for (let bi = 0; bi < blocks.length; bi++) {
          validateBlock(blocks[bi], sPath.concat(["blocks", String(bi)]));
        }
      }

      // Optional: chapter recap authored by an LLM pass (objectives/glossary/self-check).
      const recapRaw = (ch as any).recap;
      if (typeof recapRaw !== "undefined" && recapRaw !== null) {
        if (!isPlainObject(recapRaw)) {
          push("error", "invalid_chapter_recap", "chapter.recap must be an object when present", chPath.concat(["recap"]));
        } else {
          const validateItems = (
            key: string,
            itemsRaw: unknown,
            itemValidator: (item: unknown, itemPath: string[]) => void,
          ) => {
            const base = chPath.concat(["recap", key]);
            if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
              push("error", "invalid_chapter_recap", `chapter.recap.${key} must be a non-empty array`, base);
              return;
            }
            for (let i = 0; i < itemsRaw.length; i++) {
              itemValidator(itemsRaw[i], base.concat([String(i)]));
            }
          };

          const requireSectionId = (item: any, itemPath: string[]) => {
            const sid = asString(item?.sectionId).trim();
            if (!sid) {
              push("error", "invalid_chapter_recap", "recap item sectionId is required", itemPath.concat(["sectionId"]));
              return "";
            }
            if (!allowedSectionIds.has(sid)) {
              push(
                "error",
                "invalid_chapter_recap",
                `recap item sectionId '${sid}' does not match any section.id in this chapter`,
                itemPath.concat(["sectionId"]),
              );
            }
            return sid;
          };

          validateItems("objectives", (recapRaw as any).objectives, (item, itemPath) => {
            if (!isPlainObject(item)) {
              push("error", "invalid_chapter_recap", "objective must be an object", itemPath);
              return;
            }
            const text = asString((item as any).text).trim();
            if (!text) push("error", "invalid_chapter_recap", "objective.text is required", itemPath.concat(["text"]));
            requireSectionId(item as any, itemPath);
          });

          validateItems("glossary", (recapRaw as any).glossary, (item, itemPath) => {
            if (!isPlainObject(item)) {
              push("error", "invalid_chapter_recap", "glossary item must be an object", itemPath);
              return;
            }
            const term = asString((item as any).term).trim();
            const def = asString((item as any).definition).trim();
            if (!term) push("error", "invalid_chapter_recap", "glossary.term is required", itemPath.concat(["term"]));
            if (!def) push("error", "invalid_chapter_recap", "glossary.definition is required", itemPath.concat(["definition"]));
            requireSectionId(item as any, itemPath);
          });

          validateItems("selfCheckQuestions", (recapRaw as any).selfCheckQuestions, (item, itemPath) => {
            if (!isPlainObject(item)) {
              push("error", "invalid_chapter_recap", "selfCheckQuestion must be an object", itemPath);
              return;
            }
            const q = asString((item as any).question).trim();
            if (!q) push("error", "invalid_chapter_recap", "selfCheckQuestions[].question is required", itemPath.concat(["question"]));
            requireSectionId(item as any, itemPath);
          });
        }
      }
    }
  }

  const fatal = issues.some((i) => i.severity === "error");
  if (fatal) return { ok: false, issues };
  return { ok: true, skeleton: raw as unknown as BookSkeletonV1, issues };
}

export function compileSkeletonToCanonical(sk: BookSkeletonV1): unknown {
  const meta = isPlainObject(sk?.meta) ? (sk.meta as any) : {};
  const bookId = asString(meta.bookId).trim();
  const title = asString(meta.title).trim();
  const level = asString(meta.level).trim();
  const language = asString(meta.language).trim();

  const chaptersIn = Array.isArray((sk as any)?.chapters) ? ((sk as any).chapters as unknown[]) : [];

  const compileBlock = (b: any): any => {
    const t = asString(b?.type).trim();
    if (t === "paragraph") {
      const out: any = {
        type: "paragraph",
        id: asString(b.id).trim(),
        basis: asString(b.basisHtml || ""),
      };
      const praktijk = asString(b.praktijkHtml || "").trim();
      const verdieping = asString(b.verdiepingHtml || "").trim();
      if (praktijk) out.praktijk = praktijk;
      if (verdieping) out.verdieping = verdieping;
      if (Array.isArray(b.images) && b.images.length) {
        out.images = b.images
          .filter((img: any) => isPlainObject(img) && asString(img.src).trim())
          .map((img: any) => ({
            src: asString(img.src).trim(),
            ...(typeof img.alt === "string" ? { alt: img.alt } : {}),
            ...(typeof img.caption === "string" ? { caption: img.caption } : {}),
            ...(typeof img.figureNumber === "string" ? { figureNumber: img.figureNumber } : {}),
            ...(typeof img.layoutHint === "string" ? { layoutHint: img.layoutHint } : {}),
          }));
      }
      return out;
    }
    if (t === "list" || t === "steps") {
      const items = Array.isArray(b.items) ? b.items.filter((x: any) => typeof x === "string" && x.trim()) : [];
      const out: any = {
        type: t,
        id: asString(b.id).trim(),
        ...(t === "list" ? { ordered: b.ordered === true } : {}),
        items,
      };
      if (Array.isArray(b.images) && b.images.length) {
        out.images = b.images
          .filter((img: any) => isPlainObject(img) && asString(img.src).trim())
          .map((img: any) => ({
            src: asString(img.src).trim(),
            ...(typeof img.alt === "string" ? { alt: img.alt } : {}),
            ...(typeof img.caption === "string" ? { caption: img.caption } : {}),
            ...(typeof img.figureNumber === "string" ? { figureNumber: img.figureNumber } : {}),
            ...(typeof img.layoutHint === "string" ? { layoutHint: img.layoutHint } : {}),
          }));
      }
      return out;
    }
    if (t === "subparagraph") {
      return {
        type: "subparagraph",
        ...(asString(b.id).trim() ? { id: asString(b.id).trim() } : {}),
        title: asString(b.title || ""),
        content: Array.isArray(b.blocks) ? b.blocks.map(compileBlock).filter(Boolean) : [],
      };
    }
    return null;
  };

  const canonicalChapters = chaptersIn.map((ch: any) => {
    const sectionsIn = Array.isArray(ch?.sections) ? ch.sections : [];
    const sections = sectionsIn.map((s: any) => ({
      id: asString(s?.id).trim(),
      title: asString(s?.title || ""),
      content: Array.isArray(s?.blocks) ? s.blocks.map(compileBlock).filter(Boolean) : [],
    }));
    const out: any = {
      ...(asNumber(ch?.number) !== null ? { number: asNumber(ch?.number) } : {}),
      title: asString(ch?.title || ""),
      sections,
    };
    const opener = asString(ch?.openerImageSrc).trim();
    if (opener) out.openerImage = opener;

    const recap = (ch as any)?.recap;
    if (recap && isPlainObject(recap)) {
      // Pass-through (validated on skeleton). Renderers can use this directly.
      out.recap = recap;
    }
    return out;
  });

  const styleProfile = (sk as any)?.styleProfile;
  const styleProfileOut = styleProfile && isPlainObject(styleProfile) ? styleProfile : null;

  // Deterministic canonical output: NO timestamps, NO random ids
  return {
    meta: {
      id: bookId,
      title,
      level,
      language,
      schemaVersion: "1.0",
      source: "SKELETON_COMPILED",
    },
    chapters: canonicalChapters,
    ...(styleProfileOut ? { styleProfile: styleProfileOut } : {}),
    export: {
      source: "SKELETON_COMPILED",
      schemaVersion: "1.0",
    },
  };
}


