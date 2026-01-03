// src/lib/books/bookSkeletonCore.js
//
// Browser-safe shared core for Book Skeleton (authoring) + deterministic compile to canonical JSON (rendering).
// - No Node/Deno imports (bundleable by Vite; importable by book-worker)
// - NO silent fallbacks: validation returns structured issues; callers decide whether to hard-fail.

/**
 * @typedef {'error'|'warning'} Severity
 *
 * @typedef {Object} SkeletonIssue
 * @property {Severity} severity
 * @property {string} code
 * @property {string} message
 * @property {string[]} path
 *
 * @typedef {Object} SkeletonMeta
 * @property {string} bookId
 * @property {string} bookVersionId
 * @property {string} title
 * @property {'n3'|'n4'} level
 * @property {string} [language]
 * @property {string} schemaVersion
 * @property {string} [promptPackId]
 * @property {number} [promptPackVersion]
 *
 * @typedef {Object} SkeletonImage
 * @property {string} src
 * @property {string|null|undefined} [alt]
 * @property {string|null|undefined} [caption]
 * @property {string|null|undefined} [figureNumber]
 * @property {string|null|undefined} [layoutHint]
 * @property {string|null|undefined} [suggestedPrompt]
 *
 * @typedef {Object} SkeletonParagraphBlock
 * @property {'paragraph'} type
 * @property {string} id
 * @property {string} basisHtml
 * @property {string|null|undefined} [praktijkHtml]
 * @property {string|null|undefined} [verdiepingHtml]
 * @property {SkeletonImage[]|null|undefined} [images]
 *
 * @typedef {Object} SkeletonListBlock
 * @property {'list'} type
 * @property {string} id
 * @property {boolean|null|undefined} [ordered]
 * @property {string[]} items
 * @property {SkeletonImage[]|null|undefined} [images]
 *
 * @typedef {Object} SkeletonStepsBlock
 * @property {'steps'} type
 * @property {string} id
 * @property {string[]} items
 * @property {SkeletonImage[]|null|undefined} [images]
 *
 * @typedef {Object} SkeletonSubparagraphBlock
 * @property {'subparagraph'} type
 * @property {string|null|undefined} [id]
 * @property {string} title
 * @property {SkeletonBlock[]} blocks
 *
 * @typedef {SkeletonParagraphBlock|SkeletonListBlock|SkeletonStepsBlock|SkeletonSubparagraphBlock} SkeletonBlock
 *
 * @typedef {Object} SkeletonSection
 * @property {string} id
 * @property {string} title
 * @property {SkeletonBlock[]} blocks
 *
 * @typedef {Object} SkeletonChapter
 * @property {string} id
 * @property {number} number
 * @property {string} title
 * @property {string|null|undefined} [openerImageSrc]
 * @property {SkeletonSection[]} sections
 *
 * @typedef {Object} BookSkeletonV1
 * @property {SkeletonMeta} meta
 * @property {Object|null|undefined} [styleProfile]
 * @property {SkeletonChapter[]} chapters
 */

/** @param {unknown} v */
function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** @param {unknown} v */
function asString(v) {
  return typeof v === "string" ? v : "";
}

