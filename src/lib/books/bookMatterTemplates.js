// src/lib/books/bookMatterTemplates.js
//
// Standalone HTML templates for book “matter pages” that are rasterized to PNG and inserted
// into the final PDF. These pages are intentionally NOT part of the core Prince book CSS.
//
// NOTE: This file is browser-safe (no Node/Deno imports). The worker can import it too.

import { validateMatterPack } from "./bookMatterCore.js";

function escapeHtml(raw) {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cssVarsFromPack(pack) {
  const t = pack.theme;
  const c = t.colors;
  return `
:root {
  --hbo-donkerblauw: ${escapeHtml(c.hboDonkerblauw)};
  --vp-groen: ${escapeHtml(c.vpGroen)};
  --vp-groen-light: ${escapeHtml(c.vpGroenLight)};
  --text-black: ${escapeHtml(c.textBlack)};
  --text-gray: ${escapeHtml(c.textGray)};
  --text-light-gray: ${escapeHtml(c.textLightGray)};
  --bg-white: ${escapeHtml(c.bgWhite)};
  --bg-off-white: ${escapeHtml(c.bgOffWhite)};
  --accent-blue: ${escapeHtml(c.accentBlue)};

  --font-heading: 'Inter', sans-serif;
  --font-body: 'Source Sans 3', sans-serif;

  --page-width: ${escapeHtml(String(t.pageWidthMm))}mm;
  --page-height: ${escapeHtml(String(t.pageHeightMm))}mm;
}
  `.trim();
}

function baseCss(pack) {
  return `
${cssVarsFromPack(pack)}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body { height: 100%; }
body {
  background: white;
  font-family: var(--font-body);
}

/* Render exactly one page per document for rasterization. */
@page {
  size: var(--page-width) var(--page-height);
  margin: 0;
}

.page-container {
  width: var(--page-width);
  height: var(--page-height);
  background: white;
  position: relative;
  overflow: hidden;
}

  `.trim();
}

function pagedBaseCss(pack) {
  // For multi-page matter docs (TOC/Index/Glossary) we allow Prince to paginate naturally.
  // Do NOT use the fixed-height .page-container with overflow hidden.
  return `
${cssVarsFromPack(pack)}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: white;
  font-family: var(--font-body);
  margin: 0;
}

@page {
  size: var(--page-width) var(--page-height);
  margin: 0;
}
  `.trim();
}

function docShell({ title, css, body }) {
  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>${css}</style>
  </head>
  <body>${body}</body>
</html>`;
}

export function renderMatterTitlePage(matterPack) {
  const v = validateMatterPack(matterPack);
  if (!v.ok) throw new Error("BLOCKED: invalid matter pack");
  const pack = v.pack;

  const css = `
${baseCss(pack)}

.page-title-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 20mm;
  padding-top: 80mm;
}

.main-title {
  font-family: var(--font-heading);
  color: var(--hbo-donkerblauw);
  font-size: 32pt;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 10mm;
}
.main-title em { font-style: italic; }

.authors {
  font-family: var(--font-heading);
  color: var(--vp-groen);
  font-size: 12pt;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: 50mm;
  line-height: 1.8;
}

.logo-placeholder {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-heading);
  font-weight: 700;
  color: var(--hbo-donkerblauw);
  font-size: 18pt;
}
.logo-icon {
  width: 40px;
  height: 40px;
  background: conic-gradient(from 45deg, var(--hbo-donkerblauw) 25%, var(--accent-blue) 0 50%, var(--hbo-donkerblauw) 0 75%, var(--accent-blue) 0);
  border-radius: 50%;
}
  `.trim();

  const titleHtml = pack.titlePage.titleHtml;
  const authors = Array.isArray(pack.titlePage.authors) ? pack.titlePage.authors : [];
  const logoText = pack.titlePage.logoText;

  const body = `
<div class="page-container">
  <div class="page-title-content">
    <h1 class="main-title">${titleHtml}</h1>
    <div class="authors">${authors.map((a) => escapeHtml(a)).join("<br>")}</div>
    <div class="logo-placeholder">
      <div class="logo-icon"></div>
      ${escapeHtml(logoText)}
    </div>
  </div>
