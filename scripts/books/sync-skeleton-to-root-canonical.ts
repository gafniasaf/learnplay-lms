import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { compileSkeletonToCanonical, validateBookSkeleton } from "../../src/lib/books/bookSkeletonCore.js";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(String(s || "").trim());
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  const bookVersionId = String(process.argv[3] || "").trim();
  if (!isUuid(bookId) || !isUuid(bookVersionId)) {
    console.error("Usage: npx tsx scripts/books/sync-skeleton-to-root-canonical.ts <bookId> <bookVersionId>");
    process.exit(1);
  }

  // Prefer VITE_SUPABASE_URL (frontend), fall back to SUPABASE_URL (backend). Not a silent fallback: requireEnv fails loud.
  const SUPABASE_URL = (() => {
    const v = process.env.VITE_SUPABASE_URL?.trim();
    if (v) return v.replace(/\/$/, "");
    return requireEnv("SUPABASE_URL").replace(/\/$/, "");
  })();
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
  const { data: skBlob, error: skErr } = await supabase.storage.from("books").download(skeletonPath);
  if (skErr || !skBlob) throw new Error(`BLOCKED: skeleton.json missing at ${skeletonPath}`);
  const skeleton = JSON.parse(await skBlob.text());

  const v = validateBookSkeleton(skeleton);
  if (!v.ok) {
    throw new Error(`BLOCKED: skeleton invalid: ${v.issues.slice(0, 3).map((i: any) => i.message).join("; ")}`);
  }

  const canonical = compileSkeletonToCanonical(skeleton);
  const rootCanonicalPath = `${bookId}/${bookVersionId}/canonical.json`;
  const blob = new Blob([JSON.stringify(canonical, null, 2)], { type: "application/json" });
  const { error: upErr } = await supabase.storage.from("books").upload(rootCanonicalPath, blob, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "no-cache",
  });
  if (upErr) throw new Error(upErr.message);

  console.log("✅ Synced skeleton → canonical.json at", rootCanonicalPath);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ sync-skeleton-to-root-canonical failed: ${msg}`);
  process.exit(1);
});


