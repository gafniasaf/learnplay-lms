// src/lib/books/bookMatterCore.js
//
// Shared, browser-safe core for Book “matter pages” (title/colophon/TOC/index/glossary)
// that are rendered as standalone HTML and then rasterized to PNG for insertion into the final PDF.
//
// - No Node/Deno imports (bundleable by Vite; importable by book-worker)
// - NO silent fallbacks: validation returns structured issues; callers decide whether to hard-fail.

/**
 * @typedef {'error'|'warning'} MatterSeverity
 *
 * @typedef {Object} MatterIssue
 * @property {MatterSeverity} severity
 * @property {string} code
 * @property {string} message
 * @property {string[]} path
 *
 * @typedef {Object} MatterThemeColors
 * @property {string} hboDonkerblauw
 * @property {string} vpGroen
 * @property {string} vpGroenLight
 * @property {string} textBlack
 * @property {string} textGray
 * @property {string} textLightGray
 * @property {string} bgWhite
 * @property {string} bgOffWhite
 * @property {string} accentBlue
 *
 * @typedef {Object} MatterTheme
 * @property {number} pageWidthMm
 * @property {number} pageHeightMm
 * @property {MatterThemeColors} colors
 *
 * @typedef {Object} MatterTitlePage
 * @property {string} titleHtml            // e.g. "Anatomie en<br/>fysiologie<br/><em>voor het mbo</em>"
 * @property {string[]} authors            // lines
 * @property {string} logoText             // e.g. "ExpertCollege"
 *
 * @typedef {Object} MatterColophon
 * @property {string} isbn
 * @property {string} nur
 * @property {string} trefwoorden
 * @property {string[]} blocks             // short lines/paragraphs (rendered as separate blocks)
 * @property {string} legalText
 *
 * @typedef {Object} MatterToc
 * @property {string} title                // e.g. "Inhoudsopgave"
 * @property {Array<{ label: string, page: string }>} [preamble] // e.g. Introductie xv
 *
 * @typedef {Object} MatterPromo
 * @property {boolean} enabled
 * @property {string} title                // e.g. "MBOLEREN.NL"
 * @property {string[]} paragraphs
 * @property {Array<{ title: string, paragraphs: string[] }>} [sections]
 * @property {string[]} [bullets]
 * @property {string} [ctaLabel]
 *
 * @typedef {Object} MatterIndex
 * @property {string} title                // "Index" or "Register"
 *
 * @typedef {Object} MatterGlossary
 * @property {string} title                // e.g. "Begrippen"
 * @property {string} footerLabel          // e.g. "BEGRIPPEN"
 *
 * @typedef {Object} MatterPackV1
 * @property {'matter_pack_v1'} schemaVersion
 * @property {string} bookId
 * @property {string} bookVersionId
 * @property {string} language
 * @property {MatterTheme} theme
 * @property {MatterTitlePage} titlePage
 * @property {MatterColophon} colophon
 * @property {MatterToc} toc
 * @property {MatterPromo} promo
 * @property {MatterIndex} index
 * @property {MatterGlossary} glossary
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

function isLikelyHexColor(raw) {
  const s = asString(raw).trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s);
}

/**
 * Validate MatterPack v1 shape.
 * @param {unknown} raw
 * @returns {{ ok: true, pack: MatterPackV1, issues: MatterIssue[] } | { ok: false, issues: MatterIssue[] }}
 */
