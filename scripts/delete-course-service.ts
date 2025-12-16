#!/usr/bin/env tsx
/**
 * Delete a course using Supabase Service Role credentials (admin-only utility).
 *
 * This is intended for cleaning up demo/mock courses in dev projects.
 * It:
 * - Backs up courses/<id>/course.json to courses/_deleted/<id>/<timestamp>/course.json (best-effort)
 * - Removes courses/<id>/course.json (best-effort)
 * - Marks course_metadata.deleted_at (and clears archived_at if present)
 *
 * Usage:
 *   npx tsx scripts/delete-course-service.ts --courseId <id> --confirm <id>
 *
 * Required env vars (resolved from learnplay.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { loadLearnPlayEnv, parseLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return v ? String(v) : null;
}

function must(name: string, value: string | null): string {
  if (!value) {
    console.error(`❌ ${name} is REQUIRED`);
    process.exit(1);
  }
  return value;
}

async function main() {
  loadLearnPlayEnv();
  const env = parseLearnPlayEnv();

  let SUPABASE_URL = process.env.SUPABASE_URL;
  if (!SUPABASE_URL) SUPABASE_URL = env.SUPABASE_URL;

  let SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE) SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are REQUIRED (set env vars or populate learnplay.env)");
    process.exit(1);
  }

  const courseId = must("courseId", argValue("--courseId"));
  const confirm = must("confirm", argValue("--confirm"));
  if (confirm.trim() !== courseId.trim()) {
    console.error("❌ confirm must exactly match courseId");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const srcPath = `${courseId}/course.json`;
  const backupPath = `_deleted/${courseId}/${ts}/course.json`;

  console.log(`🧹 Deleting course: ${courseId}`);

  // Backup (best-effort)
  try {
    // @ts-ignore supabase-js Storage has copy in runtime
    const { error: copyErr } = await admin.storage.from("courses").copy(srcPath, backupPath);
    if (copyErr) {
      // Fallback: download + upload (still best-effort)
      const { data, error: dlErr } = await admin.storage.from("courses").download(srcPath);
      if (!dlErr && data) {
        const text = await data.text();
        const { error: upErr } = await admin.storage
          .from("courses")
          .upload(backupPath, new Blob([text], { type: "application/json" }), { upsert: true, contentType: "application/json" });
        if (upErr) {
          console.warn(`⚠️  Backup upload failed: ${upErr.message}`);
        }
      } else {
        console.warn(`⚠️  Backup skipped (download failed): ${dlErr?.message || "not found"}`);
      }
    }
  } catch (e) {
    console.warn(`⚠️  Backup skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Remove course.json (best-effort)
  try {
    const { error: rmErr } = await admin.storage.from("courses").remove([srcPath]);
    if (rmErr) {
      console.warn(`⚠️  Storage remove warning: ${rmErr.message}`);
    }
  } catch (e) {
    console.warn(`⚠️  Storage remove warning: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Mark deleted in metadata
  const { error: metaErr } = await admin
    .from("course_metadata")
    .update({ deleted_at: new Date().toISOString(), deleted_by: null, archived_at: null, archived_by: null })
    .eq("id", courseId);

  if (metaErr) {
    console.error(`❌ Failed to update course_metadata: ${metaErr.message}`);
    process.exit(1);
  }

  console.log(`✅ Deleted (soft) + storage cleaned. Backup path: courses/${backupPath}`);
}

main().catch((err) => {
  console.error("💥 Delete script failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});