</div>
  `.trim();

  return docShell({ title: "Titelpagina", css, body });
}

export function renderMatterColophonPage(matterPack) {
  const v = validateMatterPack(matterPack);
  if (!v.ok) throw new Error("BLOCKED: invalid matter pack");
  const pack = v.pack;

  const css = `
${baseCss(pack)}
.colophon-content {
  padding: 20mm;
  padding-top: 150mm;
  font-size: 8pt;
  color: var(--text-black);
  line-height: 1.5;
}
.colophon-block { margin-bottom: 4mm; }
.isbn { margin-bottom: 4mm; }
.legal-text {
  font-size: 7.5pt;
  text-align: justify;
  color: var(--text-black);
  margin-top: 8mm;
  line-height: 1.4;
}
  `.trim();

  const c = pack.colophon;
  const blocks = Array.isArray(c.blocks) ? c.blocks : [];
  const body = `
<div class="page-container">
  <div class="colophon-content">
    <div class="isbn"><strong>ISBN:</strong> ${escapeHtml(c.isbn)}</div>
    <div class="colophon-block"><strong>NUR:</strong> ${escapeHtml(c.nur)}</div>
    <div class="colophon-block"><strong>Trefwoorden:</strong> ${escapeHtml(c.trefwoorden)}</div>
    ${blocks.map((b) => `<div class="colophon-block">${escapeHtml(b)}</div>`).join("\n")}
    <div class="legal-text">${escapeHtml(c.legalText).replace(/\n/g, "<br>")}</div>
  </div>
</div>
  `.trim();

  return docShell({ title: "Colofon", css, body });
}

export function renderMatterPromoPage(matterPack) {
  const v = validateMatterPack(matterPack);
  if (!v.ok) throw new Error("BLOCKED: invalid matter pack");
  const pack = v.pack;

  const css = `
