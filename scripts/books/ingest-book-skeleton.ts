import { createClient } from "npm:@supabase/supabase-js@2";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

// Load env
loadLocalEnvForTests();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const ORG_ID = process.env.ORGANIZATION_ID;

if (!SUPABASE_URL || !SERVICE_KEY || !AGENT_TOKEN || !ORG_ID) {
  console.error("❌ Missing env vars (SUPABASE_URL, SERVICE_ROLE_KEY, AGENT_TOKEN, ORGANIZATION_ID)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/books/ingest-book-skeleton.ts <path-to-skeleton.json>");
    process.exit(1);
  }

  console.log(`📖 Reading skeleton: ${filePath}`);
  const raw = await readFile(filePath, "utf8");
  const skeleton = JSON.parse(raw);

  const meta = skeleton.meta || {};
  const title = meta.title || path.basename(filePath, ".json");
  const level = meta.level || "n4"; // default to n4 if missing
  const language = meta.language || "nl";

  // 1. Create Book
  console.log(`Creating book: "${title}" (${level}/${language})...`);
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .insert({
      organization_id: ORG_ID,
      title,
      level,
      language,
      status: "draft",
    })
    .select()
    .single();

  if (bookErr) throw new Error(`Failed to create book: ${bookErr.message}`);
  const bookId = book.id;
  console.log(`✅ Book created: ${bookId}`);

  // 2. Create Version
  const bookVersionId = crypto.randomUUID();
  console.log(`Creating version: ${bookVersionId}...`);
  
  // Update skeleton meta to match new IDs
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
    source: "INGEST_PASS1",
    canonical_path: `${bookId}/${bookVersionId}/canonical.json`, // will be created by save-skeleton
  });

  if (verErr) throw new Error(`Failed to create version: ${verErr.message}`);

  // 3. Save Skeleton via Edge Function (handles storage + compilation)
  console.log("💾 Saving skeleton via Edge Function...");
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
      note: "Ingested from PASS1 file",
      compileCanonical: true
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Save failed (${res.status}): ${txt}`);
  }

  const json = await res.json();
  if (!json.ok) throw new Error(`Save returned error: ${json.error}`);

  console.log(`
🎉 Import Complete!
   Book ID: ${bookId}
   Version: ${bookVersionId}
   
   To generate content, run:
   npx tsx scripts/books/trigger-generation.ts ${bookId} ${bookVersionId}
  `);
}

main().catch(e => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});