/** @param {unknown} v */
function asNumber(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Detect disallowed <<...>> markers in book text.
 * BookGen Pro allows ONLY <<BOLD_START>> and <<BOLD_END>> in generated book text.
 */
function findDisallowedMarkers(raw) {
  const s = String(raw || "");
  const re = /<<\s*([A-Za-z0-9_:-]+)\s*>>/g;
  /** @type {string[]} */
  const bad = [];
  let m;
  while ((m = re.exec(s))) {
    const tag = String(m[1] || "").trim();
    if (!tag) continue;
    if (tag === "BOLD_START" || tag === "BOLD_END") continue;
    bad.push(tag);
  }
  return bad;
}

/**
 * Validate a Book Skeleton v1 shape. Returns issues; callers decide whether to treat warnings as fatal.
 * @param {unknown} raw
 * @returns {{ ok: true, skeleton: BookSkeletonV1, issues: SkeletonIssue[] } | { ok: false, issues: SkeletonIssue[] }}
 */
export function validateBookSkeleton(raw) {
  /** @type {SkeletonIssue[]} */
  const issues = [];
  const push = (severity, code, message, path) => {
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
    if (!schemaVersion) push("error", "missing_schemaVersion", "meta.schemaVersion is required", ["meta", "schemaVersion"]);
    if (schemaVersion && schemaVersion !== "skeleton_v1") {
      push("error", "invalid_schemaVersion", "meta.schemaVersion must be 'skeleton_v1'", ["meta", "schemaVersion"]);
    }
    if (meta.promptPackVersion !== undefined && typeof meta.promptPackVersion !== "number") {
      push("warning", "invalid_promptPackVersion", "meta.promptPackVersion must be a number", ["meta", "promptPackVersion"]);
    }
  }

  const chapters = raw.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    push("error", "missing_chapters", "Skeleton.chapters must be a non-empty array", ["chapters"]);
  }

  // Uniqueness checks
  const seenChapterIds = new Set();
  const seenSectionIds = new Set();
  const seenBlockIds = new Set();

  const validateImages = (imgs, pathBase) => {
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
      const src = asString(img.src).trim();
      if (!src) push("error", "missing_image_src", "image.src is required", pathBase.concat(["images", String(i), "src"]));
    }
  };

  const validateBlock = (b, pathBase) => {
    if (!isPlainObject(b)) {
      push("error", "invalid_block", "block must be an object", pathBase);
      return;
    }
    const t = asString(b.type).trim();
    if (!t) {
      push("error", "missing_block_type", "block.type is required", pathBase.concat(["type"]));
      return;
    }

    if (t === "paragraph") {
      const id = asString(b.id).trim();
      const basisHtml = asString(b.basisHtml);
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
      const praktijk = asString(b.praktijkHtml);
      const verdieping = asString(b.verdiepingHtml);
      for (const [k, v] of [["praktijkHtml", praktijk], ["verdiepingHtml", verdieping]]) {
        const bad = findDisallowedMarkers(v);
        if (bad.length) push("error", "disallowed_markers", `Disallowed markers in ${k}: ${bad.join(", ")}`, pathBase.concat([k]));
      }

      validateImages(b.images, pathBase);
      return;
    }

    if (t === "list" || t === "steps") {
      const id = asString(b.id).trim();
      if (!id) push("error", "missing_block_id", `${t}.id is required`, pathBase.concat(["id"]));
      if (id) {
        if (seenBlockIds.has(id)) push("error", "duplicate_block_id", `Duplicate block id: ${id}`, pathBase.concat(["id"]));
        seenBlockIds.add(id);
      }
      const items = Array.isArray(b.items) ? b.items : null;
      if (!items || items.length === 0) push("warning", "empty_items", `${t}.items is empty`, pathBase.concat(["items"]));
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (typeof items[i] !== "string" || !items[i].trim()) {
            push("warning", "empty_item", `${t}.items[${i}] is empty`, pathBase.concat(["items", String(i)]));
          }
          const bad = findDisallowedMarkers(items[i]);
          if (bad.length) push("error", "disallowed_markers", `Disallowed markers in ${t}.items[${i}]: ${bad.join(", ")}`, pathBase.concat(["items", String(i)]));
        }
      }
      validateImages(b.images, pathBase);
      return;
    }

    if (t === "subparagraph") {
      const title = asString(b.title).trim();
      if (!title) push("warning", "missing_subparagraph_title", "subparagraph.title is empty", pathBase.concat(["title"]));
      const blocks = b.blocks;
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
      const id = asString(ch.id).trim();
      const number = asNumber(ch.number);
      const title = asString(ch.title).trim();
      if (!id) push("error", "missing_chapter_id", "chapter.id is required", chPath.concat(["id"]));
      if (id) {
        if (seenChapterIds.has(id)) push("error", "duplicate_chapter_id", `Duplicate chapter id: ${id}`, chPath.concat(["id"]));
        seenChapterIds.add(id);
      }
      if (number === null || number <= 0) push("warning", "invalid_chapter_number", "chapter.number should be a positive number", chPath.concat(["number"]));
      if (!title) push("warning", "missing_chapter_title", "chapter.title is missing", chPath.concat(["title"]));

      const sections = ch.sections;
      if (!Array.isArray(sections) || sections.length === 0) {
        push("error", "missing_sections", "chapter.sections must be a non-empty array", chPath.concat(["sections"]));
        continue;
      }

      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        const sPath = chPath.concat(["sections", String(si)]);
        if (!isPlainObject(s)) {
          push("error", "invalid_section", "section must be an object", sPath);
          continue;
        }
        const sid = asString(s.id).trim();
        const st = asString(s.title).trim();
        if (!sid) push("error", "missing_section_id", "section.id is required", sPath.concat(["id"]));
        if (sid) {
          const key = `${id || ci}:${sid}`;
          if (seenSectionIds.has(key)) push("error", "duplicate_section_id", `Duplicate section id: ${sid}`, sPath.concat(["id"]));
          seenSectionIds.add(key);
        }
        if (!st) push("warning", "missing_section_title", "section.title is missing", sPath.concat(["title"]));

        const blocks = s.blocks;
        if (!Array.isArray(blocks) || blocks.length === 0) {
          push("error", "missing_blocks", "section.blocks must be a non-empty array", sPath.concat(["blocks"]));
          continue;
        }
        for (let bi = 0; bi < blocks.length; bi++) {
          validateBlock(blocks[bi], sPath.concat(["blocks", String(bi)]));
        }
      }
    }
  }

  const fatal = issues.some((i) => i.severity === "error");
  if (fatal) return { ok: false, issues };
  return { ok: true, skeleton: /** @type {any} */ (raw), issues };
}

