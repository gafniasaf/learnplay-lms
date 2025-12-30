import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "node-html-parser";
import { existsSync } from "node:fs";

function argValue(flag, { argv } = {}) {
  const a = argv || process.argv.slice(2);
  const idx = a.indexOf(flag);
  if (idx === -1) return null;
  const v = a[idx + 1];
  if (!v || v.startsWith("--")) return "true";
  return v;
}

function normalizeAssetPath(src) {
  const s = String(src || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:/i.test(s)) return s;
  if (/^file:\/\//i.test(s)) return s;
  const idx = s.toLowerCase().lastIndexOf("/assets/");
  if (idx >= 0) return s.slice(idx + "/assets/".length).replace(/^\/+/, "");
  // keep relative
  if (s.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(s)) return null;
  return s.replace(/^\/+/, "");
}

function basenameLike(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  const parts = v.split(/[\\/]/g);
  return parts.length ? String(parts[parts.length - 1] || "").trim() : v;
}

function safeOutName(inPath, suffix) {
  const p = path.parse(inPath);
  return path.join(p.dir, `${p.name}.${suffix}${p.ext}`);
}

function findExisting(candidates, { fileSet }) {
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

async function maybeExtractFromZip({ zipPath, bookSlug, fileName, destDir }) {
  if (!zipPath) return false;
  if (!existsSync(zipPath)) return false;

  // Use python's zipfile via a tiny subprocess to avoid adding JS zip deps.
  // We only extract one file at a time.
  const { spawnSync } = await import("node:child_process");
  const dest = path.join(destDir, fileName);
  const py = [
    "-c",
    [
      "import zipfile, os, sys",
      "zip_path=sys.argv[1]",
      "book=sys.argv[2]",
      "name=sys.argv[3]",
      "dest=sys.argv[4]",
      "os.makedirs(os.path.dirname(dest), exist_ok=True)",
      "z=zipfile.ZipFile(zip_path,'r')",
      "cands=[",
      " f'extracted_images/{book}/linked_images/{name}',",
      " f'extracted_images/{book}/chapter_openers/{name}',",
      " f'extracted_images/{book}/embedded_figures/{name}',",
      "]",
      "found=None",
      "for c in cands:",
      "  try:",
      "    z.getinfo(c)",
      "    found=c",
      "    break",
      "  except KeyError:",
      "    pass",
      "if not found:",
      "  sys.exit(2)",
      "with z.open(found) as src, open(dest,'wb') as out:",
      "  out.write(src.read())",
      "sys.exit(0)",
    ].join("\n"),
    zipPath,
    bookSlug,
    fileName,
    dest,
  ];

  const res = spawnSync("python", py, { stdio: "ignore" });
  return res.status === 0;
}

async function main() {
  const inputPath = argValue("--in") || "canonical_book_PASS2.assembled_prince.html";
  const outPath = argValue("--out") || safeOutName(path.join("tmp", "pass2", "pass2.patched"), "html");
  const bookSlug = argValue("--book") || "af_n3";
  const chapterRaw = argValue("--chapter");
  const chapterNo = chapterRaw ? Number(chapterRaw) : null; // 1-based
  const zipPath = argValue("--zip") || "extracted_images.zip";

  const imagesDir = path.join("books", bookSlug, "images");
  if (!existsSync(imagesDir)) {
    throw new Error(`BLOCKED: missing local images dir: ${imagesDir}`);
  }

  const html = await fs.readFile(inputPath, "utf-8");
  const root = parse(html);

  // Keep only one chapter if requested (1-based)
  if (Number.isFinite(chapterNo) && chapterNo && chapterNo > 0) {
    const chapters = root.querySelectorAll("div.chapter");
    const idx = chapterNo - 1;
    chapters.forEach((ch, i) => {
      if (i !== idx) ch.remove();
    });
    // Remove TOC for chapter-only render
    root.querySelectorAll(".toc").forEach((n) => n.remove());
  }

  const files = await fs.readdir(imagesDir);
  const fileSet = new Set(files);

  const unresolved = [];
  const rewritten = [];

  const imgEls = root.querySelectorAll("img");
  for (const img of imgEls) {
    const src = String(img.getAttribute("src") || "").trim();
    if (!src) continue;
    const rel = normalizeAssetPath(src) || src;
    const base = basenameLike(rel);
    if (!base) continue;

    // Try exact match first, then extension fallbacks.
    const parsed = path.parse(base);
    const stem = parsed.name; // without ext
    const ext = parsed.ext.toLowerCase();
    const candidates = [
      base,
      // common swaps
      `${stem}.png`,
      `${stem}.jpg`,
      `${stem}.jpeg`,
      `${stem}.tif`,
      `${stem}.tiff`,
      `${stem}.psd`,
      // some books use Ch01 vs Ch1 in file names; try a minimal normalization
      base.replace(/Ch0(\d)_/g, "Ch$1_"),
      base.replace(/Ch(\d)_/g, (m, d) => `Ch0${d}_`),
    ].filter(Boolean);

    let resolved = findExisting(candidates, { fileSet });

    if (!resolved) {
      // Try extracting from zip (chapter_openers etc.)
      const extracted = await maybeExtractFromZip({ zipPath, bookSlug, fileName: base, destDir: imagesDir });
      if (extracted) {
        fileSet.add(base);
        resolved = base;
      } else {
        // Try extracting with candidate names
        for (const c of candidates) {
          const ok = await maybeExtractFromZip({ zipPath, bookSlug, fileName: c, destDir: imagesDir });
          if (ok) {
            fileSet.add(c);
            resolved = c;
            break;
          }
        }
      }
    }

    if (!resolved) {
      unresolved.push({ src, rel, base });
      continue;
    }

    const newSrc = path.posix.join("books", bookSlug, "images", resolved).replace(/\\/g, "/");
    if (newSrc !== src) {
      img.setAttribute("src", newSrc);
      rewritten.push({ from: src, to: newSrc });
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, root.toString(), "utf-8");

  const reportPath = safeOutName(outPath, "report.json");
  await fs.writeFile(reportPath, JSON.stringify({ inputPath, outPath, bookSlug, chapterNo, rewrittenCount: rewritten.length, unresolved }, null, 2), "utf-8");

  console.log(`[OK] wrote ${outPath}`);
  console.log(`[OK] report ${reportPath}`);
  console.log(`[OK] rewritten ${rewritten.length}`);
  console.log(`[OK] unresolved ${unresolved.length}`);
  if (unresolved.length) {
    console.log("[WARN] unresolved examples:", unresolved.slice(0, 10).map((u) => u.base).join(", "));
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[ERR] ${msg}`);
  process.exit(1);
});


