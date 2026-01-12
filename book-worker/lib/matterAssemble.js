import { escapeHtml } from "./bookRenderer.js";

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ""));
}
function isDataUrl(s) {
  return /^data:/i.test(String(s || ""));
}
function isFileUrl(s) {
  return /^file:\/\//i.test(String(s || ""));
}

function extractTitleFromHtml(doc) {
  const m = String(doc || "").match(/<title>([\s\S]*?)<\/title>/i);
  return m ? String(m[1] || "").trim() : "";
}

function extractStyleCss(doc) {
  const m = String(doc || "").match(/<style>([\s\S]*?)<\/style>/i);
  if (!m) throw new Error("BLOCKED: Could not extract <style> from book HTML");
  return String(m[1] || "");
}

function extractBodyInner(doc) {
  const m = String(doc || "").match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!m) throw new Error("BLOCKED: Could not extract <body> from book HTML");
  return String(m[1] || "");
}

function assertSafeRelativeSrc(src) {
  const s = String(src || "").trim();
  if (!s) throw new Error("BLOCKED: Matter page src is empty");
  if (isHttpUrl(s) || isDataUrl(s) || isFileUrl(s)) return; // OK
  if (s.includes("..") || s.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(s)) {
    throw new Error(`BLOCKED: Matter page src must be a safe relative path (got '${s}')`);
  }
}

/**
 * Build a minimal Prince HTML that inserts full-page PNGs before/after the body HTML.
 * This intentionally only adds CSS needed for matter-page insertion and page-counter reset.
 *
 * @param {{
 *  bookHtml: string,
 *  frontMatterPages: Array<{ kind: string, src: string }>,
 *  backMatterPages: Array<{ kind: string, src: string }>,
 *  pageWidthMm: number,
 *  pageHeightMm: number,
 * }} opts
 */
export function assembleFinalBookHtml(opts) {
  const bookHtml = String(opts?.bookHtml || "");
  const frontMatterPages = Array.isArray(opts?.frontMatterPages) ? opts.frontMatterPages : [];
  const backMatterPages = Array.isArray(opts?.backMatterPages) ? opts.backMatterPages : [];
  const pageWidthMm = Number(opts?.pageWidthMm);
  const pageHeightMm = Number(opts?.pageHeightMm);
  if (!Number.isFinite(pageWidthMm) || pageWidthMm <= 0) throw new Error("BLOCKED: pageWidthMm is invalid");
  if (!Number.isFinite(pageHeightMm) || pageHeightMm <= 0) throw new Error("BLOCKED: pageHeightMm is invalid");

  const bookCss = extractStyleCss(bookHtml);
  const bookBodyInner = extractBodyInner(bookHtml);
  const title = extractTitleFromHtml(bookHtml) || "Book";

  // If the body begins with a chapter opener page, we must ensure the first body page uses
  // the same page master (`chapter-first`) to avoid inserting an extra blank page when switching
  // from front matter pages (`@page matter`) to chapter opener pages.
  const bodyHead = String(bookBodyInner || "").trimStart().slice(0, 1024);
  const firstChapterHasOpener = /<div\b[^>]*class=\"[^\"]*\bchapter\b[^\"]*\bhas-opener\b[^\"]*\"/i.test(bodyHead);
  const bodyStartPageDecl = firstChapterHasOpener ? "  page: chapter-first;\\n" : "";

  const matterCss = `
/* Matter pages inserted as full-bleed PNGs (no running headers/folios). */
@page matter {
  size: ${pageWidthMm}mm ${pageHeightMm}mm;
  margin: 0;
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
  @bottom-center { content: none; }
}
@page matter:left {
  size: ${pageWidthMm}mm ${pageHeightMm}mm;
  margin: 0;
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
  @bottom-center { content: none; }
}
@page matter:right {
  size: ${pageWidthMm}mm ${pageHeightMm}mm;
  margin: 0;
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
  @bottom-center { content: none; }
}

.matter-page {
  page: matter;
  break-before: page;
  width: ${pageWidthMm}mm;
  height: ${pageHeightMm}mm;
}
.matter-page:first-child { break-before: auto; }
.matter-page img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Ensure Chapter 1 starts at page 1 (arabic) for the book body. */
.book-body-start {
${bodyStartPageDecl}  display: block;
  break-before: page;
  counter-reset: page 0;
  height: 0;
}
.book-body-start:first-child { break-before: auto; }

/* IMPORTANT:
   The book CSS uses .chapter:first-of-type .chapter-title-block { break-before: auto; }.
   After we insert front-matter pages (which are also <div>), the first chapter is no longer :first-of-type
   and Prince would add an extra blank page before Chapter 1. Anchor the "first chapter" rule to our marker. */
.book-body-start + .chapter .chapter-title-block { break-before: auto !important; }
  `.trim();

  let out = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>${bookCss}\n\n${matterCss}</style>
  </head>
  <body>
`;

  const addPages = (pages) => {
    for (const p of pages) {
      const src = String(p?.src || "").trim();
      if (!src) continue;
      assertSafeRelativeSrc(src);
      out += `    <div class="matter-page" data-kind="${escapeHtml(String(p.kind || ""))}"><img src="${escapeHtml(src)}" alt="" /></div>\n`;
    }
  };

  // Front matter pages first
  addPages(frontMatterPages);

  // Book body
  // IMPORTANT: Do NOT wrap the book body in an extra <div>.
  // The renderer relies on some Prince CSS behaviors (e.g. prince-page-group) that are more stable
  // when chapters remain top-level siblings. Instead, insert a tiny page-break + counter reset marker.
  out += `    <span class="book-body-start"></span>\n${bookBodyInner}\n`;

  // Back matter pages last
  addPages(backMatterPages);

  out += `  </body>\n</html>\n`;
  return out;
}


