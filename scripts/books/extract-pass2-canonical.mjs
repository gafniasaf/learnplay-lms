import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "node-html-parser";

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args.set(k, v);
  }
  return args;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeWhitespace(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeAssetPath(src) {
  const s = String(src || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:/i.test(s)) return s;
  if (/^file:\/\//i.test(s)) return s;

  const idx = s.toLowerCase().lastIndexOf("/assets/");
  if (idx >= 0) {
    return s.slice(idx + "/assets/".length).replace(/^\/+/, "");
  }
  // Keep relative paths as-is; reject other absolute paths by returning null (caller may drop images).
  if (s.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(s)) return null;
  return s.replace(/^\/+/, "");
}

function stripBoxLabelHtml(html) {
  // Remove the leading <span class="box-label">…</span> and optional <span class="box-lead">…</span>
  let h = String(html || "").trim();
  h = h.replace(/^\s*<span[^>]*class=\"box-label\"[^>]*>[\s\S]*?<\/span>\s*/i, "");
  return h.trim();
}

function buildParagraphId({ chapterNo, sectionId, subId, idx }) {
  const parts = [
    `ch${chapterNo}`,
    sectionId ? `sec${sectionId}` : null,
    subId ? `sub${subId}` : null,
    `p${String(idx).padStart(4, "0")}`,
  ].filter(Boolean);
  return `pass2:${parts.join(":")}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const inputPath = String(args.get("in") || "canonical_book_PASS2.assembled_prince.html");
  const outPath = String(args.get("out") || path.join("tmp", "pass2", "canonical.pass2.chapter1.json"));
  const includeImages = String(args.get("include-images") || "false").toLowerCase() === "true";

  // Chapter selection
  const chapterRaw = args.get("chapter");
  const chapterIndex = chapterRaw !== undefined ? Number(chapterRaw) : 0; // default: chapter 0 only (small)
  if (!Number.isFinite(chapterIndex) || chapterIndex < 0) {
    throw new Error("Invalid --chapter (must be >= 0, 0-based).");
  }

  const raw = await fs.readFile(inputPath, "utf-8");
  const root = parse(raw);

  const title = normalizeWhitespace(root.querySelector("title")?.text || "PASS2 Book");
  const inferredLevel = /n3/i.test(title) ? "n3" : /n4/i.test(title) ? "n4" : null;
  const level = String(args.get("level") || inferredLevel || "n3");
  if (level !== "n3" && level !== "n4") {
    throw new Error("Invalid --level (must be n3 or n4).");
  }

  const bookId = String(args.get("bookId") || slugify(title) || "pass2-book");

  const chapters = root.querySelectorAll("div.chapter");
  if (!chapters.length) {
    throw new Error("No chapters found in PASS2 HTML (expected div.chapter).");
  }
  if (chapterIndex >= chapters.length) {
    throw new Error(`--chapter ${chapterIndex} is out of range (found ${chapters.length} chapters).`);
  }

  const chEl = chapters[chapterIndex];
  const chapterNo = chapterIndex + 1;

  const chapterTitleEl = chEl.querySelector("h1.chapter-title");
  const chapterTitle = normalizeWhitespace(chapterTitleEl?.text || `Hoofdstuk ${chapterNo}`);

  const openerImgEl = chEl.querySelector("figure.chapter-opener img");
  const openerSrc = openerImgEl ? normalizeAssetPath(openerImgEl.getAttribute("src")) : null;

  const chapterBody = chEl.querySelector("div.chapter-body");
  if (!chapterBody) {
    throw new Error("PASS2 HTML chapter is missing div.chapter-body.");
  }

  const chapterObj = {
    title: `${chapterNo}. ${chapterTitle}`,
    ...(includeImages && openerSrc ? { openerImage: openerSrc } : {}),
    sections: [],
  };

  let currentSection = null;
  let currentNumberedSub = null;
  let currentMicroSub = null;
  let lastParagraph = null;
  let paraSeq = 0;

  const children = chapterBody.childNodes.filter((n) => n && typeof n === "object" && (n.nodeType === 1));
  for (const node of children) {
    const tag = String(node.tagName || "").toLowerCase();
    const classAttr = String(node.getAttribute?.("class") || "");

    if (tag === "h2" && classAttr.includes("section-title")) {
      const secTitle = normalizeWhitespace(node.text);
      const secId = String(node.getAttribute("id") || "").replace(/^sec-/, "") || secTitle.split(" ")[0] || "";
      currentSection = { title: secTitle, id: secId, content: [] };
      chapterObj.sections.push(currentSection);
      currentNumberedSub = null;
      currentMicroSub = null;
      lastParagraph = null;
      continue;
    }

    if (!currentSection) {
      // Skip pre-section content in chapter body
      continue;
    }

    if (tag === "h3" && classAttr.includes("subparagraph-title")) {
      const subTitle = normalizeWhitespace(node.text);
      const subId = String(node.getAttribute("id") || "").replace(/^sub-/, "") || "";
      currentNumberedSub = { type: "subparagraph", title: subTitle, id: subId, content: [] };
      currentSection.content.push(currentNumberedSub);
      currentMicroSub = null;
      lastParagraph = null;
      continue;
    }

    if (tag === "p" && classAttr.includes("micro-title")) {
      const microTitle = normalizeWhitespace(node.text);
      currentMicroSub = { type: "subparagraph", title: microTitle, content: [] };
      const container = currentNumberedSub ? currentNumberedSub.content : currentSection.content;
      container.push(currentMicroSub);
      lastParagraph = null;
      continue;
    }

    if (tag === "p" && classAttr.includes("role-body")) {
      const basisHtml = String(node.innerHTML || "").trim();
      if (!basisHtml) continue;

      paraSeq += 1;
      const id = buildParagraphId({
        chapterNo,
        sectionId: currentSection.id,
        subId: currentNumberedSub?.id || null,
        idx: paraSeq,
      });

      const p = {
        type: "paragraph",
        id,
        paragraphNumber: paraSeq,
        basis: basisHtml,
      };

      const container = currentMicroSub
        ? currentMicroSub.content
        : currentNumberedSub
          ? currentNumberedSub.content
          : currentSection.content;

      container.push(p);
      lastParagraph = p;
      continue;
    }

    if (tag === "div" && classAttr.includes("box")) {
      if (!lastParagraph) continue;
      const isPraktijk = classAttr.includes("praktijk");
      const isVerdieping = classAttr.includes("verdieping");
      const pEl = node.querySelector("p");
      const inner = pEl ? stripBoxLabelHtml(pEl.innerHTML) : "";
      if (!inner) continue;
      if (isPraktijk && !lastParagraph.praktijk) lastParagraph.praktijk = inner;
      if (isVerdieping && !lastParagraph.verdieping) lastParagraph.verdieping = inner;
      continue;
    }

    if (includeImages && tag === "figure") {
      if (!lastParagraph) continue;
      const imgEl = node.querySelector("img");
      if (!imgEl) continue;
      const src = normalizeAssetPath(imgEl.getAttribute("src"));
      if (!src) continue;
      const alt = String(imgEl.getAttribute("alt") || "").trim();

      const capEl = node.querySelector("figcaption");
      const capText = normalizeWhitespace(capEl?.text || "");
      let figureNumber = "";
      let caption = capText;
      const m = capText.match(/Afbeelding\s+([0-9]+(?:\.[0-9]+)*)\s*:\s*(.*)$/i);
      if (m) {
        figureNumber = m[1] || "";
        caption = m[2] || "";
      }

      lastParagraph.images = Array.isArray(lastParagraph.images) ? lastParagraph.images : [];
      lastParagraph.images.push({
        src,
        alt,
        figureNumber: figureNumber || undefined,
        caption: caption || undefined,
      });
      continue;
    }
  }

  const canonical = {
    meta: {
      id: bookId,
      title,
      level,
    },
    chapters: [chapterObj],
    export: {
      exportedAt: new Date().toISOString(),
      source: "PASS2_PRINCE_HTML",
      schemaVersion: "1.0",
      note: "Extracted from canonical_book_PASS2.assembled_prince.html (chapter-only, small).",
    },
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(canonical, null, 2), "utf-8");
  console.log(`Wrote canonical JSON: ${outPath}`);
  console.log(`BookId: ${bookId}`);
  console.log(`Chapter extracted: ${chapterObj.title} (sections: ${chapterObj.sections.length})`);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ extract-pass2-canonical failed: ${msg}`);
  process.exit(1);
});


