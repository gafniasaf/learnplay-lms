import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function parseArgs(argv: string[]) {
  const keepIdx = argv.indexOf("--keep");
  const keepBookId = keepIdx >= 0 && argv[keepIdx + 1] ? String(argv[keepIdx + 1]).trim() : "";
  const yes = argv.includes("--yes");
  const dryRun = argv.includes("--dry-run");
  return { keepBookId, yes, dryRun };
}

async function listAllPathsUnderPrefix(opts: { supabase: any; bucket: string; prefix: string }): Promise<string[]> {
  // Supabase Storage "list" is not truly recursive; folders show up as entries without metadata.
  // We recurse into any entry that looks like a folder (no id/metadata).
  const out: string[] = [];
  const seen = new Set<string>();

  const walk = async (dir: string) => {
    const key = `${opts.bucket}:${dir}`;
    if (seen.has(key)) return;
    seen.add(key);

    const { data, error } = await opts.supabase.storage.from(opts.bucket).list(dir, { limit: 1000 });
    if (error) {
      throw new Error(`Storage list failed for '${opts.bucket}/${dir}': ${error.message}`);
    }
    const items: any[] = Array.isArray(data) ? data : [];
    for (const it of items) {
      const name = typeof it?.name === "string" ? it.name.trim() : "";
      if (!name) continue;
      const looksLikeFolder = !it?.id && !it?.metadata;
      const next = dir ? `${dir}/${name}` : name;
      if (looksLikeFolder) {
        await walk(next);
      } else {
        out.push(next);
      }
    }
  };

  await walk(opts.prefix.replace(/\/+$/g, ""));
  return out;
}

async function removePrefix(opts: { supabase: any; bucket: string; prefix: string; dryRun: boolean }) {
  const prefixClean = String(opts.prefix || "").replace(/^\/+|\/+$/g, "");
  if (!prefixClean) return;
  const paths = await listAllPathsUnderPrefix({ supabase: opts.supabase, bucket: opts.bucket, prefix: prefixClean });
  if (!paths.length) return;

  console.log(`  - ${opts.bucket}/${prefixClean}: ${paths.length} object(s)`);
  if (opts.dryRun) return;

  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { error } = await opts.supabase.storage.from(opts.bucket).remove(chunk);
    if (error) {
      throw new Error(`Storage remove failed for '${opts.bucket}/${prefixClean}' (batch ${i}-${i + chunk.length - 1}): ${error.message}`);
    }
  }
}

async function main() {
  const { keepBookId, yes, dryRun } = parseArgs(process.argv.slice(2));
  if (!keepBookId || !/^[0-9a-f-]{36}$/i.test(keepBookId)) {
    console.error("Usage: npx tsx scripts/books/purge-books-except.ts --keep <bookId> [--yes] [--dry-run]");
    process.exit(1);
  }

  // Prefer VITE_SUPABASE_URL (frontend), fall back to SUPABASE_URL (backend). Not a silent fallback: requireEnv fails loud.
const SUPABASE_URL = (() => {
  const v = process.env.VITE_SUPABASE_URL?.trim();
  if (v) return v.replace(/\/$/, "");
  return requireEnv("SUPABASE_URL").replace(/\/$/, "");
})();
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: allBooks, error: booksErr } = await supabase
    .from("books")
    .select("id, title, created_at")
    .eq("organization_id", ORG_ID)
    .order("created_at", { ascending: true });
  if (booksErr) throw new Error(`Failed to list books: ${booksErr.message}`);

  const books = Array.isArray(allBooks) ? allBooks : [];
  const keep = books.find((b: any) => String(b?.id || "") === keepBookId) || null;
  if (!keep) {
    const sample = books.slice(0, 10).map((b: any) => ({ id: b.id, title: b.title }));
    throw new Error(
      `BLOCKED: keep bookId not found in org.\n` +
        `Provided keepBookId=${keepBookId}\n` +
        `First books in org: ${JSON.stringify(sample)}`,
    );
  }

  const toDelete = books.filter((b: any) => String(b?.id || "") !== keepBookId);
  console.log(`[purge-books-except] Org=${ORG_ID}`);
  console.log(`[purge-books-except] KEEP: ${keepBookId} — ${String((keep as any).title || "").trim()}`);
  console.log(`[purge-books-except] Will delete ${toDelete.length} other book(s)${dryRun ? " (DRY-RUN)" : ""}.`);
  if (toDelete.length) {
    console.log(
      toDelete
        .slice(0, 25)
        .map((b: any) => `  - ${b.id} — ${String(b.title || "").trim()}`)
        .join("\n"),
    );
    if (toDelete.length > 25) console.log(`  … +${toDelete.length - 25} more`);
  }

  if (!toDelete.length) {
    console.log("[purge-books-except] Nothing to delete.");
    return;
  }

  if (!yes && !dryRun) {
    throw new Error("BLOCKED: Destructive operation. Re-run with --yes to proceed.");
  }

  const ids = toDelete.map((b: any) => String(b.id));

  // 1) Delete DB rows (cascades book_versions, book_render_jobs, artifacts, controls, overlays, etc.)
  console.log("[purge-books-except] Deleting DB rows…");
  if (!dryRun) {
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const { error } = await supabase.from("books").delete().eq("organization_id", ORG_ID).in("id", batch);
      if (error) throw new Error(`DB delete failed (batch ${i}-${i + batch.length - 1}): ${error.message}`);
    }
  }

  // 2) Delete storage objects for each deleted book (best-effort full cleanup).
  console.log("[purge-books-except] Deleting Storage objects…");
  for (const bookId of ids) {
    // Note: historical data may exist under multiple conventions.
    // - `${bookId}/...` (canonical + older artifacts)
    // - `books/${bookId}/...` (skeleton-first + render artifacts)
    // - `library/${bookId}/...` (image library)
    if (dryRun) console.log(`- bookId=${bookId}`);
    await removePrefix({ supabase, bucket: "books", prefix: `${bookId}`, dryRun });
    await removePrefix({ supabase, bucket: "books", prefix: `books/${bookId}`, dryRun });
    await removePrefix({ supabase, bucket: "books", prefix: `library/${bookId}`, dryRun });
  }

  console.log("[purge-books-except] ✅ Done. Only the kept book should remain in the monitor dropdown.");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ purge-books-except failed: ${msg}`);
  process.exit(1);
});


