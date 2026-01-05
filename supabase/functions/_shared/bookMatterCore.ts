/**
 * Shared Book Matter core for Supabase Edge Functions (Deno).
 *
 * IMPORTANT:
 * - Keep this aligned with `src/lib/books/bookMatterCore.js`
 * - No Node/Deno imports (pure TS)
 * - No silent fallbacks: validation returns issues; callers decide how to treat warnings
 */

export type MatterSeverity = "error" | "warning";

export type MatterIssue = {
  severity: MatterSeverity;
  code: string;
  message: string;
  path: string[];
};

export type MatterThemeColors = {
  hboDonkerblauw: string;
  vpGroen: string;
  vpGroenLight: string;
  textBlack: string;
  textGray: string;
  textLightGray: string;
  bgWhite: string;
  bgOffWhite: string;
  accentBlue: string;
};

export type MatterTheme = {
  pageWidthMm: number;
  pageHeightMm: number;
  colors: MatterThemeColors;
};

export type MatterTitlePage = {
  titleHtml: string;
  authors: string[];
  logoText: string;
};

export type MatterColophon = {
  isbn: string;
  nur: string;
  trefwoorden: string;
  blocks: string[];
  legalText: string;
};

export type MatterToc = {
  title: string;
  preamble?: Array<{ label: string; page: string }>;
};

export type MatterPromo = {
  enabled: boolean;
  title: string;
  paragraphs: string[];
  sections?: Array<{ title: string; paragraphs: string[] }>;
  bullets?: string[];
  ctaLabel?: string;
};

export type MatterIndex = { title: string };

export type MatterGlossary = { title: string; footerLabel: string };

export type MatterPackV1 = {
  schemaVersion: "matter_pack_v1";
  bookId: string;
  bookVersionId: string;
  language: string;
  theme: MatterTheme;
  titlePage: MatterTitlePage;
  colophon: MatterColophon;
  toc: MatterToc;
  promo: MatterPromo;
  index: MatterIndex;
  glossary: MatterGlossary;
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

function isLikelyHexColor(raw: unknown): boolean {
  const s = asString(raw).trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s);
}

