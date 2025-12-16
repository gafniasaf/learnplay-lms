#!/usr/bin/env tsx
/**
 * Set a course's visibility (org|global) using the canonical Edge Function `save-course`.
 *
 * Why: the public Course Catalog (`/courses`) only shows `visibility=global` courses for unauthenticated users.
 * This script updates BOTH:
 * - Storage: courses/<id>/course.json (envelope content.visibility)
 * - DB: course_metadata.visibility (via upsertCourseMetadata inside save-course)
 *
 * Usage:
 *   npx tsx scripts/set-course-visibility.ts --courseId <id> --visibility global
 *   npx tsx scripts/set-course-visibility.ts --all --visibility global
 *
 * Required env vars (resolved from learnplay.env via tests/helpers/parse-learnplay-env.ts):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (to download the existing course.json)
 *   SUPABASE_ANON_KEY           (or VITE_SUPABASE_PUBLISHABLE_KEY)
 *   AGENT_TOKEN                 (to call save-course)
 *   ORGANIZATION_ID             (required for --all, and stamped into course content to avoid org drift)
 */

import { createClient } from "@supabase/supabase-js";
import { loadLearnPlayEnv, parseLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

type Visibility = "org" | "global";
type CourseEnvelope = { id?: string; format?: string; version?: string | number; content: any };

function isEnvelope(x: any): x is CourseEnvelope {
  return !!x && typeof x === "object" && "content" in x && "format" in x;
}

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

function mustEnv(name: string, fromFile?: string): string {
  const v = process.env[name] || fromFile;
  if (!v) {
    console.error(`❌ ${name} is REQUIRED - set env var or populate learnplay.env`);
    process.exit(1);
  }
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function listCourseIdsViaEdge(args: {
  supabaseUrl: string;
  anonKey: string;
  agentToken: string;
  organizationId: string;
}): Promise<string[]> {
  const url = `${args.supabaseUrl}/functions/v1/list-courses?limit=1000&sort=newest`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: args.anonKey,
      Authorization: `Bearer ${args.anonKey}`,
      "x-agent-token": args.agentToken,
      "x-organization-id": args.organizationId,
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`list-courses failed (${res.status}): ${JSON.stringify(json)}`);
  }
  const items = Array.isArray((json as any)?.items) ? (json as any).items : [];
  return items.map((it: any) => String(it?.id || "")).filter(Boolean);
}

async function setVisibilityForCourse(args: {
  admin: ReturnType<typeof createClient>;
  courseId: string;
  visibility: Visibility;
  supabaseUrl: string;
  anonKey: string;
  agentToken: string;
  organizationId?: string;
}): Promise<{ updated: boolean; skipped: boolean }> {
  const { data: file, error: dlErr } = await args.admin.storage.from("courses").download(`${args.courseId}/course.json`);
  if (dlErr || !file) {
    throw new Error(`Failed to download courses/${args.courseId}/course.json: ${dlErr?.message || "not found"}`);
  }

  const text = await file.text();
  const raw = JSON.parse(text);
  const envelope: CourseEnvelope = isEnvelope(raw)
    ? (raw as CourseEnvelope)
    : { id: args.courseId, format: "practice", version: 1, content: raw };

  const content = envelope.content && typeof envelope.content === "object" ? envelope.content : {};
  const currentVisibility = String((content as any).visibility || "").trim();
  if (currentVisibility === args.visibility) {
    return { updated: false, skipped: true };
  }

  (content as any).visibility = args.visibility;
  if (args.organizationId) {
    // Prevent org drift: save-course metadata upsert prefers content.organizationId when present.
    (content as any).organizationId = (content as any).organizationId || args.organizationId;
    (content as any).organization_id = (content as any).organization_id || args.organizationId;
  }
  envelope.content = content;

  // Persist via save-course so metadata stays consistent.
  const res = await fetch(`${args.supabaseUrl}/functions/v1/save-course`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: args.anonKey,
      Authorization: `Bearer ${args.anonKey}`,
      "X-Agent-Token": args.agentToken,
    },
    body: JSON.stringify(envelope),
  });

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`save-course failed (${res.status}): ${bodyText || res.statusText}`);
  }

  return { updated: true, skipped: false };
}

async function main() {
  loadLearnPlayEnv();
  const env = parseLearnPlayEnv();

  const all = hasFlag("--all");
  const visibilityRaw = must("visibility", argValue("--visibility"));
  const visibility = (visibilityRaw === "global" || visibilityRaw === "org" ? visibilityRaw : null) as Visibility | null;
  if (!visibility) {
    console.error("❌ visibility must be 'org' or 'global'");
    process.exit(1);
  }

  const SUPABASE_URL = mustEnv("SUPABASE_URL", env.SUPABASE_URL);
  const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);
  const ANON_KEY = mustEnv(
    "SUPABASE_ANON_KEY",
    env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );
  const AGENT_TOKEN = mustEnv("AGENT_TOKEN", env.AGENT_TOKEN);

  let ORGANIZATION_ID: string | undefined;
  if (process.env.ORGANIZATION_ID) ORGANIZATION_ID = process.env.ORGANIZATION_ID;
  else if (env.ORGANIZATION_ID) ORGANIZATION_ID = env.ORGANIZATION_ID;
  if (all) {
    ORGANIZATION_ID = mustEnv("ORGANIZATION_ID", ORGANIZATION_ID);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const courseIds = all
    ? await listCourseIdsViaEdge({ supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, agentToken: AGENT_TOKEN, organizationId: ORGANIZATION_ID })
    : [must("courseId", argValue("--courseId"))];

  if (courseIds.length === 0) {
    console.error("❌ No courses found to update");
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  for (const courseId of courseIds) {
    try {
      const r = await setVisibilityForCourse({
        admin,
        courseId,
        visibility,
        supabaseUrl: SUPABASE_URL,
        anonKey: ANON_KEY,
        agentToken: AGENT_TOKEN,
        organizationId: ORGANIZATION_ID,
      });
      if (r.updated) updated++;
      if (r.skipped) skipped++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ ${courseId}: ${msg}`);
      process.exit(1);
    }
  }

  console.log(`✅ Visibility set to '${visibility}'`);
  console.log(`   updated: ${updated}`);
  console.log(`   skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("💥 set-course-visibility failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});