${baseCss(pack)}
.promo-header { background: var(--vp-groen); height: 15mm; width: 100%; position: absolute; top: 0; left: 0; }
.promo-content { padding: 30mm 20mm 20mm; }
.promo-logo-wrapper { display: flex; align-items: center; gap: 5px; margin-bottom: 6mm; }
.promo-logo-text { font-family: var(--font-heading); font-weight: 900; font-size: 42pt; color: var(--hbo-donkerblauw); line-height: 1; }
.promo-logo-icon { width: 32px; height: 32px; background: conic-gradient(from 45deg, var(--hbo-donkerblauw) 25%, var(--accent-blue) 0 50%, var(--hbo-donkerblauw) 0 75%, var(--accent-blue) 0); border-radius: 50%; margin: 0 2px; }
.promo-text { font-size: 10pt; margin-bottom: 6mm; line-height: 1.5; }
.promo-h3 { font-family: var(--font-heading); font-weight: 700; font-size: 11pt; margin-bottom: 2mm; color: #000; }
.promo-btn { display: inline-flex; align-items: center; background: var(--hbo-donkerblauw); color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-family: var(--font-heading); font-weight: 600; margin: 8mm 0; gap: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.play-icon { width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid white; }
  `.trim();

  const promo = pack.promo;
  const paragraphs = Array.isArray(promo.paragraphs) ? promo.paragraphs : [];
  const sections = Array.isArray(promo.sections) ? promo.sections : [];
  const bullets = Array.isArray(promo.bullets) ? promo.bullets : [];
  const ctaLabel = promo.ctaLabel || "";

  const body = `
<div class="page-container">
  <div class="promo-header"></div>
  <div class="promo-content">
    <div class="promo-logo-wrapper">
      <div class="promo-logo-text">MB</div>
      <div class="promo-logo-icon"></div>
      <div class="promo-logo-text">LEREN.NL</div>
    </div>
    ${paragraphs.map((p) => `<p class="promo-text">${escapeHtml(p)}</p>`).join("\n")}
    ${sections.map((s) => {
      const ps = Array.isArray(s.paragraphs) ? s.paragraphs : [];
      return `<h3 class="promo-h3">${escapeHtml(s.title)}</h3>\n${ps.map((p) => `<p class="promo-text">${escapeHtml(p)}</p>`).join("\n")}`;
    }).join("\n")}
    ${ctaLabel ? `<a href="#" class="promo-btn"><div class="play-icon"></div>${escapeHtml(ctaLabel)}</a>` : ""}
    ${bullets.length ? `<ul style="margin-left: 20px; font-size: 10pt; line-height: 1.5;">${bullets.map((b) => `<li style="margin-bottom: 8px;">${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
  </div>
</div>
  `.trim();

  return docShell({ title: "Promo", css, body });
}

export function renderMatterTocPage(matterPack, tocModel) {
  const v = validateMatterPack(matterPack);
  if (!v.ok) throw new Error("BLOCKED: invalid matter pack");
  const pack = v.pack;

  const css = `
${pagedBaseCss(pack)}

.toc-header {
  background: var(--vp-groen);
  padding: 28px 18mm 32px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}
.toc-header h1 {
  font-family: var(--font-heading);
  font-size: 42px;
  font-weight: 700;
  color: white;
  letter-spacing: -0.5px;
}
.toc-header::after {
  content: '';
  position: absolute;
  bottom: -16px;
  left: 18mm;
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 16px solid var(--vp-groen);
}

.toc-body {
  /* Reserve space for the fixed header + arrow */
  padding: 50mm 18mm 20mm;
}
.toc-flow {
  column-count: 2;
  column-gap: 10mm;
  column-fill: auto;
}
.toc-item {
  display: flex;
  align-items: baseline;
  margin-bottom: 4px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.toc-lvl-1 { margin-top: 16px; margin-bottom: 8px; font-family: var(--font-heading); font-weight: 700; color: var(--hbo-donkerblauw); font-size: 12pt; }
.toc-lvl-2 { margin-top: 8px; margin-bottom: 4px; font-family: var(--font-heading); font-weight: 600; color: var(--vp-groen); font-size: 10pt; }
.toc-lvl-3 { font-size: 9pt; color: var(--text-black); }
.toc-num { min-width: 30px; }
.toc-label { flex: 1; }
.toc-page { color: var(--text-gray); font-variant-numeric: tabular-nums; }
  `.trim();

  const tocTitle = pack.toc.title;
  const preamble = Array.isArray(pack.toc.preamble) ? pack.toc.preamble : [];
  const left = Array.isArray(tocModel?.left) ? tocModel.left : [];
  const right = Array.isArray(tocModel?.right) ? tocModel.right : [];
  const items = [...left, ...right];

  const renderItem = (it) => {
    const lvl = String(it.level || "").trim();
    const cls = lvl === "1" ? "toc-lvl-1" : lvl === "2" ? "toc-lvl-2" : "toc-lvl-3";
    const num = typeof it.num === "string" ? it.num : "";
    const label = typeof it.label === "string" ? it.label : "";
    const page = typeof it.page === "string" ? it.page : "";
    return `<div class="toc-item ${cls}">` +
      `${num ? `<div class="toc-num">${escapeHtml(num)}</div>` : `<div class="toc-num"></div>`}` +
      `<div class="toc-label">${escapeHtml(label)}</div>` +
      `<div class="toc-page">${escapeHtml(page)}</div>` +
      `</div>`;
  };

  const body = `
<header class="toc-header"><h1>${escapeHtml(tocTitle)}</h1></header>
<div class="toc-body">
  <div class="toc-flow">
    ${preamble.map((p) => `<div class="toc-item toc-lvl-2"><div class="toc-num"></div><div class="toc-label">${escapeHtml(p.label)}</div><div class="toc-page">${escapeHtml(p.page)}</div></div>`).join("\n")}
    ${items.map(renderItem).join("\n")}
  </div>
</div>
  `.trim();

  return docShell({ title: "Inhoudsopgave", css, body });
}

export function renderMatterIndexPage(matterPack, indexModel) {
  const v = validateMatterPack(matterPack);
  if (!v.ok) throw new Error("BLOCKED: invalid matter pack");
  const pack = v.pack;

  const css = `
${pagedBaseCss(pack)}
.index-header {
  background: var(--vp-groen);
  padding: 28px 18mm 32px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}
.index-header h1 {
  font-family: var(--font-heading);
  font-size: 42px;
  font-weight: 700;
  font-style: italic;
  color: white;
  letter-spacing: -0.5px;
}
.index-header::after {
  content: '';
  position: absolute;
  bottom: -16px;
  left: 18mm;
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 16px solid var(--vp-groen);
}
.index-body {
  padding: 50mm 18mm 20mm;
  font-size: 8pt;
  line-height: 1.4;
  column-count: 3;
  column-gap: 6mm;
  column-fill: auto;
}
.index-letter { font-family: var(--font-heading); font-weight: 700; color: var(--vp-groen); font-size: 14pt; margin-top: 12px; margin-bottom: 6px; break-inside: avoid; page-break-inside: avoid; }
.index-letter:first-child { margin-top: 0; }
.index-entry { margin-bottom: 2px; color: var(--text-black); break-inside: avoid; page-break-inside: avoid; }
.index-pages { color: var(--text-gray); }
.index-sub { padding-left: 10px; font-size: 7.5pt; color: var(--text-gray); }
  `.trim();

  const title = pack.index.title;
  const blocks = Array.isArray(indexModel?.blocks) ? indexModel.blocks : [];
  const renderBlock = (b) => {
    if (b && b.type === "letter") return `<div class="index-letter">${escapeHtml(b.letter)}</div>`;
    if (b && b.type === "entry") {
      const term = escapeHtml(b.term || "");
      const pages = escapeHtml(b.pages || "");
      return `<div class="index-entry"><span class="index-term">${term}</span> <span class="index-pages">${pages}</span></div>`;
    }
    if (b && b.type === "sub") return `<div class="index-sub">${escapeHtml(b.text || "")}</div>`;
    return "";
  };

  const body = `
<header class="index-header"><h1>${escapeHtml(title)}</h1></header>
<div class="index-body">
  ${blocks.map(renderBlock).join("\n")}
</div>
  `.trim();

  return docShell({ title, css, body });
}

export function renderMatterGlossaryPage(matterPack, glossaryModel) {
  const v = validateMatterPack(matterPack);
  if (!v.ok) throw new Error("BLOCKED: invalid matter pack");
  const pack = v.pack;

  const pageCounterReset =
    typeof glossaryModel?.pageCounterReset === "number" && Number.isFinite(glossaryModel.pageCounterReset)
      ? Math.floor(glossaryModel.pageCounterReset)
      : null;
  if (pageCounterReset === null) {
    throw new Error("BLOCKED: glossaryModel.pageCounterReset is required (number)");
  }

  const css = `
${pagedBaseCss(pack)}
body { counter-reset: page ${pageCounterReset}; }

.begrippen-body {
  padding: 20mm 18mm 26mm;
  column-count: 2;
  column-gap: 12mm;
  column-fill: auto;
}
.begrip-item { margin-bottom: 6mm; font-size: 9pt; line-height: 1.4; color: var(--text-black); }
.begrip-term { font-family: var(--font-heading); font-weight: 700; color: var(--vp-groen); font-size: 11pt; display: block; margin-bottom: 1mm; }
.begrip-latin { font-weight: 400; font-style: italic; }
.begrippen-footer {
  position: fixed;
  bottom: 12mm;
  right: 18mm;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-heading);
  font-size: 9pt;
  color: var(--hbo-donkerblauw);
  letter-spacing: 1px;
  font-weight: 600;
}
.page-num-circle {
  background: var(--hbo-donkerblauw);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.page-num-circle::before { content: counter(page); }
  `.trim();

  const footer = pack.glossary.footerLabel;
  const items = Array.isArray(glossaryModel?.items) ? glossaryModel.items : [];

  const renderItem = (it) => {
    const term = escapeHtml(it.term || "");
    const latin = typeof it.latin === "string" && it.latin.trim() ? ` <span class="begrip-latin">(${escapeHtml(it.latin)})</span>` : "";
    const def = escapeHtml(it.definition || "");
    return `<div class="begrip-item"><span class="begrip-term">${term}${latin}</span>${def}</div>`;
  };

  const body = `
<div class="begrippen-body">
  ${items.map(renderItem).join("\n")}
</div>
<div class="begrippen-footer">
  ${escapeHtml(footer)}
  <div class="page-num-circle"></div>
</div>
  `.trim();

  return docShell({ title: footer, css, body });
}


