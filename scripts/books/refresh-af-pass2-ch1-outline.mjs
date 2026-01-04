/**
 * Refresh the PASS2 Chapter 1 outline skeleton fixture from the extracted PASS2 baseline skeleton.
 *
 * Why:
 * - We want *exactly* the same chapter/section/subparagraph numbering as the reference PASS2 document.
 * - The generated fixture is STRUCTURE ONLY (no PASS2 prose), suitable for seeding BookGen runs.
 *
 * Prereq:
 * - Run `node scripts/books/compare-pass2-baseline-ch1.mjs` once to generate:
 *   - tmp/baseline-pass2/af-pass2.chapter1.skeleton.json
 *
 * Output:
 * - scripts/books/fixtures/af-pass2-ch1-outline.skeleton.json
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

function normalizeWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isNumberedSubTitle(t) {
  return /^\d+(?:\.\d+){2,}\s+/.test(normalizeWs(t));
}

function requireFile(p) {
  if (!fs.existsSync(p)) {
    throw new Error(
      `BLOCKED: Missing baseline skeleton at ${p}. Run: node scripts/books/compare-pass2-baseline-ch1.mjs`,
    );
  }
}

function buildOutlineSkeletonFromBaseline(baseline) {
  const ch0 = Array.isArray(baseline?.chapters) ? baseline.chapters[0] : null;
  if (!ch0) throw new Error("BLOCKED: baseline skeleton has no chapters[0]");

  const sectionsIn = Array.isArray(ch0?.sections) ? ch0.sections : [];
  if (!sectionsIn.length) throw new Error("BLOCKED: baseline skeleton chapters[0] has no sections");

  let seedParaCounter = 0;
  const mkEmptyParagraph = () => ({
    type: "paragraph",
    id: `seed-p-${String(++seedParaCounter).padStart(4, "0")}`,
    basisHtml: "",
    images: null,
  });

  const outSections = sectionsIn.map((sec) => {
    const sid = normalizeWs(sec?.id);
    const st = normalizeWs(sec?.title);
    if (!sid) throw new Error("BLOCKED: baseline section is missing id");
    if (!st) throw new Error(`BLOCKED: baseline section '${sid}' is missing title`);

    const blocksIn = Array.isArray(sec?.blocks) ? sec.blocks : [];
    const numberedSubs = blocksIn
      .filter((b) => b && typeof b === "object" && b.type === "subparagraph" && isNumberedSubTitle(b.title))
      .map((b) => ({
        type: "subparagraph",
        id: normalizeWs(b.id) || null,
        title: normalizeWs(b.title),
        // Minimal placeholder content; BookGen will overwrite this entire section anyway.
        blocks: [mkEmptyParagraph()],
      }));

    if (!numberedSubs.length) {
      throw new Error(`BLOCKED: baseline section '${sid}' has no numbered subparagraphs`);
    }

    return {
      id: sid,
      title: st,
      blocks: numberedSubs,
    };
  });

  return {
    meta: {
      bookId: "__BOOK_ID__",
      bookVersionId: "__BOOK_VERSION_ID__",
      title: "A&F PASS2 baseline outline — Hoofdstuk 1: De cel",
      level: "n4",
      language: "nl",
      schemaVersion: "skeleton_v1",
    },
    styleProfile: null,
    chapters: [
      {
        id: normalizeWs(ch0?.id) || "ch-1",
        number: typeof ch0?.number === "number" ? ch0.number : 1,
        title: normalizeWs(ch0?.title) || "1. De cel",
        openerImageSrc: null,
        sections: outSections,
      },
    ],
  };
}

async function main() {
  const root = process.cwd();
  const inPath = path.join(root, "tmp", "baseline-pass2", "af-pass2.chapter1.skeleton.json");
  const outPath = path.join(root, "scripts", "books", "fixtures", "af-pass2-ch1-outline.skeleton.json");

  requireFile(inPath);

  const baseline = JSON.parse(await fsp.readFile(inPath, "utf8"));
  const outline = buildOutlineSkeletonFromBaseline(baseline);

  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, JSON.stringify(outline, null, 2) + "\n", "utf8");
  console.log(`[OK] Wrote outline fixture: ${path.relative(root, outPath)}`);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ refresh-af-pass2-ch1-outline failed: ${msg}`);
  process.exit(1);
});

