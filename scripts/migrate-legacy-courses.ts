#!/usr/bin/env tsx
/**
 * Migrate legacy course storage layout to IgniteZero canonical layout.
 *
 * Legacy:
 *   - Storage: courses/<id>.json
 * Canonical:
 *   - Storage: courses/<id>/course.json (envelope: { id, format, version, content })
 *   - DB:     course_metadata upserted by Edge Function save-course
 *
 * This script:
 * - Lists root files in the `courses` bucket
 * - Finds legacy `*.json` course files (excluding catalog.json)
 * - Normalizes course JSON into a practice envelope (including nested proto schema -> items[])
 * - Calls Edge Function `save-course` (agent-token auth) to persist canonical layout + metadata
 * - Optionally deletes the legacy files and/or legacy catalog.json
 *
 * Usage:
 *   npx tsx scripts/migrate-legacy-courses.ts --apply --delete-legacy --delete-catalog
 *
 * Required env vars (resolved from learnplay.env via tests/helpers/parse-learnplay-env.ts):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (to list/download/remove legacy storage files)
 *   SUPABASE_ANON_KEY           (or VITE_SUPABASE_PUBLISHABLE_KEY)
 *   AGENT_TOKEN                 (for save-course)
 *   ORGANIZATION_ID             (stamped into migrated content for multi-tenant scoping)
 *
 * IMPORTANT: This script never prints secret values.
 */

