#!/usr/bin/env node
/**
 * Bulk migration: convert all existing canonical.json to skeleton v1, validate, compile, and upload.
 *
 * Usage: node scripts/books/bulk-skeleton-migration.mjs [--dry-run] [--limit N] [--book-id BOOK_ID]
 *
 * Flags:
 *   --dry-run        Print what would be done without making changes
 *   --limit N        Process only the first N book versions (for testing)
 *   --book-id ID     Process only a specific book
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { canonicalToSkeleton, validateBookSkeleton, compileSkeletonToCanonical } from "../../src/lib/books/bookSkeletonCore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// Load env files
// Secrets & Env Resolution (MANDATORY): process.env → supabase/.deploy.env → learnplay.env → .env*
const envFiles = [
  "supabase/.deploy.env",
  "learnplay.env",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.factory",
];
for (const envFile of envFiles) {
  const p = path.join(ROOT, envFile);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawVal] = match;
      if (process.env[key]) continue;
      let val = rawVal;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("BLOCKED: SUPABASE_URL is REQUIRED");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error("BLOCKED: SUPABASE_SERVICE_ROLE_KEY is REQUIRED");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -------------------------------------------------------------------
// Main migration
// -------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : null;
  const bookIdIdx = args.indexOf("--book-id");
  const filterBookId = bookIdIdx >= 0 && args[bookIdIdx + 1] ? args[bookIdIdx + 1] : null;

  console.log(`[bulk-skeleton-migration] Starting (dryRun=${dryRun}, limit=${limit}, bookId=${filterBookId})`);

  // Fetch all book versions that don't have skeleton_path yet
  let query = supabase
    .from("book_versions")
    .select("book_id, book_version_id, canonical_path, skeleton_path, authoring_mode")
    .is("skeleton_path", null)
    .order("created_at", { ascending: true });

  if (filterBookId) {
    query = query.eq("book_id", filterBookId);
  }
  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const { data: versions, error: versionsErr } = await query;
  if (versionsErr) {
    console.error("BLOCKED: Failed to fetch book versions:", versionsErr.message);
    process.exit(1);
  }

  console.log(`[bulk-skeleton-migration] Found ${versions?.length || 0} book version(s) to migrate`);

  const results = { success: 0, skipped: 0, failed: 0, errors: [] };

  for (const v of versions || []) {
    const { book_id: bookId, book_version_id: bookVersionId, canonical_path: canonicalPath } = v;

    if (!canonicalPath) {
      console.warn(`  [SKIP] ${bookId}/${bookVersionId}: missing canonical_path`);
      results.skipped++;
      continue;
    }

    console.log(`  [PROCESS] ${bookId}/${bookVersionId}`);

    try {
      // 1) Download canonical
      const { data: canonBlob, error: dlErr } = await supabase.storage.from("books").download(canonicalPath);
      if (dlErr || !canonBlob) {
        throw new Error(`Download failed: ${dlErr?.message || "no blob"}`);
      }
      const canonText = await canonBlob.text();
      const canonical = JSON.parse(canonText);

      // 2) Convert to skeleton
      const skeleton = canonicalToSkeleton(canonical, { bookId, bookVersionId });

      // 3) Validate
      const validation = validateBookSkeleton(skeleton);
      if (!validation.ok) {
        throw new Error(`Validation failed: ${validation.issues.slice(0, 3).map((i) => i.message).join("; ")}`);
      }

      // 4) Compile back to canonical (for verification)
      const compiled = compileSkeletonToCanonical(skeleton);

      if (dryRun) {
        console.log(`    [DRY-RUN] Would upload snapshot + skeleton + compiled and update DB for ${bookId}/${bookVersionId}`);
        results.success++;
        continue;
      }

      const skeletonText = JSON.stringify(skeleton, null, 2);
      const compiledText = JSON.stringify(compiled, null, 2);

      // 5) Upload immutable snapshot (append-only history)
      const snapshotPath = `books/${bookId}/${bookVersionId}/skeleton-versions/${Date.now()}.json`;
      const snapshotBlob = new Blob([skeletonText], { type: "application/json" });
      const { error: snapUploadErr } = await supabase.storage.from("books").upload(snapshotPath, snapshotBlob, {
        upsert: false,
        contentType: "application/json",
      });
      if (snapUploadErr) {
        throw new Error(`Snapshot upload failed: ${snapUploadErr.message}`);
      }

      // 6) Upload skeleton (mutable latest pointer)
      const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
      const skeletonBlob = new Blob([skeletonText], { type: "application/json" });
      const { error: skUploadErr } = await supabase.storage.from("books").upload(skeletonPath, skeletonBlob, { upsert: true, contentType: "application/json" });
      if (skUploadErr) {
        throw new Error(`Skeleton upload failed: ${skUploadErr.message}`);
      }

      // 7) Upload compiled canonical (deterministic)
      const compiledPath = `books/${bookId}/${bookVersionId}/compiled_canonical.json`;
      const compiledBlob = new Blob([compiledText], { type: "application/json" });
      const { error: compileUploadErr } = await supabase.storage.from("books").upload(compiledPath, compiledBlob, { upsert: true, contentType: "application/json" });
      if (compileUploadErr) {
        throw new Error(`Compiled canonical upload failed: ${compileUploadErr.message}`);
      }

      // 8) Insert immutable history row
      const { error: histErr } = await supabase.from("book_skeleton_versions").insert({
        book_id: bookId,
        book_version_id: bookVersionId,
        snapshot_path: snapshotPath,
        created_by: null,
        note: "Bulk migration: canonical → skeleton_v1",
      });
      if (histErr) {
        throw new Error(`History insert failed: ${histErr.message}`);
      }

      // 9) Update book_versions pointers
      const { error: updateErr } = await supabase
        .from("book_versions")
        .update({
          skeleton_path: skeletonPath,
          compiled_canonical_path: compiledPath,
          authoring_mode: "skeleton",
          skeleton_schema_version: "skeleton_v1",
        })
        .eq("book_id", bookId)
        .eq("book_version_id", bookVersionId);

      if (updateErr) {
        throw new Error(`DB update failed: ${updateErr.message}`);
      }

      console.log(`    [OK] Migrated ${bookId}/${bookVersionId}`);
      results.success++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`    [FAILED] ${bookId}/${bookVersionId}: ${msg}`);
      results.failed++;
      results.errors.push({ bookId, bookVersionId, error: msg });
    }
  }

  console.log("\n=== MIGRATION COMPLETE ===");
  console.log(`Success: ${results.success}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    const reportPath = path.join(ROOT, "tmp", "skeleton-migration-errors.json");
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(results.errors, null, 2), "utf8");
    console.log(`\nError report saved to: ${reportPath}`);
  }
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});