export function validateMatterPack(
  raw: unknown,
): { ok: true; pack: MatterPackV1; issues: MatterIssue[] } | { ok: false; issues: MatterIssue[] } {
  const issues: MatterIssue[] = [];
  const push = (severity: MatterSeverity, code: string, message: string, path: string[]) => {
    issues.push({ severity, code, message, path: Array.isArray(path) ? path : [] });
  };

  if (!isPlainObject(raw)) {
    push("error", "invalid_type", "Matter pack must be a JSON object", []);
    return { ok: false, issues };
  }

  const schemaVersion = asString((raw as any).schemaVersion).trim();
  if (schemaVersion !== "matter_pack_v1") {
    push("error", "invalid_schemaVersion", "schemaVersion must be 'matter_pack_v1'", ["schemaVersion"]);
  }

  const bookId = asString((raw as any).bookId).trim();
  const bookVersionId = asString((raw as any).bookVersionId).trim();
  const language = asString((raw as any).language).trim();
  if (!bookId) push("error", "missing_bookId", "bookId is required", ["bookId"]);
  if (!bookVersionId) push("error", "missing_bookVersionId", "bookVersionId is required", ["bookVersionId"]);
  if (!language) push("error", "missing_language", "language is required", ["language"]);

  const theme = (raw as any).theme;
  if (!isPlainObject(theme)) {
    push("error", "missing_theme", "theme is required", ["theme"]);
  } else {
    const pageWidthMm = asNumber((theme as any).pageWidthMm);
    const pageHeightMm = asNumber((theme as any).pageHeightMm);
    if (pageWidthMm === null || pageWidthMm <= 0) {
      push("error", "invalid_pageWidthMm", "theme.pageWidthMm must be a positive number", ["theme", "pageWidthMm"]);
    }
    if (pageHeightMm === null || pageHeightMm <= 0) {
      push("error", "invalid_pageHeightMm", "theme.pageHeightMm must be a positive number", ["theme", "pageHeightMm"]);
    }

    const colors = (theme as any).colors;
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
        const s = asString((colors as any)[k]).trim();
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

  const titlePage = (raw as any).titlePage;
  if (!isPlainObject(titlePage)) {
    push("error", "missing_titlePage", "titlePage is required", ["titlePage"]);
  } else {
    const titleHtml = asString((titlePage as any).titleHtml).trim();
    if (!titleHtml) push("error", "missing_titleHtml", "titlePage.titleHtml is required", ["titlePage", "titleHtml"]);
    const authors = (titlePage as any).authors;
    if (!Array.isArray(authors) || authors.length === 0) {
      push("error", "missing_authors", "titlePage.authors must be a non-empty array", ["titlePage", "authors"]);
    } else {
      for (let i = 0; i < authors.length; i++) {
        if (typeof authors[i] !== "string" || !String(authors[i]).trim()) {
          push("error", "invalid_author", `titlePage.authors[${i}] is empty`, ["titlePage", "authors", String(i)]);
        }
      }
    }
    const logoText = asString((titlePage as any).logoText).trim();
    if (!logoText) push("error", "missing_logoText", "titlePage.logoText is required", ["titlePage", "logoText"]);
  }

  const colophon = (raw as any).colophon;
  if (!isPlainObject(colophon)) {
    push("error", "missing_colophon", "colophon is required", ["colophon"]);
  } else {
    const isbn = asString((colophon as any).isbn).trim();
    if (!isbn) push("error", "missing_isbn", "colophon.isbn is required", ["colophon", "isbn"]);
    const nur = asString((colophon as any).nur).trim();
    if (!nur) push("error", "missing_nur", "colophon.nur is required", ["colophon", "nur"]);
    const trefwoorden = asString((colophon as any).trefwoorden).trim();
    if (!trefwoorden) push("error", "missing_trefwoorden", "colophon.trefwoorden is required", ["colophon", "trefwoorden"]);
    const blocks = (colophon as any).blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      push("error", "missing_blocks", "colophon.blocks must be a non-empty array", ["colophon", "blocks"]);
    }
    const legalText = asString((colophon as any).legalText).trim();
    if (!legalText) push("error", "missing_legalText", "colophon.legalText is required", ["colophon", "legalText"]);
  }

  const toc = (raw as any).toc;
  if (!isPlainObject(toc)) {
    push("error", "missing_toc", "toc is required", ["toc"]);
  } else {
    const title = asString((toc as any).title).trim();
    if (!title) push("error", "missing_toc_title", "toc.title is required", ["toc", "title"]);
    const preamble = (toc as any).preamble;
    if (typeof preamble !== "undefined") {
      if (!Array.isArray(preamble)) {
        push("error", "invalid_toc_preamble", "toc.preamble must be an array", ["toc", "preamble"]);
      } else {
        for (let i = 0; i < preamble.length; i++) {
          const it = preamble[i];
          if (!isPlainObject(it)) {
            push("error", "invalid_toc_preamble_item", `toc.preamble[${i}] must be an object`, ["toc", "preamble", String(i)]);
            continue;
          }
          if (!asString((it as any).label).trim()) {
            push("error", "missing_toc_preamble_label", `toc.preamble[${i}].label is required`, ["toc", "preamble", String(i), "label"]);
          }
          if (!asString((it as any).page).trim()) {
            push("error", "missing_toc_preamble_page", `toc.preamble[${i}].page is required`, ["toc", "preamble", String(i), "page"]);
          }
        }
      }
    }
  }

  const promo = (raw as any).promo;
  if (!isPlainObject(promo)) {
    push("error", "missing_promo", "promo is required", ["promo"]);
  } else {
    if ((promo as any).enabled !== true && (promo as any).enabled !== false) {
      push("error", "invalid_promo_enabled", "promo.enabled must be boolean", ["promo", "enabled"]);
    }
    const title = asString((promo as any).title).trim();
    if (!title) push("error", "missing_promo_title", "promo.title is required", ["promo", "title"]);
    const paragraphs = (promo as any).paragraphs;
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      push("error", "missing_promo_paragraphs", "promo.paragraphs must be a non-empty array", ["promo", "paragraphs"]);
    }
  }

  const index = (raw as any).index;
  if (!isPlainObject(index)) {
    push("error", "missing_index", "index is required", ["index"]);
  } else {
    const title = asString((index as any).title).trim();
    if (!title) push("error", "missing_index_title", "index.title is required", ["index", "title"]);
  }

  const glossary = (raw as any).glossary;
  if (!isPlainObject(glossary)) {
    push("error", "missing_glossary", "glossary is required", ["glossary"]);
  } else {
    const title = asString((glossary as any).title).trim();
    const footerLabel = asString((glossary as any).footerLabel).trim();
    if (!title) push("error", "missing_glossary_title", "glossary.title is required", ["glossary", "title"]);
    if (!footerLabel) push("error", "missing_glossary_footerLabel", "glossary.footerLabel is required", ["glossary", "footerLabel"]);
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors) return { ok: false, issues };
  return { ok: true, pack: raw as MatterPackV1, issues };
}


