export function applyRewritesOverlay(canonical, overlay) {
  if (!overlay || typeof overlay !== "object") return canonical;
  const entries = Array.isArray(overlay.paragraphs) ? overlay.paragraphs : [];
  const map = new Map();
  for (const e of entries) {
    const pid = e?.paragraph_id;
    const rewritten = e?.rewritten;
    if (typeof pid === "string" && typeof rewritten === "string") {
      map.set(pid, rewritten);
    }
  }
  if (map.size === 0) return canonical;

  function walk(node) {
    if (!node) return node;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return node;
    }
    if (typeof node !== "object") return node;

    const id = node.id;
    if (typeof id === "string" && typeof node.basis === "string" && map.has(id)) {
      node.basis = map.get(id);
    }

    for (const v of Object.values(node)) walk(v);
    return node;
  }

  // NOTE: Use a JSON clone (canonical inputs are JSON) to avoid relying on structuredClone
  // across different test/runtime environments.
  return walk(JSON.parse(JSON.stringify(canonical)));
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeInlineBookHtml(raw) {
  let html = String(raw ?? "");

  // Canonical markup: Convert deterministic tokens into real inline HTML before sanitizing.
  // Without this, tokens like `<<BOLD_START>>...<<BOLD_END>>` get partially stripped as if
  // they were tags, leaving visible `>` artifacts in the rendered PDF (e.g. `>Diffusie>`).
  html = html.replace(/<<BOLD_START>>/g, "<strong>");
  html = html.replace(/<<BOLD_END>>/g, "</strong>");

  // Canonical text often uses `\n` between sentences (from extraction). Converting those into
  // `<br/>` inside a justified paragraph causes ugly word spacing because Prince justifies the
  // line before each forced break. Treat newlines as regular spaces for prose.
  //
  // If we later introduce explicit line-break semantics, do it at the block level (multiple <p>)
  // rather than hard breaks inside a justified paragraph.
  html = html.replace(/\r?\n/g, " ");
  // Collapse repeated whitespace introduced by newline-to-space conversion.
  html = html.replace(/[ \t]{2,}/g, " ");

  // Drop clearly dangerous/irrelevant tags entirely.
  html = html.replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*img\b[^>]*>/gi, ""); // images must be explicit figure blocks, not inline text

  // Allow only <span class="box-lead"> for lead phrases; strip any other span attrs.
  // IMPORTANT: preserve the `box-lead` class so the Prince PASS2 boxes can style the lead phrase.
  // We intentionally match `box-lead` anywhere in the tag to tolerate different quoting styles.
  html = html.replace(/<\s*span\b[^>]*box-lead[^>]*>/gi, '<span class="box-lead">');
  html = html.replace(/<\s*span\b(?![^>]*box-lead)[^>]*>/gi, "<span>");

  // Allow only a small set of inline tags, and strip attributes from them.
  // IMPORTANT: do NOT include `span` here; we already normalized spans above and we must preserve
  // `<span class="box-lead">` for Prince PASS2-style praktijk/verdieping lead phrases.
  html = html.replace(/<\s*(strong|em|b|i|sup|sub)\b[^>]*>/gi, "<$1>");
  html = html.replace(/<\s*\/\s*(strong|em|b|i|sup|sub|span)\s*>/gi, "</$1>");
  html = html.replace(/<\s*br\b[^>]*\/?>/gi, "<br/>");

  // Strip all remaining tags (keep text content).
  html = html.replace(/<(?!\/?(?:strong|em|b|i|sup|sub|span|br)\b)[^>]+>/gi, "");

  return html;
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s));
}

function isDataUrl(s) {
  return /^data:/i.test(String(s));
}

function isFileUrl(s) {
  return /^file:\/\//i.test(String(s));
}

function isWindowsAbsPath(s) {
  return /^[a-zA-Z]:[\\/]/.test(String(s));
}

function isPosixAbsPath(s) {
  return String(s).startsWith("/");
}

