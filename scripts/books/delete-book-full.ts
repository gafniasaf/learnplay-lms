import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env.js";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  if (!bookId || !/^[0-9a-f-]{36}$/i.test(bookId)) {
    console.error("Usage: npx tsx scripts/books/delete-book-full.ts <bookId>");
    process.exit(1);
  }

  const SUPABASE_URL = (() => {
    const v = process.env.VITE_SUPABASE_URL?.trim();
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1. Delete book row (cascades to versions, runs, jobs, artifacts via FK)
  console.log(`Deleting book ${bookId} from DB...`);
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) throw new Error(error.message);
  console.log("✅ DB rows deleted.");

  // 2. Delete storage objects (multiple possible prefixes)
  console.log("Deleting storage objects...");
  const prefixes = [
    `${bookId}/`,
    `books/${bookId}/`,
  ];

  for (const prefix of prefixes) {
    let deleted = 0;
    let offset = 0;
    while (true) {
      const { data: files, error: listErr } = await supabase.storage
        .from("books")
        .list(prefix, { limit: 100, offset });

      if (listErr || !files || files.length === 0) break;

      const paths = files
        .filter((f) => f.name !== ".emptyFolderPlaceholder")
        .map((f) => prefix + f.name);

      if (paths.length) {
        const { error: rmErr } = await supabase.storage.from("books").remove(paths);
        if (rmErr) console.error("  Remove error:", rmErr.message);
        else deleted += paths.length;
      }

      if (files.length < 100) break;
      offset += 100;
    }
    if (deleted > 0) console.log(`  Removed ${deleted} objects from ${prefix}`);
  }

  console.log("✅ Done.");
}

main().catch((e) => {
  console.error("❌ delete-book-full failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

