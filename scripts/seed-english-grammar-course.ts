#!/usr/bin/env tsx
/**
 * Seed a real English grammar course into Supabase (Storage + course_metadata)
 *
 * Uses Edge Function: /functions/v1/save-course
 * Auth: requires AGENT_TOKEN (X-Agent-Token)
 *
 * Required env vars:
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY=eyJ...
 *   AGENT_TOKEN=...
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

function must(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ ${name} is REQUIRED - set env var before running`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const SUPABASE_URL = must("SUPABASE_URL");
  const SUPABASE_ANON_KEY = must("SUPABASE_ANON_KEY");
  const AGENT_TOKEN = must("AGENT_TOKEN");

  const coursePath = join(process.cwd(), "content", "courses", "english-grammar-foundations.json");
  const raw = readFileSync(coursePath, "utf-8");
  const course = JSON.parse(raw);

  if (!course?.id || course.id !== "english-grammar-foundations") {
    console.error("❌ Course JSON missing expected id 'english-grammar-foundations'");
    process.exit(1);
  }

  console.log(`📦 Seeding course: ${course.id} (${course.title})`);

  const saveUrl = `${SUPABASE_URL}/functions/v1/save-course`;
  const saveRes = await fetch(saveUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "X-Agent-Token": AGENT_TOKEN,
    },
    body: JSON.stringify(course),
  });

  const saveText = await saveRes.text();
  if (!saveRes.ok) {
    console.error(`❌ save-course failed (${saveRes.status})`);
    console.error(saveText);
    process.exit(1);
  }
  console.log(`✅ save-course ok: ${saveText}`);

  // Verify via list-courses (should include the new course)
  const listUrl = `${SUPABASE_URL}/functions/v1/list-courses?limit=1000&sort=newest`;
  const listRes = await fetch(listUrl, { method: "GET", headers: { "Content-Type": "application/json" } });
  const listJson = await listRes.json().catch(() => null);
  if (!listRes.ok) {
    console.error(`❌ list-courses failed (${listRes.status})`);
    console.error(listJson ?? (await listRes.text()));
    process.exit(1);
  }
  const items = Array.isArray(listJson?.items) ? listJson.items : [];
  const found = items.find((it: any) => it?.id === course.id);
  if (!found) {
    console.error("❌ Seed verification failed: course not found in list-courses response");
    console.error(`Found ids: ${items.map((x: any) => x?.id).filter(Boolean).join(", ")}`);
    process.exit(1);
  }
  console.log(`✅ Verified in list-courses: ${found.id} (${found.title})`);

  // Verify storage via get-course
  const getUrl = `${SUPABASE_URL}/functions/v1/get-course?courseId=${encodeURIComponent(course.id)}`;
  const getRes = await fetch(getUrl, { method: "GET", headers: { "Content-Type": "application/json" } });
  const getJson = await getRes.json().catch(() => null);
  if (!getRes.ok) {
    console.error(`❌ get-course failed (${getRes.status})`);
    console.error(getJson ?? (await getRes.text()));
    process.exit(1);
  }
  console.log(`✅ Verified get-course: items=${Array.isArray(getJson?.items) ? getJson.items.length : "?"}`);

  console.log("🎉 Done.");
}

main().catch((err) => {
  console.error("❌ Seed script failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});


