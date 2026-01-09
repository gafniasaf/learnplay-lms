import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { renderBookHtml, runPrince } from "../../book-worker/lib/bookRenderer.js";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return String(v).trim();
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(String(s || "").trim());
}

async function downloadJson(supabase: any, bucket: string, filePath: string): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error || !data) throw new Error(error?.message || `Failed to download ${bucket}/${filePath}`);
  const text = await data.text();
  if (!text) throw new Error(`BLOCKED: Empty JSON file at ${bucket}/${filePath}`);
  return JSON.parse(text);
}

async function openFileBestEffort(filePath: string): Promise<void> {
  if (process.platform !== "win32") return;
  const ps = [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Start-Process -FilePath '${String(filePath).replace(/'/g, "''")}'`,
  ];
  const child = spawn("powershell", ps, { stdio: "ignore" });
  child.on("error", () => {});
}

async function main(): Promise<void> {
  const bookId = String(process.argv[2] || "").trim();
  const bookVersionId = String(process.argv[3] || "").trim();
  const chapterNumberRaw = String(process.argv[4] || "8").trim();
  const chapterNumber = Number(chapterNumberRaw);
  if (!isUuid(bookId) || !isUuid(bookVersionId) || !Number.isFinite(chapterNumber) || chapterNumber < 1) {
    console.error("Usage: npx tsx scripts/books/render-chapter-local.ts <bookId> <bookVersionId> <chapterNumber(1-based)>");
    process.exit(1);
  }

  // Required env (no fallbacks).
  const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  // runPrince() resolves PRINCE_PATH internally.
  requireEnv("PRINCE_PATH");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: versionRow, error: verErr } = await supabase
    .from("book_versions")
    .select("canonical_path")
    .eq("book_id", bookId)
    .eq("book_version_id", bookVersionId)
    .maybeSingle();
  if (verErr) throw new Error(verErr.message);

  const canonicalPath = typeof (versionRow as any)?.canonical_path === "string" ? String((versionRow as any).canonical_path).trim() : "";
  if (!canonicalPath) {
    throw new Error("BLOCKED: book_versions.canonical_path is missing for this version");
  }

  const canonical = await downloadJson(supabase, "books", canonicalPath);

  const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
  const chapterIndex = Math.floor(chapterNumber - 1);
  if (!chapters[chapterIndex]) {
    throw new Error(`BLOCKED: canonical has no chapter at index ${chapterIndex} (chapter ${chapterNumber}). chapters=${chapters.length}`);
  }

  // Placeholder-only: avoids depending on assets.zip / image library while still producing a useful PDF.
  const html = renderBookHtml(canonical, {
    target: "chapter",
    chapterIndex,
    placeholdersOnly: true,
    // Ensure opener never depends on local assets.
    chapterOpeners: { [chapterIndex]: `placeholder://chapter-opener/ch${chapterNumber}` },
  });

  const outDir = path.join(process.cwd(), "tmp", "local-renders", "chapters", bookId, bookVersionId);
  await mkdir(outDir, { recursive: true });

  const htmlPath = path.join(outDir, `chapter-${chapterNumber}.html`);
  const pdfPath = path.join(outDir, `chapter-${chapterNumber}.pdf`);
  const logPath = path.join(outDir, `chapter-${chapterNumber}.prince.log`);

  await writeFile(htmlPath, html, "utf8");
  await runPrince({ htmlPath, pdfPath, logPath });

  console.log(`Saved PDF: ${pdfPath}`);
  await openFileBestEffort(pdfPath);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ render-chapter-local failed: ${msg}`);
  process.exit(1);
});