function placeholderSvgDataUrl(label) {
  const safe = String(label || "placeholder").slice(0, 80);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2f6"/>
      <stop offset="100%" stop-color="#dfe7ef"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1600" height="1000" fill="url(#bg)"/>
  <text x="800" y="520" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="46" fill="#334155" opacity="0.55">${escapeHtml(safe)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolveAssetSrc(raw, { assetsBaseUrl = "assets", srcMap } = {}) {
  const src = String(raw || "").trim();
  if (!src) return null;

  const srcLower = src.toLowerCase();
  if (srcLower.startsWith("placeholder:") || srcLower.startsWith("placeholder://")) {
    const label = src.replace(/^placeholder:\/*/i, "") || "placeholder";
    return placeholderSvgDataUrl(label);
  }

  if (isDataUrl(src) || isHttpUrl(src) || isFileUrl(src)) return src;

  const base = String(assetsBaseUrl || "").trim().replace(/\/$/, "");
  // If caller already provided an assets-prefixed relative path, keep it.
  if (base && (src === base || src.startsWith(`${base}/`))) return src;

  if (srcMap && typeof srcMap === "object" && typeof srcMap[src] === "string" && srcMap[src].trim()) {
    const mapped = srcMap[src].trim();
    if (isDataUrl(mapped) || isHttpUrl(mapped) || isFileUrl(mapped)) return mapped;
    if (isWindowsAbsPath(mapped) || isPosixAbsPath(mapped)) {
      throw new Error(
        `BLOCKED: figures.srcMap produced an absolute path (${mapped}). Use relative paths inside the assets bundle or a URL.`,
      );
    }
    if (base && (mapped === base || mapped.startsWith(`${base}/`))) return mapped;
    return `${base || "assets"}/${mapped.replace(/^\//, "")}`;
  }

  if (isWindowsAbsPath(src) || isPosixAbsPath(src)) {
    throw new Error(
      `BLOCKED: Image src is an absolute path (${src}). Provide figures.srcMap for this bookVersion or use relative paths inside the assets bundle.`,
    );
  }

  return `${base || "assets"}/${src.replace(/^\//, "")}`;
}

function splitNumberedTitle(raw) {
  const t = String(raw || "").trim();
  const m = t.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
  if (!m) return { number: null, title: t };
  return { number: m[1], title: m[2] };
}

function stripChapterNumberPrefix(raw) {
  const t = String(raw || "").trim();
  const m = t.match(/^\d+\.\s+(.+)$/);
  return m ? m[1] : t;
}

function isLikelySubparagraphNumberedHeading(raw) {
  const t = String(raw || "").trim();
  return /^\d+(?:\.\d+){2,}\s+/.test(t); // e.g. "1.1.1 Title"
}

export function renderBookHtml(
  canonical,
  {
    target,
    chapterIndex,
    assetsBaseUrl = "assets",
    figures,
    designTokens,
    chapterOpeners,
    placeholdersOnly = false,
    coverUrl = null,
    includeCover = true,
    includeToc = true,
  } = {},
) {
  // Prince-first textbook layout (PASS2-inspired).
  // NOTE: Prefer open fonts. If you want exact InDesign fonts, include them in the worker image/host OS.
  const css = `
@font-face {
  font-family: "Source Sans 3";
  src: local("Source Sans 3"), local("SourceSans3-Regular"), local("Source Sans Pro");
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: "Source Sans 3";
  src: local("Source Sans 3 Bold"), local("SourceSans3-Bold"), local("Source Sans Pro Bold");
  font-weight: 700;
  font-style: normal;
}
@font-face {
  font-family: "Source Sans 3";
  src: local("Source Sans 3 Italic"), local("SourceSans3-Italic"), local("Source Sans Pro Italic");
  font-weight: 400;
  font-style: italic;
}
@font-face {
  font-family: "Source Serif 4";
  src: local("Source Serif 4"), local("SourceSerif4-Regular"), local("Source Serif Pro");
  font-weight: 400;
  font-style: normal;
}

:root {
  --page-width: 195mm;
  --page-height: 265mm;
  --margin-top: 20mm;
  --margin-bottom: 20mm;
  --margin-inner: 15mm;
  --margin-outer: 15mm;

  --font-body: "FreightSans Pro", "Source Sans 3", "Helvetica Neue", Arial, sans-serif;
  --font-sans: "Facit", "Source Sans 3", "Helvetica Neue", Arial, sans-serif;

  /* Pure white background (avoid "yellowish/old paper" look) */
  --page-bg: #ffffff;
  --text: #111;
  --muted: #555;
  --rule: #c9c9c9;
  --accent: cmyk(77%, 7%, 56%, 0%);

  --body-size: 12pt;
  --body-leading: 1.25;

  --h1: 35pt;
  --h2: 18pt;
  --h3: 14pt;

  --p-space-after: 1.5mm;
  --p-space-after-extra: 0.5mm;
  --block-gap: calc(var(--p-space-after) + var(--p-space-after-extra));
  --h2-space-before: 3mm;
  --h2-space-after: 1.5mm;
  --h3-space-before: 1.5mm;
  --h3-space-after: 0.8mm;
  --h3-space-before-scale: 1.2;

  --praktijk-bg: cmyk(10%, 0%, 10%, 0%);
  --praktijk-border: cmyk(22%, 0%, 22%, 0%);
  --praktijk-accent: var(--accent);
  --verdieping-bg: cmyk(0%, 10%, 14%, 0%);
  --verdieping-border: cmyk(0%, 22%, 28%, 0%);
  --verdieping-accent: cmyk(0%, 60%, 70%, 25%);

  --bullet-marker-gap: 1.2mm;
  --box-inline-icon-size: 4.2mm;
  --box-inline-icon-gap: 1.2mm;
  --box-pad-top: 2.5mm;
  --box-pad-x: 5mm;
  --box-pad-bottom: 3mm;
  --box-label-gap: 0.8mm;

  --orphans: 2;
  --widows: 2;

  --body-columns: 2;
  --col-gap: 9mm;
}

@page {
  size: var(--page-width) var(--page-height);
  margin: var(--margin-top) var(--margin-outer) var(--margin-bottom) var(--margin-inner);
  background: var(--page-bg);

  @bottom-center {
    content: counter(page);
    font-family: var(--font-sans);
    font-size: 9pt;
    color: var(--muted);
  }
}

@page :left {
  margin-left: var(--margin-outer);
  margin-right: var(--margin-inner);

  @top-left {
    content: string(section-title);
    font-family: var(--font-sans);
    font-size: 8pt;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 0.5pt solid var(--rule);
    padding-bottom: 2mm;
    width: 100%;
  }
  @top-right { content: none; }
  @top-center { content: none; }

  @bottom-left {
    content: counter(page);
    font-family: var(--font-sans);
    font-size: 9pt;
    color: var(--muted);
  }
  @bottom-center { content: none; }
  @bottom-right { content: none; }
}

@page :right {
  margin-left: var(--margin-inner);
  margin-right: var(--margin-outer);

  @top-right {
    content: string(chapter-title);
    font-family: var(--font-sans);
    font-size: 8pt;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 0.5pt solid var(--rule);
    padding-bottom: 2mm;
    width: 100%;
  }
  @top-left { content: none; }
  @top-center { content: none; }

  @bottom-right {
    content: counter(page);
    font-family: var(--font-sans);
    font-size: 9pt;
    color: var(--muted);
  }
  @bottom-center { content: none; }
  @bottom-left { content: none; }
}

@page chapter-first {
  margin: 0;
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-center { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}
@page chapter-first:left {
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-center { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}
@page chapter-first:right {
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-center { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}

/* First page of each Prince page-group (chapter start): remove running headers. */
@page :first {
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
}

/* Frontmatter / TOC page master: no running headers, keep folios. */
@page matter:left {
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-left {
    content: counter(page);
    font-family: var(--font-sans);
    font-size: 9pt;
    color: var(--muted);
  }
  @bottom-center { content: none; }
  @bottom-right { content: none; }
}
@page matter:right {
  @top-left { content: none; }
  @top-right { content: none; }
  @top-center { content: none; }
  @bottom-right {
    content: counter(page);
    font-family: var(--font-sans);
    font-size: 9pt;
    color: var(--muted);
  }
  @bottom-center { content: none; }
  @bottom-left { content: none; }
}

html {
  font-family: var(--font-body);
  font-size: var(--body-size);
  line-height: var(--body-leading);
  color: var(--text);
  text-align: left;
  hyphens: auto;
  prince-hyphens: auto;
  hyphenate-limit-chars: 5 2 2;
  hyphenate-limit-lines: 2;
  hyphenate-limit-zone: 8%;
}
body { margin: 0; }

.toc {
  page: matter;
  break-before: page;
}
.toc:first-child { break-before: auto; }
.toc h1 {
  font-size: var(--h2);
  margin: 0 0 6mm 0;
  padding-bottom: 2mm;
  border-bottom: 2pt solid var(--accent);
  color: var(--accent);
  font-family: var(--font-sans);
  font-weight: 700;
  prince-bookmark-level: 1;
  prince-bookmark-label: "Inhoudsopgave";
}
.toc .toc-meta {
  font-size: 10pt;
  color: var(--muted);
  margin: 0 0 8mm 0;
}
.toc-entry { margin: 0 0 2mm 0; }
.toc-entry.toc-level-2 { margin-left: 6mm; }
.toc-entry a {
  color: var(--text);
  text-decoration: none;
}
.toc-entry a::after {
  content: leader('.') target-counter(attr(href), page);
  float: right;
  color: var(--muted);
}

/* Headings + bookmarks */
h1, h2, h3 {
  font-family: var(--font-sans);
  color: var(--accent);
  font-weight: 700;
  line-height: 1.15;
  break-after: avoid;
  page-break-after: avoid;
  break-inside: avoid;
  hyphens: none;
  prince-hyphens: none;
}
h1.chapter-title {
  prince-bookmark-level: 1;
  prince-bookmark-label: attr(data-bookmark);
}
h2.section-title {
  prince-bookmark-level: 2;
  prince-bookmark-label: attr(data-bookmark);
  string-set: section-title content();
}
h3.subparagraph-title {
  prince-bookmark-level: 3;
  prince-bookmark-label: attr(data-bookmark);
}

.chapter-title-block {
  break-before: page;
  position: relative;
  margin: 0 0 4mm 0;
  padding: 0;
  string-set: chapter-title content();
  /* Prince: treat each chapter as a page group so @page :first can apply per-chapter */
  prince-page-group: start;
}
.chapter:first-of-type .chapter-title-block { break-before: auto; }

.chapter.has-opener .chapter-title-block {
  page: chapter-first;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: var(--margin-top) var(--margin-outer) 0 var(--margin-inner);
  margin: 0;
  column-span: all;
  /* Override break-before when we have an opener - the opener handles page flow */
  break-before: auto;
}

.chapter-number {
  font-family: var(--font-sans);
  font-size: 9pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 2mm;
}
h1.chapter-title {
  font-size: var(--h1);
  margin: 0;
  padding-bottom: 2mm;
  border-bottom: 2pt solid var(--accent);
}
h2.section-title {
  font-size: var(--h2);
  margin: var(--h2-space-before) 0 var(--h2-space-after) 0;
  padding-bottom: 1.2mm;
  border-bottom: 0.5pt solid var(--rule);
  position: relative;
}
h2.section-title .section-number {
  display: inline-block;
  white-space: nowrap;
  margin-right: 0.35em;
}
h3.subparagraph-title {
  font-size: var(--h3);
  margin: calc(var(--h3-space-before) * var(--h3-space-before-scale)) 0 var(--h3-space-after) 0;
}
p.micro-title {
  font-family: var(--font-sans);
  font-size: 12pt;
  font-weight: 700;
  color: var(--accent);
  text-align: left;
  margin: 4mm 0 0.5mm 0;
  break-after: avoid;
  page-break-after: avoid;
  break-inside: avoid;
  page-break-inside: avoid;
  hyphens: none;
  prince-hyphens: none;
}

.p {
  margin: 0;
  orphans: var(--orphans);
  widows: var(--widows);
  text-align: justify;
  position: relative;
}
.p + .p { text-indent: 0; }
/* Page-map tokens (invisible, for deterministic page number extraction) */
.page-map-anchor { position: relative; }
.page-map-anchor::before {
  content: attr(data-page-map);
  position: absolute;
  left: 0;
  top: 0;
  font-size: 0.5pt;
  line-height: 1;
  color: #000;
  opacity: 0.01;
  white-space: nowrap;
  hyphens: none;
  prince-hyphens: none;
  pointer-events: none;
}
/* Token-only anchors should not affect layout flow (used when a block has no visible body text) */
.page-map-anchor.token-only {
  display: block;
  height: 0;
}

.p + .p,
.p + ul.bullets,
.p + ol.steps,
ul.bullets + .p,
ol.steps + .p {
  margin-top: var(--block-gap);
}

/* Chapter intro + recap blocks (full width) */
.chapter-intro {
  margin: 2mm 0 4mm 0;
  padding: 2.5mm 5mm 3mm 5mm;
  border-left: 3pt solid var(--accent);
  background: cmyk(5%, 0%, 5%, 0%);
}
.chapter-intro .intro-title {
  font-family: var(--font-sans);
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 2mm 0;
}

.chapter-recap {
  column-span: all;
  margin: 5mm 0 0 0;
  padding-top: 3mm;
  border-top: 2pt solid var(--accent);
}

/* Recap module boxes */
.recap-module {
  margin: 3mm 0;
  padding: 3mm 5mm 3.5mm 5mm;
  border: 0.5pt solid var(--rule);
  border-left: 3pt solid var(--accent);
  border-radius: 0 2mm 2mm 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.recap-module.doelen-check {
  background: cmyk(5%, 0%, 8%, 0%);
  border-left-color: var(--praktijk-accent);
}
.recap-module.kernsamenvatting {
  background: cmyk(3%, 3%, 0%, 0%);
  border-left-color: cmyk(50%, 30%, 0%, 10%);
}
.recap-module.begrippen {
  background: cmyk(0%, 5%, 8%, 0%);
  border-left-color: var(--verdieping-accent);
}
.recap-module.controleer {
  background: cmyk(8%, 0%, 0%, 0%);
  border-left-color: cmyk(70%, 20%, 0%, 0%);
}
.recap-module .module-title {
  font-family: var(--font-sans);
  font-size: 13pt;
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 2.5mm 0;
  display: flex;
  align-items: center;
}
.recap-module .module-title::before {
  content: "";
  display: inline-block;
  width: 5mm;
  height: 5mm;
  /* PrinceXML does not support flexbox gap; use margins for consistent spacing. */
  margin-right: 2mm;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}
.recap-module.doelen-check .module-title::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232D7A4E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 11l3 3L22 4'/%3E%3Cpath d='M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11'/%3E%3C/svg%3E");
}
.recap-module.kernsamenvatting .module-title::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A6FA5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='21' y1='10' x2='3' y2='10'/%3E%3Cline x1='21' y1='6' x2='3' y2='6'/%3E%3Cline x1='21' y1='14' x2='3' y2='14'/%3E%3Cline x1='21' y1='18' x2='3' y2='18'/%3E%3C/svg%3E");
}
.recap-module.begrippen .module-title::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238B4B3A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 19.5A2.5 2.5 0 016.5 17H20'/%3E%3Cpath d='M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z'/%3E%3C/svg%3E");
}
.recap-module.controleer .module-title::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232B6CB0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'/%3E%3C/svg%3E");
}
.recap-module.kernbegrippen .module-title::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232D7A4E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'/%3E%3C/svg%3E");
}
.recap-module.kernbegrippen {
  background: cmyk(5%, 0%, 5%, 0%);
  border-left-color: var(--praktijk-accent);
}
.recap-module.volgende-stap {
  background: cmyk(0%, 0%, 0%, 3%);
  border-left-color: var(--muted);
}
.recap-module.volgende-stap .module-title::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='5' y1='12' x2='19' y2='12'/%3E%3Cpolyline points='12 5 19 12 12 19'/%3E%3C/svg%3E");
}

.recap-link {
  color: inherit;
  text-decoration: none;
}
.recap-link:hover { text-decoration: underline; }

/* Checklist (Doelen-check) */
ul.checklist {
  margin: 0;
  padding: 0;
  list-style: none;
}
ul.checklist li {
  margin: 0 0 1mm 0;
  padding-left: 7mm;
  text-indent: calc(0mm - 7mm);
  text-align: left;
}
ul.checklist li::before {
  content: "☐";
  font-family: var(--font-sans);
  font-weight: 700;
  color: var(--accent);
  display: inline-block;
  width: 7mm;
  text-align: right;
  box-sizing: border-box;
  padding-right: var(--bullet-marker-gap);
}

/* Glossary */
.glossary { margin: 0; }
.glossary-item {
  margin: 0 0 1.8mm 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.glossary-term {
  font-family: var(--font-sans);
  font-weight: 700;
  color: var(--accent);
}
.glossary-def {
  margin-top: 0.7mm;
  color: var(--text);
  text-align: left;
}
.page-ref {
  font-family: var(--font-sans);
  font-size: 9pt;
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
}
.page-ref::before { content: "  "; }
.page-ref::after { content: "p. " target-counter(attr(href), page); }

/* Bullets / questions */
ul.bullets {
  margin: 0;
  padding: 0;
  list-style: none;
}
ul.bullets li {
  margin: 0 0 1mm 0;
  padding-left: 7mm;
  text-indent: calc(0mm - 7mm);
  text-align: left;
}
ul.bullets li::before {
  content: "•";
  font-family: var(--font-sans);
  color: var(--accent);
  display: inline-block;
  width: 7mm;
  text-align: right;
  box-sizing: border-box;
  padding-right: var(--bullet-marker-gap);
}

ol.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}
ol.steps li {
  margin: 0 0 1.2mm 0;
  padding-left: 9mm;
  position: relative;
}
ol.steps li::before {
  counter-increment: step;
  content: counter(step) ".";
  position: absolute;
  left: 0;
  top: 0;
  width: 8mm;
  text-align: right;
  font-family: var(--font-sans);
  font-weight: 700;
  color: var(--accent);
}

/* Two-column flow */
.chapter-body {
  column-count: var(--body-columns);
  column-gap: var(--col-gap);
  column-fill: balance;
  column-fill: balance-all;
}

/* Keep boxes/figures from splitting awkwardly */
figure,
.box {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* Figures */
figure.figure-block {
  margin: 3mm 0 4mm 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
figure.figure-block.full-width {
  width: 100%;
  max-width: 100%;
  /* In a multi-column container, use column-span instead of Prince page-referenced floats.
     Page-referenced floats can overlap adjacent columns (text paints over the image). */
  column-span: all;
  clear: both;
}
figure.figure-block.full-width.chapter-opener {
  page: chapter-first;
  float: none;
  clear: none;
  margin: 0;
  width: var(--page-width);
  height: var(--page-height);
  break-after: page;
}
figure.figure-block.full-width.chapter-opener img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  max-height: none;
}
figure.figure-block.full-width.cover-page {
  page: chapter-first;
  float: none;
  clear: none;
  margin: 0;
  width: var(--page-width);
  height: var(--page-height);
  break-after: page;
}
figure.figure-block.full-width.cover-page img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  max-height: none;
}
figure.figure-block img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: calc(var(--page-height) - var(--margin-top) - var(--margin-bottom) - 28mm);
  object-fit: contain;
  margin: 0 auto;
}
figcaption.figure-caption {
  margin-top: 3mm;
  font-family: var(--font-sans);
  font-size: 9pt;
  color: var(--muted);
  text-align: left;
  line-height: 1.35;
}
.figure-placeholder .image-placeholder {
  width: 100%;
  min-height: 22mm;
  border: 1px dashed rgba(0, 0, 0, 0.35);
  background: #f7f7f7;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4mm;
}
.figure-placeholder .image-placeholder-inner {
  font-family: var(--font-sans);
  font-size: 10pt;
  color: #333;
  text-align: center;
}
.figure-label {
  font-weight: 700;
  color: var(--accent);
}

/* Praktijk / Verdieping boxes */
.box {
  margin: 3mm 0;
  padding: var(--box-pad-top) var(--box-pad-x) var(--box-pad-bottom) var(--box-pad-x);
  border: 0.5pt solid var(--rule);
  border-left: 3pt solid var(--accent);
  background: #f7f7f7;
  border-radius: 0;
  text-indent: 0 !important;
  break-inside: auto;
  page-break-inside: auto;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.box.praktijk {
  background: var(--praktijk-bg);
  border-color: var(--praktijk-border);
  border-left-color: var(--praktijk-accent);
}
.box.verdieping {
  background: var(--verdieping-bg);
  border-color: var(--verdieping-border);
  border-left-color: var(--verdieping-accent);
}
.box p {
  margin: 0;
  /* Boxes should be easy to scan: ragged-right + minimal hyphenation. */
  text-align: left;
  font-style: normal;
  hyphens: none;
  prince-hyphens: none;
  orphans: 9;
  widows: 9;
}
.box .box-lead {
  font-style: italic;
  font-weight: 400;
}
.box .box-label {
  font-family: var(--font-sans);
  font-weight: 700;
  color: var(--accent);
  display: block;
  break-after: avoid;
  page-break-after: avoid;
  margin: 0 0 var(--box-label-gap) 0;
  text-align: left;
  white-space: nowrap;
  font-style: normal;
}
.box .box-label::before {
  content: "";
  display: inline-block;
  width: var(--box-inline-icon-size);
  height: var(--box-inline-icon-size);
  margin-right: var(--box-inline-icon-gap);
  vertical-align: text-top;
  background-repeat: no-repeat;
  background-position: left center;
  background-size: contain;
}
.box.praktijk .box-label::before {
  background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%3E%0A%20%20%3Cg%20fill%3D'none'%20stroke%3D'%232D7A4E'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%0A%20%20%20%20%3Cpath%20d%3D'M7%2010c0-2.8%202.2-5%205-5s5%202.2%205%205v7c0%202.8-2.2%205-5%205s-5-2.2-5-5v-7z'%2F%3E%0A%20%20%20%20%3Ccircle%20cx%3D'10'%20cy%3D'12'%20r%3D'1.7'%2F%3E%0A%20%20%20%20%3Ccircle%20cx%3D'14'%20cy%3D'12'%20r%3D'1.7'%2F%3E%0A%20%20%20%20%3Cpath%20d%3D'M12%2014l-1%201m1-1l1%201'%2F%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E");
}
.box.verdieping .box-label::before {
  background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%3E%0A%20%20%3Cg%20fill%3D'none'%20stroke%3D'%238B4B3A'%20stroke-width%3D'1.8'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%0A%20%20%20%20%3Cpath%20d%3D'M9%2021h6'%2F%3E%0A%20%20%20%20%3Cpath%20d%3D'M10%2018h4'%2F%3E%0A%20%20%20%20%3Cpath%20d%3D'M6%2011a6%206%200%201%201%2012%200c0%202.2-1.2%203.6-2.4%204.8-.7.7-1.2%201.2-1.4%202.2H10c-.2-1-0.7-1.5-1.4-2.2C7.2%2014.6%206%2013.2%206%2011z'%2F%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E");
}
.box.praktijk .box-label { color: var(--praktijk-accent); }
.box.verdieping .box-label { color: var(--verdieping-accent); }
  `.trim();

  function renderContentBlocks(blocks) {
    if (!Array.isArray(blocks)) return "";
    let out = "";

    function isPlaceholderImage(img) {
      if (!img || typeof img !== "object") return false;
      if (img.placeholder === true || img.isPlaceholder === true || img.kind === "placeholder") return true;
      const srcRaw = typeof img.src === "string" ? img.src.trim() : "";
      const srcLower = srcRaw.toLowerCase();
      return srcLower.startsWith("placeholder:") || srcLower.startsWith("placeholder://");
    }

    function renderFiguresFromBlock(b) {
      const images = Array.isArray(b?.images) ? b.images : [];
      if (!images.length) return "";
      let figOut = "";
      for (const img of images) {
        if (!img || typeof img !== "object") continue;
        const isPlaceholder = placeholdersOnly || isPlaceholderImage(img);
        const src = typeof img.src === "string" ? img.src : null;
        const alt = typeof img.alt === "string" ? img.alt : "";
        const caption = typeof img.caption === "string" ? img.caption : "";
        const figureNumber = typeof img.figureNumber === "string" ? img.figureNumber : "";
        if (isPlaceholder) {
          const labelOnly = figureNumber ? `Afbeelding ${figureNumber}` : "Afbeelding";
          // Keep the full caption in the figcaption below; inside the placeholder we only show the label
          // so the PDF doesn't look like duplicated captions.
          const inner = labelOnly;
          // IMPORTANT: Do NOT use `full-width` for placeholders. Full-width uses `column-span: all` which creates
          // large gallery-like blocks that feel like "all images at the end". Placeholders should be inline markers.
          figOut += `<figure class="figure-block figure-placeholder"><div class="image-placeholder" role="img" aria-label="${escapeHtml(inner)}"><div class="image-placeholder-inner">${escapeHtml(inner)}</div></div>`;
        } else {
          if (!src) continue;
          const resolvedSrc = resolveAssetSrc(src, { assetsBaseUrl, srcMap: figures?.srcMap || figures?.src_map });
          figOut += `<figure class="figure-block full-width"><img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(alt)}" />`;
        }
        if (caption || figureNumber) {
          const label = figureNumber ? `Afbeelding ${figureNumber}:` : "";
          figOut += `<figcaption class="figure-caption">${label ? `<span class="figure-label">${escapeHtml(label)}</span> ` : ""}${escapeHtml(caption)}</figcaption>`;
        }
        figOut += `</figure>\n`;
      }
      return figOut;
    }

    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const t = typeof b.type === "string" ? b.type : "";

      if (t === "paragraph") {
        const basis = typeof b.basis === "string" ? b.basis : "";
        const pidRaw = typeof b.id === "string" ? b.id : "";
        const pid = pidRaw ? `pid-${toSafeDomId(pidRaw)}` : "";
        const dataPid = pidRaw ? ` data-paragraph-id="${escapeHtml(pidRaw)}"` : "";
        const pm = pid ? ` data-page-map="${escapeHtml(`PAGEMAP:PID:${pid}`)}"` : "";
        const pidId = pid ? ` id="${escapeHtml(pid)}"` : "";
        if (basis.trim()) {
          out += `<p class="p role-body page-map-anchor"${dataPid}${pidId}${pm}>${sanitizeInlineBookHtml(basis)}</p>\n`;
        } else if (pid) {
          // Ensure every paragraph block has a deterministic PID token, even if it only contains
          // praktijk/verdieping boxes and/or figures. Without this, index term → page mapping
          // fails loudly because the worker cannot resolve the block's PID token.
          out += `<span class="page-map-anchor token-only"${dataPid}${pidId}${pm}></span>\n`;
        }

        if (typeof b.praktijk === "string" && b.praktijk.trim()) {
          out += `<div class="box praktijk"><p><span class="box-label">In de praktijk:</span> ${sanitizeInlineBookHtml(b.praktijk)}</p></div>\n`;
        }
        if (typeof b.verdieping === "string" && b.verdieping.trim()) {
          out += `<div class="box verdieping"><p><span class="box-label">Verdieping:</span> ${sanitizeInlineBookHtml(b.verdieping)}</p></div>\n`;
        }

        out += renderFiguresFromBlock(b);
        continue;
      }

      if (t === "list") {
        const bidRaw = typeof b.id === "string" ? b.id : "";
        const bid = bidRaw ? `pid-${toSafeDomId(bidRaw)}` : "";
        // IMPORTANT: avoid duplicate `class="..."` attributes (invalid HTML).
        // We must keep `page-map-anchor` on the element so the `::before { content: attr(data-page-map) }`
        // token gets rendered and can be extracted from the PDF deterministically.
        const pmClass = bid ? " page-map-anchor" : "";
        const pmAttrs = bid ? ` id="${escapeHtml(bid)}" data-page-map="${escapeHtml(`PAGEMAP:PID:${bid}`)}"` : "";
        const items = Array.isArray(b.items) ? b.items : [];
        const ordered = b.ordered === true;
        const clean = items
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter((x) => !!x);
        if (clean.length) {
          if (ordered) {
            out += `<ol class="steps${pmClass}"${pmAttrs}>\n`;
            for (const it of clean) out += `  <li>${sanitizeInlineBookHtml(it)}</li>\n`;
            out += `</ol>\n`;
          } else {
            out += `<ul class="bullets${pmClass}"${pmAttrs}>\n`;
            for (const it of clean) out += `  <li>${sanitizeInlineBookHtml(it)}</li>\n`;
            out += `</ul>\n`;
          }
        }
        out += renderFiguresFromBlock(b);
        continue;
      }

      if (t === "steps") {
        const bidRaw = typeof b.id === "string" ? b.id : "";
        const bid = bidRaw ? `pid-${toSafeDomId(bidRaw)}` : "";
        // IMPORTANT: avoid duplicate `class="..."` attributes (invalid HTML) for the same reason as list blocks.
        const pmClass = bid ? " page-map-anchor" : "";
        const pmAttrs = bid ? ` id="${escapeHtml(bid)}" data-page-map="${escapeHtml(`PAGEMAP:PID:${bid}`)}"` : "";
        const items = Array.isArray(b.items) ? b.items : [];
        const clean = items
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter((x) => !!x);
        if (clean.length) {
          out += `<ol class="steps${pmClass}"${pmAttrs}>\n`;
          for (const it of clean) out += `  <li>${sanitizeInlineBookHtml(it)}</li>\n`;
          out += `</ol>\n`;
        }
        out += renderFiguresFromBlock(b);
        continue;
      }

      if (t === "subparagraph") {
        const title = typeof b.title === "string" ? b.title : "";
        if (title) {
          if (isLikelySubparagraphNumberedHeading(title)) {
            const id = typeof b.id === "string" ? b.id : "";
            const safeId = id ? `sub-${escapeHtml(id)}` : "";
            out += `<h3 class="subparagraph-title"${safeId ? ` id="${safeId}"` : ""} data-bookmark="${escapeHtml(title)}">${escapeHtml(title)}</h3>\n`;
          } else {
            out += `<p class="micro-title">${escapeHtml(title)}</p>\n`;
          }
        }
        out += renderContentBlocks(b.content || b.blocks || b.items);
        continue;
      }

      // Fallback: try common keys
      if (Array.isArray(b.content)) {
        out += renderContentBlocks(b.content);
      } else if (typeof b.basis === "string") {
        out += `<p class="p role-body">${sanitizeInlineBookHtml(b.basis)}</p>\n`;
      }
    }
    return out;
  }

  function normalizeWhitespace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function stripHtmlToText(raw) {
    const s = String(raw || "")
      .replace(/<\s*br\b[^>]*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    return normalizeWhitespace(s);
  }

  function toSafeDomId(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    // Stable + HTML-id safe: letters/numbers/_/-
    return s
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function firstSentence(text) {
    const t = normalizeWhitespace(text);
    if (!t) return "";
    const parts = t.split(/(?<=[.!?])\s+/);
    const s = (parts[0] || t).trim();
    return s.length > 280 ? `${s.slice(0, 277).trim()}…` : s;
  }

  function sentenceContaining(text, term) {
    const t = normalizeWhitespace(text);
    const needle = String(term || "").trim().toLowerCase();
    if (!t || !needle) return "";
    const parts = t.split(/(?<=[.!?])\s+/);
    for (const p of parts) {
      if (String(p).toLowerCase().includes(needle)) {
        const s = String(p).trim();
        return s.length > 320 ? `${s.slice(0, 317).trim()}…` : s;
      }
    }
    return firstSentence(t);
  }

  function extractStrongTermsFromHtml(raw) {
    const html = String(raw || "");
    const re = /<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
    const out = [];
    let m;
    while ((m = re.exec(html))) {
      const t = stripHtmlToText(m[2]);
      if (!t) continue;
      // Trim trailing punctuation
      const cleaned = t.replace(/[.,;:!?]+$/g, "").trim();
      if (cleaned) out.push(cleaned);
    }
    return out;
  }

  function collectKeyTermsFromBlocks(blocks, acc) {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;

      if (typeof b.basis === "string") {
        for (const t of extractStrongTermsFromHtml(b.basis)) acc.push(t);
      }
      if (typeof b.praktijk === "string") {
        for (const t of extractStrongTermsFromHtml(b.praktijk)) acc.push(t);
      }
      if (typeof b.verdieping === "string") {
        for (const t of extractStrongTermsFromHtml(b.verdieping)) acc.push(t);
      }

      const child = b.content || b.blocks || b.items;
      if (Array.isArray(child)) collectKeyTermsFromBlocks(child, acc);
    }
  }

  function deriveKeyTermsForChapter(ch) {
    const terms = [];
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    for (const s of sections) {
      collectKeyTermsFromBlocks(s?.content || s?.blocks || s?.items, terms);
    }
    if (!sections.length) {
      collectKeyTermsFromBlocks(ch?.content || ch?.blocks || ch?.items, terms);
    }

    // De-dupe while preserving order (case-insensitive).
    const seen = new Set();
    const uniq = [];
    for (const t of terms) {
      const key = String(t || "").toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(String(t));
    }
    return uniq;
  }

  function pickEvenlySpacedIndices(n, max) {
    const nn = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    const mm = typeof max === "number" && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
    if (nn <= 0 || mm <= 0) return [];
    if (nn <= mm) return Array.from({ length: nn }, (_, i) => i);
    if (mm === 1) return [0];

    const idxs = new Set();
    for (let i = 0; i < mm; i++) {
      const t = i / (mm - 1);
      const idx = Math.round(t * (nn - 1));
      idxs.add(idx);
    }
    // If rounding produced duplicates, fill from the front to ensure we hit mm items.
    const out = Array.from(idxs).sort((a, b) => a - b);
    for (let i = 0; i < nn && out.length < mm; i++) {
      if (idxs.has(i)) continue;
      idxs.add(i);
      out.push(i);
    }
    return out.sort((a, b) => a - b);
  }

  function deriveLearningObjectivesFromSections(sections, max = 4) {
    const out = [];
    const list = Array.isArray(sections) ? sections : [];
    const idxs = pickEvenlySpacedIndices(list.length, max);
    for (const idx of idxs) {
      const s = list[idx];
      const rawSt = s?.title || s?.meta?.title || "";
      if (!rawSt) continue;
      const { title } = splitNumberedTitle(rawSt);
      const t = normalizeWhitespace(title);
      if (!t) continue;

      // A lightweight, deterministic objective from the heading.
      const lowered = t.length > 1 ? t[0].toLowerCase() + t.slice(1) : t.toLowerCase();
      if (/verschillen tussen/i.test(t)) {
        out.push(`Je kunt de verschillen tussen ${lowered.replace(/verschillen tussen\s*/i, "")} uitleggen.`);
      } else if (/van\s+.+\s+naar\s+.+/i.test(t)) {
        out.push(`Je kunt beschrijven hoe ${lowered} werkt.`);
      } else if (/^de\s|^het\s|^een\s/i.test(t)) {
        out.push(`Je kunt uitleggen wat ${lowered} is.`);
      } else {
        out.push(`Je kunt de hoofdpunten van ${lowered} uitleggen.`);
      }
    }
    return out;
  }

  function deriveLearningObjectivesWithRefs(sections, { chapterIndex, max = 6 } = {}) {
    const out = [];
    const idx = typeof chapterIndex === "number" && Number.isFinite(chapterIndex) ? chapterIndex : 0;
    const list = Array.isArray(sections) ? sections : [];
    const picked = pickEvenlySpacedIndices(list.length, max);
    for (const j of picked) {
      const s = list[j];
      const rawSt = s?.title || s?.meta?.title || "";
      if (!rawSt) continue;
      const objective = deriveLearningObjectivesFromSections([s], 1)[0];
      if (!objective) continue;

      const secId = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `${idx + 1}.${j + 1}`;
      out.push({ objective, href: `#sec-${secId}` });
    }
    return out;
  }

  function toIkKan(s) {
    const t = normalizeWhitespace(s);
    if (!t) return "";
    return t.replace(/^Je kunt\s+/i, "Ik kan ");
  }

  function collectParagraphRefsFromBlocks(blocks, acc) {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const t = typeof b.type === "string" ? b.type : "";
      if (t === "paragraph") {
        const id = typeof b.id === "string" && b.id.trim() ? b.id.trim() : "";
        const basis = typeof b.basis === "string" ? stripHtmlToText(b.basis) : "";
        if (id && basis) acc.push({ id, text: basis });
      }
      const child = b.content || b.blocks || b.items;
      if (Array.isArray(child)) collectParagraphRefsFromBlocks(child, acc);
    }
  }

  function collectParagraphRefsForChapter(ch) {
    const out = [];
    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    if (sections.length) {
      for (const s of sections) {
        collectParagraphRefsFromBlocks(s?.content || s?.blocks || s?.items, out);
      }
    } else {
      collectParagraphRefsFromBlocks(ch?.content || ch?.blocks || ch?.items, out);
    }
    return out;
  }

  function firstParagraphSentenceForSection(s) {
    const acc = [];
    collectParagraphRefsFromBlocks(s?.content || s?.blocks || s?.items, acc);
    if (!acc.length) return { sentence: "", href: "" };
    const p = acc[0];
    return { sentence: firstSentence(p.text), href: p.id ? `#pid-${toSafeDomId(p.id)}` : "" };
  }

  function deriveSectionSummaries(sections, { max = 6, keyTerms = [] } = {}) {
    const out = [];
    const list = Array.isArray(sections) ? sections : [];
    const globalTerms = (Array.isArray(keyTerms) ? keyTerms : [])
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .slice(0, 20);

    const stop = new Set(["de", "het", "een", "en", "van", "voor", "in", "op", "bij", "naar", "uit", "met", "om", "te", "je", "we"]);
    const titleTokens = (title) =>
      String(title || "")
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^\p{L}\p{N}-]+/gu, ""))
        .filter((w) => w.length >= 3 && !stop.has(w));

    const splitSentences = (text) => {
      const t = normalizeWhitespace(text);
      if (!t) return [];
      return t.split(/(?<=[.!?])\s+/).map((s) => String(s || "").trim()).filter(Boolean);
    };

    const countWords = (text) => normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;

    const scoreSentence = (sentence, { tokens, termNeedles }) => {
      const s = normalizeWhitespace(sentence);
      if (!s) return -9999;
      const lower = s.toLowerCase();

      // Drop pure boilerplate.
      if (/^in dit hoofdstuk\b/i.test(s) || /^hier leer\b/i.test(s) || /^in deze sectie\b/i.test(s)) return -9999;

      let score = 0;

      // Prefer definitional / explanatory sentences.
      if (/\b(is|zijn|heet|noem je|betekent)\b/i.test(s)) score += 2;

      // Prefer sentences that mention the section topic.
      const hasTitleToken = tokens.some((tok) => tok && lower.includes(tok));
      if (hasTitleToken) score += 2;

      // Prefer sentences that include bold-derived key terms (more specific).
      let hits = 0;
      for (const term of termNeedles) {
        if (term && lower.includes(term)) hits++;
      }
      if (hits) score += 6 + Math.min(3, hits);

      // Penalize generic openers.
      if (/^net als\b/i.test(s)) score -= 6;

      // Length sweet-spot (single, useful sentence).
      const wc = countWords(s);
      if (wc >= 10 && wc <= 22) score += 2;
      else if (wc >= 7 && wc <= 28) score += 1;
      else if (wc < 7) score -= 5;
      else if (wc > 34) score -= 2;

      // If it doesn't mention the section topic OR any key term, it's probably too generic.
      if (!hasTitleToken && hits === 0) score -= 3;

      return score;
    };

    for (let j = 0; j < list.length && out.length < max; j++) {
      const s = list[j];
      const rawSt = s?.title || s?.meta?.title || "";
      const { number, title } = splitNumberedTitle(rawSt);
      const label = normalizeWhitespace(number ? `${number} ${title}` : title) || `Sectie ${j + 1}`;

      // Gather paragraph text for the section.
      const paras = [];
      collectParagraphRefsFromBlocks(s?.content || s?.blocks || s?.items, paras);

      // Gather bold-derived terms for the section (higher precision than global terms).
      const sectionTermsRaw = [];
      collectKeyTermsFromBlocks(s?.content || s?.blocks || s?.items, sectionTermsRaw);
      const sectionTerms = sectionTermsRaw.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 20);

      const needles = Array.from(new Set([...sectionTerms, ...globalTerms].map((t) => t.toLowerCase())))
        .filter((t) => t.length >= 3);
      const tokens = titleTokens(title);

      let best = { score: -9999, sentence: "", href: "" };
      for (const p of paras) {
        const sentences = splitSentences(p.text);
        for (const sent of sentences.slice(0, 3)) {
          const sc = scoreSentence(sent, { tokens, termNeedles: needles });
          if (sc > best.score) {
            best = { score: sc, sentence: sent, href: p.id ? `#pid-${toSafeDomId(p.id)}` : "" };
          }
          // Early exit when we find a very good, specific sentence.
          if (best.score >= 11) break;
        }
        if (best.score >= 11) break;
      }

      if (!best.sentence) {
        const fallback = firstParagraphSentenceForSection(s);
        if (fallback?.sentence) out.push({ label, sentence: fallback.sentence, href: fallback.href });
        continue;
      }

      const clipped = best.sentence.length > 280 ? `${best.sentence.slice(0, 277).trim()}…` : best.sentence;
      out.push({ label, sentence: clipped, href: best.href });
    }
    return out;
  }

  function deriveGlossaryItems({ keyTerms, paragraphs, max = 10 }) {
    const out = [];
    const terms = Array.isArray(keyTerms) ? keyTerms : [];
    const paras = Array.isArray(paragraphs) ? paragraphs : [];

    const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const splitSentences = (text) => {
      const t = normalizeWhitespace(text);
      if (!t) return [];
      return t.split(/(?<=[.!?])\s+/).map((s) => String(s || "").trim()).filter(Boolean);
    };
    const countWords = (text) => normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;

    const isDefinitionSentence = (sentence, termLower) => {
      const s = normalizeWhitespace(sentence);
      if (!s) return false;
      const lower = s.toLowerCase();
      if (!lower.includes(termLower)) return false;

      // Avoid intro boilerplate.
      if (/^welkom\b/i.test(s) || /^in dit hoofdstuk\b/i.test(s) || /^stel je voor\b/i.test(s)) return false;

      const termRe = escapeRegex(termLower);
      // Term is the subject (best case): "Term is/ontstaat/betekent/..."
      const subject = new RegExp(
        `^(?:de\\s+|het\\s+|een\\s+)?${termRe}\\b[\\s\\S]{0,120}\\b(?:is|zijn|betekent|staat\\s+voor|ontstaat|ontstaan|komt\\s+voor|komt)\\b`,
        "i",
      );
      if (subject.test(lower)) return true;

      // Term is named (also good): "... noemen we Term" / "Dit heet Term" / "in medische termen Term"
      const named = new RegExp(
        `\\b(?:noemen\\s+we|noem\\s+je|dit\\s+noemen\\s+we|heet|dit\\s+heet|wordt\\s+genoemd|in\\s+medische\\s+termen?)\\b[\\s\\S]{0,120}\\b${termRe}\\b`,
        "i",
      );
      if (named.test(lower)) return true;

      return false;
    };

    const scoreDefinition = (sentence, termLower) => {
      const s = normalizeWhitespace(sentence);
      if (!s) return -9999;
      const lower = s.toLowerCase();
      if (!lower.includes(termLower)) return -9999;

      if (!isDefinitionSentence(s, termLower)) return -9999;

      let score = 0;
      // Prefer definitional language.
      if (/\b(is|zijn|betekent|noem\s+je|noemen\s+we|heet|staat\s+voor|ontstaat|ontstaan)\b/i.test(s)) score += 7;

      // Prefer when the term is introduced early.
      const pos = lower.indexOf(termLower);
      if (pos >= 0 && pos <= 14) score += 2;

      // Prefer sentences that start by defining the term.
      if (
        lower.startsWith(termLower) ||
        lower.startsWith(`de ${termLower}`) ||
        lower.startsWith(`het ${termLower}`) ||
        lower.startsWith(`een ${termLower}`)
      ) {
        score += 3;
      }

      // Length sweet spot.
      const wc = countWords(s);
      if (wc >= 7 && wc <= 24) score += 2;
      else if (wc < 5) score -= 4;
      else if (wc > 34) score -= 2;

      return score;
    };

    const definitionCandidatesForTerm = (term) => {
      const needle = normalizeWhitespace(term);
      const needleLower = needle.toLowerCase();
      if (!needleLower) return [];

      /** @type {{ score: number, sentence: string, href: string }[]} */
      const candidates = [];
      for (const p of paras) {
        const text = typeof p?.text === "string" ? p.text : "";
        const lower = text.toLowerCase();
        if (!lower.includes(needleLower)) continue;

        const sentences = splitSentences(text);
        // Scan a few sentences; definitions are usually early.
        for (const sent of sentences.slice(0, 8)) {
          if (!String(sent).toLowerCase().includes(needleLower)) continue;
          const sc = scoreDefinition(sent, needleLower);
          if (sc <= -9999) continue;
          const clipped = sent.length > 320 ? `${sent.slice(0, 317).trim()}…` : sent;
          candidates.push({
            score: sc,
            sentence: clipped,
            href: p?.id ? `#pid-${toSafeDomId(p.id)}` : "",
          });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      // De-dupe by sentence text and keep a few alternatives.
      const seen = new Set();
      const uniq = [];
      for (const c of candidates) {
        const key = c.sentence.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(c);
        if (uniq.length >= 5) break;
      }
      return uniq;
    };

    const usedTerms = new Set();
    const usedDefs = new Set();
    for (const term of terms) {
      if (out.length >= max) break;
      const needle = normalizeWhitespace(term);
      if (!needle) continue;
      const termKey = needle.toLowerCase();
      if (usedTerms.has(termKey)) continue;

      const candidates = definitionCandidatesForTerm(needle);
      const picked = candidates.find((c) => c && typeof c.sentence === "string" && !usedDefs.has(c.sentence.toLowerCase())) || null;
      if (!picked) continue;

      usedTerms.add(termKey);
      usedDefs.add(picked.sentence.toLowerCase());
      out.push({ term: needle, definition: picked.sentence, href: picked.href });
    }
    return out;
  }

  function deriveCheckQuestions({ sections, keyTerms, max = 4 }) {
    const qs = [];
    const seen = new Set();
    const push = (q) => {
      const t = normalizeWhitespace(q);
      if (!t) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      qs.push(t);
    };

    const terms = Array.isArray(keyTerms) ? keyTerms.map((t) => String(t || "").trim()).filter(Boolean) : [];
    const secTitles = Array.isArray(sections)
      ? sections.map((s) => splitNumberedTitle(s?.title || "").title).map((t) => normalizeWhitespace(t)).filter(Boolean)
      : [];

    const nonIntroTitles = secTitles.filter((t) => !/^inleiding$/i.test(t));
    const pickTitle = (i) => nonIntroTitles[i] || secTitles[i] || "";

    if (terms[0]) push(`Wat bedoelen we met “${terms[0]}”?`);

    // Prefer a concrete topic (skip "Inleiding" when possible).
    const topic1 = pickTitle(0);
    if (topic1) push(`Vat de kern van “${topic1}” samen in twee zinnen.`);

    const topic2 = pickTitle(1);
    if (topic2) push(`Noem twee belangrijke punten over “${topic2}”.`);

    const appTerm = terms[1] || terms[2] || "";
    if (appTerm) push(`Geef een voorbeeld van “${appTerm}” uit de zorgpraktijk.`);

    return qs.slice(0, max);
  }

  function renderChapter(ch, idx) {
    const rawTitle = ch?.title || ch?.meta?.title || `Hoofdstuk ${idx + 1}`;
    const displayTitle = stripChapterNumberPrefix(rawTitle);
    const bookmark = `${idx + 1}. ${displayTitle}`;

    const openerRaw =
      (chapterOpeners && typeof chapterOpeners === "object" ? chapterOpeners[idx] : null) ||
      ch?.openerImageSrc ||
      ch?.openerImage ||
      ch?.opener_image ||
      null;
    // REQUIREMENT: every chapter gets a full-page opener. If none is provided, render a placeholder image.
    const hasOpener = true;
    const openerLabel = `Hoofdstuk ${idx + 1} opener`;
    const openerSrc = openerRaw
      ? resolveAssetSrc(openerRaw, { assetsBaseUrl, srcMap: figures?.srcMap || figures?.src_map })
      : placeholderSvgDataUrl(openerLabel);

    let out = `<div class="chapter${hasOpener ? " has-opener" : ""}" id="ch-${idx + 1}">\n`;

    const chDomId = `ch-${idx + 1}`;
    out += `  <div class="chapter-title-block page-map-anchor" data-page-map="${escapeHtml(`PAGEMAP:CH:${chDomId}`)}">\n`;
    out += `    <div class="chapter-number">Hoofdstuk ${idx + 1}</div>\n`;
    out += `    <h1 class="chapter-title" data-bookmark="${escapeHtml(bookmark)}">${escapeHtml(displayTitle)}</h1>\n`;
    out += `  </div>\n\n`;

    if (hasOpener) {
      // IMPORTANT: keep opener AFTER title block. The title block is absolutely positioned
      // for chapters with openers, so it overlays on top of this full-page figure.
      out += `  <figure class="figure-block full-width chapter-opener">\n`;
      out += `    <img src="${escapeHtml(openerSrc)}" alt="${escapeHtml(openerLabel)}">\n`;
      out += `  </figure>\n\n`;
    }

    const sections = Array.isArray(ch?.sections) ? ch.sections : [];
    const recapRaw = ch?.recap && typeof ch.recap === "object" ? ch.recap : null;
    const recapObjectivesRaw = Array.isArray(recapRaw?.objectives) ? recapRaw.objectives : [];

    // Deterministic chapter intro:
    // - Prefer persisted (LLM-authored) objectives when available.
    // - Otherwise derive lightweight objectives from section headings so every chapter has an intro.
    let introObjectives = recapObjectivesRaw
      .map((o) => normalizeWhitespace(o?.text))
      .filter(Boolean)
      .slice(0, 10);
    if (!introObjectives.length) {
      introObjectives = deriveLearningObjectivesFromSections(sections, 4).slice(0, 10);
    }
    if (introObjectives.length) {
      out += `  <div class="chapter-intro">\n`;
      out += `    <div class="intro-title">In dit hoofdstuk leer je:</div>\n`;
      out += `    <ul class="bullets">\n`;
      for (const o of introObjectives) out += `      <li>${escapeHtml(o)}</li>\n`;
      out += `    </ul>\n`;
      out += `  </div>\n\n`;
    }

    out += `  <div class="chapter-body">\n`;

    for (const s of sections) {
      if (!s || typeof s !== "object") continue;
      const rawSt = s.title || s.meta?.title || "";
      if (rawSt) {
        const { number, title } = splitNumberedTitle(rawSt);
        const secId = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `${idx + 1}.${sections.indexOf(s) + 1}`;
        const bookmarkLabel = number ? `${number} ${title}` : title;
        const secDomId = `sec-${secId}`;
        out += `    <h2 class="section-title page-map-anchor" data-page-map="${escapeHtml(`PAGEMAP:SEC:${secDomId}`)}" id="${escapeHtml(secDomId)}" data-section-id="${escapeHtml(secId)}" data-bookmark="${escapeHtml(bookmarkLabel)}">`;
        if (number) out += `<span class="section-number">${escapeHtml(number)}</span> `;
        out += `${escapeHtml(title)}</h2>\n`;
      }
      out += renderContentBlocks(s.content || s.blocks || s.items);
    }

    // Some sources may put blocks directly under chapter
    if (sections.length === 0) {
      out += renderContentBlocks(ch?.content || ch?.blocks || ch?.items);
    }

    // Chapter recap (LLM-authored; persisted in canonical via skeleton chapter.recap).
    // IMPORTANT: No deterministic fallback. If recap is missing, we render nothing.
    const recapObjectives = Array.isArray(recapRaw?.objectives) ? recapRaw.objectives : [];
    const recapGlossary = Array.isArray(recapRaw?.glossary) ? recapRaw.glossary : [];
    const recapSelfCheck = Array.isArray(recapRaw?.selfCheckQuestions) ? recapRaw.selfCheckQuestions : [];

    const objectivesWithRefs = recapObjectives
      .map((o) => ({
        text: normalizeWhitespace(o?.text),
        sectionId: typeof o?.sectionId === "string" ? o.sectionId.trim() : "",
      }))
      .filter((o) => !!o.text && !!o.sectionId)
      .map((o) => ({ objective: o.text, href: `#sec-${o.sectionId}` }));

    const glossary = recapGlossary
      .map((g) => ({
        term: normalizeWhitespace(g?.term),
        definition: normalizeWhitespace(g?.definition),
        sectionId: typeof g?.sectionId === "string" ? g.sectionId.trim() : "",
      }))
      .filter((g) => !!g.term && !!g.definition && !!g.sectionId)
      .map((g) => ({ term: g.term, definition: g.definition, href: `#sec-${g.sectionId}` }));

    const questions = recapSelfCheck
      .map((q) => ({
        question: normalizeWhitespace(q?.question),
        sectionId: typeof q?.sectionId === "string" ? q.sectionId.trim() : "",
      }))
      .filter((q) => !!q.question)
      .map((q) => q.question)
      .slice(0, 10);

    if (objectivesWithRefs.length || glossary.length || questions.length) {
      out += `\n    <div class="chapter-recap">\n`;

      if (objectivesWithRefs.length) {
        out += `      <div class="recap-module doelen-check">\n`;
        out += `        <div class="module-title">Doelen-check</div>\n`;
        out += `        <ul class="checklist">\n`;
        for (const o of objectivesWithRefs) {
          const txt = toIkKan(o.objective);
          const href = typeof o.href === "string" ? o.href : "";
          out += `          <li>${href ? `<a class="recap-link" href="${escapeHtml(href)}">${escapeHtml(txt)}</a>` : escapeHtml(txt)}</li>\n`;
        }
        out += `        </ul>\n`;
        out += `      </div>\n`;
      }

      if (glossary.length) {
        out += `      <div class="recap-module begrippen">\n`;
        out += `        <div class="module-title">Begrippen (kort uitgelegd)</div>\n`;
        out += `        <div class="glossary">\n`;
        for (const g of glossary) {
          const href = typeof g.href === "string" ? g.href : "";
          out += `          <div class="glossary-item">\n`;
          out += `            <div class="glossary-term">${escapeHtml(g.term)}</div>\n`;
          out += `            <div class="glossary-def">${escapeHtml(g.definition)}${href ? ` <a class="page-ref" href="${escapeHtml(href)}"></a>` : ""}</div>\n`;
          out += `          </div>\n`;
        }
        out += `        </div>\n`;
        out += `      </div>\n`;
      }

      if (questions.length) {
        out += `      <div class="recap-module controleer">\n`;
        out += `        <div class="module-title">Controleer jezelf</div>\n`;
        out += `        <ol class="steps">\n`;
        for (const q of questions) out += `          <li>${escapeHtml(q)}</li>\n`;
        out += `        </ol>\n`;
        out += `      </div>\n`;
      }

      out += `    </div>\n`;
    }

    out += `  </div>\n</div>\n`;
    return out;
  }

  const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
  const selected =
    target === "chapter" && typeof chapterIndex === "number"
      ? (chapters[chapterIndex] ? [{ ch: chapters[chapterIndex], idx: chapterIndex }] : [])
      : chapters.map((ch, idx) => ({ ch, idx }));

  const body = selected.map(({ ch, idx }) => renderChapter(ch, idx)).join("\n");

  const metaTitle = canonical?.meta?.title || "Book";
  const metaLevel = canonical?.meta?.level ? String(canonical.meta.level).toUpperCase() : "";

  function renderCover() {
    if (target === "chapter") return "";
    if (includeCover !== true) return "";

    const url = typeof coverUrl === "string" ? coverUrl.trim() : "";
    if (!url) {
      if (!placeholdersOnly) return "";
      const label = "Boekomslag (cover)";
      let out = `<figure class="figure-block full-width cover-page figure-placeholder">\n`;
      out += `  <div class="image-placeholder" style="height:100%;min-height:100%;" role="img" aria-label="${escapeHtml(label)}">`;
      out += `<div class="image-placeholder-inner">${escapeHtml(label)}</div></div>\n`;
      out += `</figure>\n`;
      return out;
    }

    let out = `<figure class="figure-block full-width cover-page">\n`;
    out += `  <img src="${escapeHtml(url)}" alt="${escapeHtml(metaTitle)} cover">\n`;
    out += `</figure>\n`;
    return out;
  }

  function renderToc() {
    if (target === "chapter") return "";
    if (includeToc !== true) return "";
    let out = `<div class="toc">\n`;
    out += `  <div class="toc-meta">\n`;
    out += `    <div>${escapeHtml(metaTitle)}</div>\n`;
    if (metaLevel) out += `    <div>Niveau ${escapeHtml(metaLevel)}</div>\n`;
    out += `  </div>\n`;
    out += `  <h1>Inhoudsopgave</h1>\n`;

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const rawTitle = ch?.title || ch?.meta?.title || `Hoofdstuk ${i + 1}`;
      const displayTitle = stripChapterNumberPrefix(rawTitle);
      out += `  <div class="toc-entry toc-level-1"><a href="#ch-${i + 1}">${escapeHtml(`${i + 1}. ${displayTitle}`)}</a></div>\n`;

      const sections = Array.isArray(ch?.sections) ? ch.sections : [];
      for (let j = 0; j < sections.length; j++) {
        const s = sections[j];
        const rawSt = s?.title || s?.meta?.title || "";
        if (!rawSt) continue;
        const { number, title } = splitNumberedTitle(rawSt);
        const secId = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `${i + 1}.${j + 1}`;
        const label = number ? `${number} ${title}` : title;
        out += `  <div class="toc-entry toc-level-2"><a href="#sec-${escapeHtml(secId)}">${escapeHtml(label)}</a></div>\n`;
      }
    }

    out += `</div>\n`;
    return out;
  }

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(metaTitle)}</title>
    <style>${css}</style>
  </head>
  <body>
    ${renderCover()}
    ${renderToc()}
    ${body}
  </body>
</html>`;
}