export function validateMatterPack(raw) {
  /** @type {MatterIssue[]} */
  const issues = [];
  const push = (severity, code, message, path) => {
    issues.push({ severity, code, message, path: Array.isArray(path) ? path : [] });
  };

  if (!isPlainObject(raw)) {
    push("error", "invalid_type", "Matter pack must be a JSON object", []);
    return { ok: false, issues };
  }

  const schemaVersion = asString(raw.schemaVersion).trim();
  if (schemaVersion !== "matter_pack_v1") {
    push("error", "invalid_schemaVersion", "schemaVersion must be 'matter_pack_v1'", ["schemaVersion"]);
  }

  const bookId = asString(raw.bookId).trim();
  const bookVersionId = asString(raw.bookVersionId).trim();
  const language = asString(raw.language).trim();
  if (!bookId) push("error", "missing_bookId", "bookId is required", ["bookId"]);
  if (!bookVersionId) push("error", "missing_bookVersionId", "bookVersionId is required", ["bookVersionId"]);
  if (!language) push("error", "missing_language", "language is required", ["language"]);

  const theme = raw.theme;
  if (!isPlainObject(theme)) {
    push("error", "missing_theme", "theme is required", ["theme"]);
  } else {
    const pageWidthMm = asNumber(theme.pageWidthMm);
    const pageHeightMm = asNumber(theme.pageHeightMm);
    if (pageWidthMm === null || pageWidthMm <= 0) push("error", "invalid_pageWidthMm", "theme.pageWidthMm must be a positive number", ["theme", "pageWidthMm"]);
    if (pageHeightMm === null || pageHeightMm <= 0) push("error", "invalid_pageHeightMm", "theme.pageHeightMm must be a positive number", ["theme", "pageHeightMm"]);

    const colors = theme.colors;
    if (!isPlainObject(colors)) {
      push("error", "missing_colors", "theme.colors is required", ["theme", "colors"]);
    } else {
      const requiredColors = [
        "hboDonkerblauw",
        "vpGroen",
        "vpGroenLight",
        "textBlack",
        "textGray",
        "textLightGray",
        "bgWhite",
        "bgOffWhite",
        "accentBlue",
      ];
      for (const k of requiredColors) {
        const v = (colors)[k];
        const s = asString(v).trim();
        if (!s) {
          push("error", "missing_color", `theme.colors.${k} is required`, ["theme", "colors", k]);
          continue;
        }
        if (!isLikelyHexColor(s)) {
          push("warning", "invalid_color", `theme.colors.${k} should be a hex color like #1e3a5f`, ["theme", "colors", k]);
        }
      }
    }
  }

  const titlePage = raw.titlePage;
  if (!isPlainObject(titlePage)) {
    push("error", "missing_titlePage", "titlePage is required", ["titlePage"]);
  } else {
    const titleHtml = asString(titlePage.titleHtml).trim();
    if (!titleHtml) push("error", "missing_titleHtml", "titlePage.titleHtml is required", ["titlePage", "titleHtml"]);
    const authors = titlePage.authors;
    if (!Array.isArray(authors) || authors.length === 0) {
      push("error", "missing_authors", "titlePage.authors must be a non-empty array", ["titlePage", "authors"]);
    } else {
      for (let i = 0; i < authors.length; i++) {
        if (typeof authors[i] !== "string" || !authors[i].trim()) {
          push("error", "invalid_author", `titlePage.authors[${i}] is empty`, ["titlePage", "authors", String(i)]);
        }
      }
    }
    const logoText = asString(titlePage.logoText).trim();
    if (!logoText) push("error", "missing_logoText", "titlePage.logoText is required", ["titlePage", "logoText"]);
  }

  const colophon = raw.colophon;
  if (!isPlainObject(colophon)) {
    push("error", "missing_colophon", "colophon is required", ["colophon"]);
  } else {
    const isbn = asString(colophon.isbn).trim();
    if (!isbn) push("error", "missing_isbn", "colophon.isbn is required", ["colophon", "isbn"]);
    const nur = asString(colophon.nur).trim();
    if (!nur) push("error", "missing_nur", "colophon.nur is required", ["colophon", "nur"]);
    const trefwoorden = asString(colophon.trefwoorden).trim();
    if (!trefwoorden) push("error", "missing_trefwoorden", "colophon.trefwoorden is required", ["colophon", "trefwoorden"]);
    const blocks = colophon.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      push("error", "missing_blocks", "colophon.blocks must be a non-empty array", ["colophon", "blocks"]);
    }
    const legalText = asString(colophon.legalText).trim();
    if (!legalText) push("error", "missing_legalText", "colophon.legalText is required", ["colophon", "legalText"]);
  }

  const toc = raw.toc;
  if (!isPlainObject(toc)) {
    push("error", "missing_toc", "toc is required", ["toc"]);
  } else {
    const title = asString(toc.title).trim();
    if (!title) push("error", "missing_toc_title", "toc.title is required", ["toc", "title"]);
    const preamble = toc.preamble;
    if (preamble !== undefined) {
      if (!Array.isArray(preamble)) {
        push("error", "invalid_toc_preamble", "toc.preamble must be an array", ["toc", "preamble"]);
      } else {
        for (let i = 0; i < preamble.length; i++) {
          const it = preamble[i];
          if (!isPlainObject(it)) {
            push("error", "invalid_toc_preamble_item", `toc.preamble[${i}] must be an object`, ["toc", "preamble", String(i)]);
            continue;
          }
          if (!asString(it.label).trim()) push("error", "missing_toc_preamble_label", `toc.preamble[${i}].label is required`, ["toc", "preamble", String(i), "label"]);
          if (!asString(it.page).trim()) push("error", "missing_toc_preamble_page", `toc.preamble[${i}].page is required`, ["toc", "preamble", String(i), "page"]);
        }
      }
    }
  }

  const promo = raw.promo;
  if (!isPlainObject(promo)) {
    push("error", "missing_promo", "promo is required", ["promo"]);
  } else {
    if (promo.enabled !== true && promo.enabled !== false) {
      push("error", "invalid_promo_enabled", "promo.enabled must be boolean", ["promo", "enabled"]);
    }
    const title = asString(promo.title).trim();
    if (!title) push("error", "missing_promo_title", "promo.title is required", ["promo", "title"]);
    const paragraphs = promo.paragraphs;
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      push("error", "missing_promo_paragraphs", "promo.paragraphs must be a non-empty array", ["promo", "paragraphs"]);
    }
  }

  const index = raw.index;
  if (!isPlainObject(index)) {
    push("error", "missing_index", "index is required", ["index"]);
  } else {
    const title = asString(index.title).trim();
    if (!title) push("error", "missing_index_title", "index.title is required", ["index", "title"]);
  }

  const glossary = raw.glossary;
  if (!isPlainObject(glossary)) {
    push("error", "missing_glossary", "glossary is required", ["glossary"]);
  } else {
    const title = asString(glossary.title).trim();
    const footerLabel = asString(glossary.footerLabel).trim();
    if (!title) push("error", "missing_glossary_title", "glossary.title is required", ["glossary", "title"]);
    if (!footerLabel) push("error", "missing_glossary_footerLabel", "glossary.footerLabel is required", ["glossary", "footerLabel"]);
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors) return { ok: false, issues };

  return { ok: true, pack: /** @type {MatterPackV1} */ (raw), issues };
}