/**
 * Compile a validated skeleton into the existing canonical JSON shape expected by bookRendererCore.
 * NOTE: deterministic mapping only; no AI or heuristic transforms here.
 * @param {BookSkeletonV1} sk
 * @returns {any} canonical
 */
export function compileSkeletonToCanonical(sk) {
  const meta = sk?.meta || {};
  const bookId = asString(meta.bookId).trim();
  const title = asString(meta.title).trim();
  const level = asString(meta.level).trim();
  const language = asString(meta.language).trim();

  const chaptersIn = Array.isArray(sk?.chapters) ? sk.chapters : [];

  const compileBlock = (b) => {
    const t = asString(b?.type).trim();
    if (t === "paragraph") {
      const out = {
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
          .filter((img) => isPlainObject(img) && asString(img.src).trim())
          .map((img) => ({
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
      const items = Array.isArray(b.items) ? b.items.filter((x) => typeof x === "string" && x.trim()) : [];
      const out = {
        type: t,
        id: asString(b.id).trim(),
        ...(t === "list" ? { ordered: b.ordered === true } : {}),
        items,
      };
      if (Array.isArray(b.images) && b.images.length) {
        out.images = b.images
          .filter((img) => isPlainObject(img) && asString(img.src).trim())
          .map((img) => ({
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

  const canonicalChapters = chaptersIn.map((ch) => {
    const sectionsIn = Array.isArray(ch?.sections) ? ch.sections : [];
    const sections = sectionsIn.map((s) => ({
      id: asString(s?.id).trim(),
      title: asString(s?.title || ""),
      content: Array.isArray(s?.blocks) ? s.blocks.map(compileBlock).filter(Boolean) : [],
    }));
    const out = {
      ...(asNumber(ch?.number) !== null ? { number: asNumber(ch?.number) } : {}),
      title: asString(ch?.title || ""),
      sections,
    };
    const opener = asString(ch?.openerImageSrc).trim();
    if (opener) out.openerImage = opener;
    return out;
  });

  const styleProfile = sk?.styleProfile && isPlainObject(sk.styleProfile) ? sk.styleProfile : null;

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
    ...(styleProfile ? { styleProfile } : {}),
    export: {
      source: "SKELETON_COMPILED",
      schemaVersion: "1.0",
    },
  };
}

/**
 * Deterministic conversion from existing canonical JSON into skeleton v1.
 * Used for bulk migration and for keeping skeleton in sync with compiled canonical artifacts.
 * @param {any} canonical
 * @param {{ bookId?: string, bookVersionId?: string, promptPackId?: string, promptPackVersion?: number }} [opts]
 * @returns {BookSkeletonV1}
 */
export function canonicalToSkeleton(canonical, opts = {}) {
  const meta = canonical?.meta || {};
  const bookId = asString(opts.bookId || meta.id || "").trim();
  const bookVersionId = asString(opts.bookVersionId || "").trim();
  const title = asString(meta.title || "").trim();
  const level = asString(meta.level || "").trim();
  const language = asString(meta.language || "").trim() || "nl";

  const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];

  const mapImages = (imgs) => {
    if (!Array.isArray(imgs)) return [];
    return imgs
      .filter((img) => isPlainObject(img) && asString(img.src).trim())
      .map((img) => ({
        src: asString(img.src).trim(),
        alt: typeof img.alt === "string" ? img.alt : null,
        caption: typeof img.caption === "string" ? img.caption : null,
        figureNumber: typeof img.figureNumber === "string" ? img.figureNumber : null,
      }));
  };

  const mapBlocks = (blocks) => {
    if (!Array.isArray(blocks)) return [];
    /** @type {SkeletonBlock[]} */
    const out = [];
    for (const b of blocks) {
      if (!isPlainObject(b)) continue;
      const t = asString(b.type).trim();
      if (t === "paragraph") {
        out.push({
          type: "paragraph",
          id: asString(b.id).trim(),
          basisHtml: asString(b.basis || ""),
          praktijkHtml: typeof b.praktijk === "string" ? b.praktijk : null,
          verdiepingHtml: typeof b.verdieping === "string" ? b.verdieping : null,
          images: mapImages(b.images),
        });
        continue;
      }
      if (t === "list") {
        out.push({
          type: "list",
          id: asString(b.id).trim(),
          ordered: b.ordered === true,
          items: Array.isArray(b.items) ? b.items.filter((x) => typeof x === "string") : [],
          images: mapImages(b.images),
        });
        continue;
      }
      if (t === "steps") {
        out.push({
          type: "steps",
          id: asString(b.id).trim(),
          items: Array.isArray(b.items) ? b.items.filter((x) => typeof x === "string") : [],
          images: mapImages(b.images),
        });
        continue;
      }
      if (t === "subparagraph") {
        out.push({
          type: "subparagraph",
          id: typeof b.id === "string" ? b.id : null,
          title: asString(b.title || ""),
          blocks: mapBlocks(b.content || b.blocks || b.items),
        });
        continue;
      }
      // Unknown block: drop (validator will catch if needed after conversion)
    }
    return out;
  };

  /** @type {SkeletonChapter[]} */
  const skChapters = chapters.map((ch, idx) => {
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    const skSections = sections.map((s, sIdx) => {
      const sid = asString(s?.id).trim() || `${idx + 1}.${sIdx + 1}`;
      const st = asString(s?.title || "");
      return {
        id: sid,
        title: st,
        blocks: mapBlocks(s?.content || s?.blocks || s?.items),
      };
    });
    const opener = asString(ch?.openerImage || ch?.opener_image || "").trim();
    return {
      id: asString(ch?.id).trim() || `ch-${idx + 1}`,
      number: idx + 1,
      title: asString(ch?.title || ""),
      ...(opener ? { openerImageSrc: opener } : {}),
      sections: skSections,
    };
  });

  return {
    meta: {
      bookId,
      bookVersionId,
      title,
      // Preserve invalid levels so validation can fail loudly during migration.
      level: level === "n3" || level === "n4" ? level : "",
      language,
      schemaVersion: "skeleton_v1",
      ...(typeof opts.promptPackId === "string" ? { promptPackId: opts.promptPackId } : {}),
      ...(typeof opts.promptPackVersion === "number" ? { promptPackVersion: opts.promptPackVersion } : {}),
    },
    styleProfile: canonical?.styleProfile && isPlainObject(canonical.styleProfile) ? canonical.styleProfile : undefined,
    chapters: skChapters,
  };
}


