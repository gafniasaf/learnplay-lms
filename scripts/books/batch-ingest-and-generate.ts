import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const ORG_ID = process.env.ORGANIZATION_ID;

if (!SUPABASE_URL || !SERVICE_KEY || !AGENT_TOKEN || !ORG_ID) {
  console.error("❌ Missing env vars:");
  if (!SUPABASE_URL) console.error("   - SUPABASE_URL / VITE_SUPABASE_URL");
  if (!SERVICE_KEY) console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  if (!AGENT_TOKEN) console.error("   - AGENT_TOKEN");
  if (!ORG_ID) console.error("   - ORGANIZATION_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function ingestSkeleton(filePath: string) {
  console.log(`\n📖 Processing: ${path.basename(filePath)}`);
  const raw = await readFile(filePath, "utf8");
  const skeleton = JSON.parse(raw);

  const meta = skeleton.meta || {};
  // Fallback title if missing in meta
  const title = meta.title || path.basename(filePath, "_full_skeleton.json").replace(/_/g, " ");
  const level = meta.level || "n4"; 
  const language = meta.language || "nl";

  const bookId = meta.bookId || crypto.randomUUID();

  // 1. Create Book
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .upsert({
      id: bookId,
      organization_id: ORG_ID,
      title,
      level,
    })
    .select()
    .single();

  if (bookErr) throw new Error(`Create book failed: ${bookErr.message}`);
  
  // 2. Create Version
  const bookVersionId = crypto.randomUUID();
  
  // Update skeleton meta
  skeleton.meta = {
    ...meta,
    bookId,
    bookVersionId,
    schemaVersion: "skeleton_v1"
  };

  const { error: verErr } = await supabase.from("book_versions").insert({
    book_id: bookId,
    book_version_id: bookVersionId,
    schema_version: "1.0",
    status: "active",
    source: "INGEST_PASS1_BATCH",
    canonical_path: `${bookId}/${bookVersionId}/canonical.json`,
  });

  if (verErr) throw new Error(`Create version failed: ${verErr.message}`);

  // 3. Save Skeleton via Edge
  const res = await fetch(`${SUPABASE_URL}/functions/v1/book-version-save-skeleton`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": ORG_ID,
    },
    body: JSON.stringify({
      bookId,
      bookVersionId,
      skeleton,
      note: "Batch Ingest from PASS1 Bundle",
      compileCanonical: true
    }),
  });

  if (!res.ok) throw new Error(`Save skeleton failed (${res.status}): ${await res.text()}`);

  console.log(`✅ Ingested: ${title} (${bookId})`);
  return { bookId, bookVersionId, title, skeleton };
}

async function triggerGeneration(data: { bookId: string; bookVersionId: string; title: string; skeleton: any }) {
  const { bookId, bookVersionId, title, skeleton } = data;
  console.log(`🚀 Triggering generation for: ${title}`);
  
  const chapterCount = skeleton.chapters?.length || 0;

  if (chapterCount === 0) {
    console.log(`⚠️ No chapters found in skeleton, skipping generation.`);
    return;
  }

  // Queue job for creating content (start at ch0)
  const payload = {
    organization_id: ORG_ID,
    bookId,
    bookVersionId,
    chapterIndex: 0,
    chapterCount,
    topic: title,
    level: skeleton.meta.level || "n4",
    language: skeleton.meta.language || "nl",
    layoutProfile: "pass2",
    microheadingDensity: "medium",
    imagePromptLanguage: "book",
    writeModel: "anthropic:claude-sonnet-4-5",
    userInstructions: "Strictly follow the skeleton structure. Use professional, concise language suitable for MBO education. Ensure practical examples (In de praktijk) and deepening (Verdieping) are included where the outline suggests.",
    enqueueChapters: true // Chain all chapters!
  };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Token": AGENT_TOKEN,
      "X-Organization-Id": ORG_ID,
    },
    body: JSON.stringify({
      jobType: "book_generate_chapter",
      payload
    }),
  });

  if (!res.ok) console.error(`❌ Failed to enqueue job for ${title}: ${await res.text()}`);
  else console.log(`✅ Job queued for ${title}`);
}

async function main() {
  const inputDir = "tmp/ingest/tmp/skeletons/pass1_json";
  const files = (await readdir(inputDir)).filter(f => f.endsWith("_full_skeleton.json"));

  console.log(`Found ${files.length} skeletons to ingest.`);

  for (const f of files) {
    try {
      const result = await ingestSkeleton(path.join(inputDir, f));
      await triggerGeneration(result);
    } catch (e) {
      console.error(`❌ Failed processing ${f}:`, e);
    }
  }
}

main().catch(console.error);
