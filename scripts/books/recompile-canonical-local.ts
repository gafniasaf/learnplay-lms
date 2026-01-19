import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { compileSkeletonToCanonical } from "../../src/lib/books/bookSkeletonCore.js";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function requireId(name: string, raw: unknown): string {
  const v = String(raw || "").trim();
  if (!v) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const bookId = requireId("bookId", process.argv[2]);
  const bookVersionId = requireId("bookVersionId", process.argv[3]);

  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL) {
    console.error("BLOCKED: SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;

  const { data: blob, error: dlErr } = await supabase.storage.from("books").download(skeletonPath);
  if (dlErr || !blob) {
    throw new Error(dlErr?.message || `BLOCKED: failed to download ${skeletonPath}`);
  }
  const skeleton = JSON.parse(await blob.text());

  const compiled = compileSkeletonToCanonical(skeleton);
  const compiledText = JSON.stringify(compiled, null, 2);
  const compiledPath = `books/${bookId}/${bookVersionId}/compiled_canonical.json`;

  const { data: version, error: verErr } = await supabase
    .from("book_versions")
    .select("canonical_path, compiled_canonical_path")
    .eq("book_id", bookId)
    .eq("book_version_id", bookVersionId)
    .single();

  if (verErr || !version) {
    throw new Error(verErr?.message || "BLOCKED: book version not found");
  }

  const canonicalPath = String(version.canonical_path || "").trim();
  if (!canonicalPath) {
    throw new Error("BLOCKED: canonical_path is empty for this book version");
  }

  const recapCount = Array.isArray(skeleton?.chapters)
    ? skeleton.chapters.filter((ch: any) => ch?.recap && typeof ch.recap === "object").length
    : 0;

  const { error: upCompiledErr } = await supabase.storage.from("books").upload(
    compiledPath,
    new Blob([compiledText], { type: "application/json" }),
    { upsert: true, contentType: "application/json" },
  );
  if (upCompiledErr) throw new Error(upCompiledErr.message);

  const { error: upCanonErr } = await supabase.storage.from("books").upload(
    canonicalPath,
    new Blob([compiledText], { type: "application/json" }),
    { upsert: true, contentType: "application/json" },
  );
  if (upCanonErr) throw new Error(upCanonErr.message);

  const { error: updateErr } = await supabase
    .from("book_versions")
    .update({ compiled_canonical_path: compiledPath })
    .eq("book_id", bookId)
    .eq("book_version_id", bookVersionId);

  if (updateErr) throw new Error(updateErr.message);

  console.log(JSON.stringify({ ok: true, recapCount, compiledPath, canonicalPath }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ recompile-canonical-local failed: ${msg}`);
  process.exit(1);
});
