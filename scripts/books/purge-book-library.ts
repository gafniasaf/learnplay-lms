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

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return typeof v === "string" && v.trim() ? v.trim() : null;
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
  if (!paths.length) {
    console.log(`[purge-book-library] Nothing found under ${opts.bucket}/${prefixClean}`);
    return;
  }

  console.log(`[purge-book-library] ${opts.bucket}/${prefixClean}: ${paths.length} object(s)`);
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
  const bookId = getArg("--bookId") || getArg("--book-id") || getArg("--only-book") || "";
  const yes = process.argv.includes("--yes");
  const dryRun = process.argv.includes("--dry-run");

  if (!bookId) {
    console.error("Usage: npx tsx scripts/books/purge-book-library.ts --bookId <bookId> [--yes] [--dry-run]");
    process.exit(1);
  }

  if (!yes && !dryRun) {
    console.error("BLOCKED: Destructive operation. Re-run with --yes (or --dry-run to preview).");
    process.exit(1);
  }

  const SUPABASE_URL = (() => {
    const v = process.env.VITE_SUPABASE_URL?.trim();
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Purge ONLY the library prefix for this book (images + images-index + any auxiliary).
  await removePrefix({ supabase, bucket: "books", prefix: `library/${bookId}`, dryRun });
  console.log("[purge-book-library] ✅ Done.");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ purge-book-library failed: ${msg}`);
  process.exit(1);
});