import { createClient } from "@supabase/supabase-js";
import { loadLearnPlayEnv, parseLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

type Envelope = {
  id: string;
  format: string;
  version?: string | number;
  content: any;
};

function isEnvelope(x: any): x is Envelope {
  return !!x && typeof x === "object" && "content" in x && "format" in x;
}

function mustEnv(name: string, fromFile?: string): string {
  const v = process.env[name] || fromFile;
  if (!v) {
    console.error(`❌ ${name} is REQUIRED - set env var or populate learnplay.env`);
    process.exit(1);
  }
  return v;
}

function coerceCorrectIndex(options: string[], correct: unknown): number {
  const correctStr = typeof correct === "string" ? correct : typeof correct === "number" ? String(correct) : "";
  if (!correctStr) return 0;
  const exact = options.indexOf(correctStr);
  if (exact >= 0) return exact;
  const lowered = options.map((o) => o.toLowerCase());
  const idx = lowered.indexOf(correctStr.toLowerCase());
  return idx >= 0 ? idx : 0;
}

function normalizeToEnvelope(courseId: string, raw: any, organizationId: string): { envelope: Envelope; migrated: boolean } {
  if (isEnvelope(raw)) {
    // Stamp org scoping if missing
    if (raw?.content && typeof raw.content === "object") {
      (raw.content as any).organizationId = (raw.content as any).organizationId || organizationId;
      (raw.content as any).visibility = (raw.content as any).visibility || "org";
    }
    return { envelope: raw, migrated: false };
  }

  // Legacy practice course shape (already playable): { id, title, groups, levels, items }
  if (raw && typeof raw === "object" && Array.isArray(raw.items)) {
    const content = { ...(raw as any) };
    content.id = typeof content.id === "string" ? content.id : courseId;
    content.organizationId = content.organizationId || content.organization_id || organizationId;
    content.visibility = content.visibility || "org";
    return {
      envelope: { id: content.id, format: String((raw as any).format ?? "practice"), version: (raw as any).version ?? 1, content },
      migrated: true,
    };
  }

  // Nested proto schema (seen in earlier generator runs)
  // { title, description, grade_band, levels:[{ level, groups:[{ group, items:[{ stem, options, correct_answer, explanation }]}]}] }
  if (raw && typeof raw === "object" && Array.isArray((raw as any).levels)) {
    const nested = raw as any;
    const id = typeof nested.id === "string" ? nested.id : courseId;
    const title = typeof nested.title === "string" ? nested.title : id;

    const groupIds = new Set<number>();
    const items: any[] = [];
    let nextId = 1;

    for (const lvl of nested.levels || []) {
      for (const g of lvl?.groups || []) {
        const gid = typeof g?.group === "number" ? g.group : 0;
        groupIds.add(gid);
        for (const it of g?.items || []) {
          const options = Array.isArray(it?.options) ? it.options.map((x: any) => String(x)) : [];
          const idNum = nextId++;
          items.push({
            id: idNum,
            groupId: gid,
            text: typeof it?.stem === "string" ? it.stem : "",
            explain: typeof it?.explanation === "string" ? it.explanation : "",
            clusterId: `${id}-g${gid}-i${idNum}`,
            variant: "1",
            mode: "options",
            options,
            correctIndex: coerceCorrectIndex(options, it?.correct_answer),
          });
        }
      }
    }

    if (items.length === 0) {
      throw new Error(`Course '${courseId}' is not playable: nested schema contained no items.`);
    }

    const groups = Array.from(groupIds)
      .sort((a, b) => a - b)
      .map((gid) => ({ id: gid, name: `Group ${gid}` }));

    const levels = (nested.levels || [])
      .map((lvl: any) => {
        const idNum = typeof lvl?.level === "number" ? lvl.level : undefined;
        const groupNums = (lvl?.groups || [])
          .map((gg: any) => (typeof gg?.group === "number" ? gg.group : null))
          .filter((x: any) => typeof x === "number") as number[];
        const start = groupNums.length ? Math.min(...groupNums) : 0;
        const end = groupNums.length ? Math.max(...groupNums) : 0;
        return idNum ? { id: idNum, title: `Level ${idNum}`, start, end } : null;
      })
      .filter(Boolean) as Array<{ id: number; title: string; start: number; end: number }>;

    const finalLevels =
      levels.length > 0
        ? levels
        : [
            {
              id: 1,
              title: "All Content",
              start: Math.min(...Array.from(groupIds)),
              end: Math.max(...Array.from(groupIds)),
            },
          ];

    const practiceCourse = {
      id,
      title,
      description: typeof nested.description === "string" ? nested.description : undefined,
      contentVersion: typeof nested.contentVersion === "string" ? nested.contentVersion : undefined,
      groups,
      levels: finalLevels,
      items,
      organizationId,
      visibility: "org",
    };

    return {
      envelope: { id, format: "practice", version: 1, content: practiceCourse },
      migrated: true,
    };
  }

  throw new Error(`Unsupported legacy schema for '${courseId}'.`);
}

function parseArgs(argv: string[]) {
  const set = new Set(argv);
  return {
    apply: set.has("--apply"),
    deleteLegacy: set.has("--delete-legacy"),
    deleteCatalog: set.has("--delete-catalog"),
  };
}

async function callSaveCourse(params: {
  supabaseUrl: string;
  anonKey: string;
  agentToken: string;
  envelope: Envelope;
}): Promise<void> {
  const res = await fetch(`${params.supabaseUrl}/functions/v1/save-course`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: params.anonKey,
      Authorization: `Bearer ${params.anonKey}`,
      "X-Agent-Token": params.agentToken,
    },
    body: JSON.stringify(params.envelope),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`save-course failed (${res.status}): ${text || res.statusText}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Load learnplay.env into process.env (best-effort)
  loadLearnPlayEnv();
  const env = parseLearnPlayEnv();

  const SUPABASE_URL = mustEnv("SUPABASE_URL", env.SUPABASE_URL);
  const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);
  const ANON_KEY = mustEnv(
    "SUPABASE_ANON_KEY",
    env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );
  const AGENT_TOKEN = mustEnv("AGENT_TOKEN", env.AGENT_TOKEN);
  const ORGANIZATION_ID = mustEnv("ORGANIZATION_ID", env.ORGANIZATION_ID);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  console.log("🔎 Scanning Supabase Storage: bucket=courses (root) …");
  const { data: root, error: listErr } = await admin.storage.from("courses").list("", {
    limit: 10000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (listErr) throw new Error(`Failed to list courses bucket: ${listErr.message}`);

  const legacyFiles = (root || [])
    .map((f: any) => String(f?.name || ""))
    .filter((name) => name.endsWith(".json"))
    .filter((name) => name !== "catalog.json")
    .filter((name) => !name.includes("/"));

  console.log(`📦 Found ${legacyFiles.length} legacy root json file(s).`);

  if (args.deleteCatalog) {
    console.log(`🧹 Will delete legacy catalog.json (${args.apply ? "APPLY" : "DRY RUN"})`);
  }

  let migratedCount = 0;
  let skippedCount = 0;
  let cleanedLegacyCount = 0;
  let errorCount = 0;

  for (const filename of legacyFiles) {
    const courseId = filename.replace(/\.json$/, "");
    try {
      // Skip if canonical already exists
      const { data: existing } = await admin.storage.from("courses").list(courseId, { limit: 100, search: "course.json" });
      const hasCanonical = Array.isArray(existing) && existing.some((x: any) => String(x?.name || "") === "course.json");
      if (hasCanonical) {
        // If canonical exists, the root file is pure legacy baggage. Optionally delete it.
        if (args.apply && args.deleteLegacy) {
          const { error: rmErr } = await admin.storage.from("courses").remove([filename]);
          if (rmErr) throw new Error(`remove legacy failed: ${rmErr.message}`);
          cleanedLegacyCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      const { data: obj, error: dlErr } = await admin.storage.from("courses").download(filename);
      if (dlErr || !obj) throw new Error(`download failed: ${dlErr?.message || "no data"}`);
      const text = await obj.text();
      const raw = JSON.parse(text);

      const { envelope } = normalizeToEnvelope(courseId, raw, ORGANIZATION_ID);

      if (!args.apply) {
        migratedCount++;
        continue;
      }

      await callSaveCourse({ supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, agentToken: AGENT_TOKEN, envelope });

      if (args.deleteLegacy) {
        const { error: rmErr } = await admin.storage.from("courses").remove([filename]);
        if (rmErr) throw new Error(`remove legacy failed: ${rmErr.message}`);
        cleanedLegacyCount++;
      }

      migratedCount++;
    } catch (e) {
      errorCount++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ ${courseId}: ${msg}`);
    }
  }

  if (args.apply && args.deleteCatalog) {
    const { error: rmCatErr } = await admin.storage.from("courses").remove(["catalog.json"]);
    if (rmCatErr) {
      console.warn(`⚠️  Failed to delete catalog.json: ${rmCatErr.message}`);
    } else {
      console.log("🧹 Deleted catalog.json");
    }
  }

  console.log("\n✅ Migration summary:");
  console.log(`   mode       : ${args.apply ? "APPLY" : "DRY RUN"}`);
  console.log(`   migrated   : ${migratedCount}`);
  console.log(`   skipped    : ${skippedCount} (already canonical)`);
  console.log(`   cleaned    : ${cleanedLegacyCount} (legacy root files deleted)`);
  console.log(`   errors     : ${errorCount}`);

  if (!args.apply) {
    console.log("\nNext: re-run with --apply (and optionally --delete-legacy / --delete-catalog) to persist changes.");
  }
}

main().catch((err) => {
  console.error("💥 Migration failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});


