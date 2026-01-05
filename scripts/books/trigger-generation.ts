import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

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
  const bookId = process.argv[2];
  const bookVersionId = process.argv[3];

  if (!bookId || !bookVersionId) {
    console.error("Usage: npx tsx scripts/books/trigger-generation.ts <bookId> <bookVersionId> [startChapterIndex]");
    process.exit(1);
  }

  const startChapterIndex = parseInt(process.argv[4] || "0", 10);

  console.log(`🔍 Fetching skeleton for ${bookId}/${bookVersionId}...`);
  
  // Convention: books/{bookId}/{bookVersionId}/skeleton.json
  const skeletonPath = `books/${bookId}/${bookVersionId}/skeleton.json`;
  const { data: skData, error: skErr } = await supabase.storage.from("books").download(skeletonPath);
  if (skErr) throw new Error(`Skeleton not found at ${skeletonPath}: ${skErr.message}`);

  const skeleton = JSON.parse(await skData.text());
  const chapters = Array.isArray(skeleton.chapters) ? skeleton.chapters : [];
  const chapterCount = chapters.length;

  console.log(`📖 Found ${chapterCount} chapters.`);

  if (startChapterIndex >= chapterCount) {
    console.error(`❌ Start index ${startChapterIndex} is out of bounds (0-${chapterCount-1})`);
    process.exit(1);
  }

  const payload = {
    organization_id: ORG_ID,
    bookId,
    bookVersionId,
    chapterIndex: startChapterIndex,
    chapterCount,
    // Defaults for professional/PASS2 output
    topic: skeleton.meta?.title || "Educational Content", 
    level: skeleton.meta?.level || "n4",
    language: skeleton.meta?.language || "nl",
    layoutProfile: "pass2",
    microheadingDensity: "medium",
    imagePromptLanguage: "book",
    writeModel: "anthropic:claude-sonnet-4-5",
    userInstructions:
      "Schrijf in vriendelijk, leerlinggericht Nederlands (zoals het referentieboek). " +
      "Gebruik vaak 'je'. " +
      "Leg begrippen stap voor stap uit met zinnen als: 'Dit betekent dat...' en 'Hierbij kun je bijvoorbeeld denken aan...'. " +
      "Vermijd een te academische toon en introduceer afkortingen pas als ze logisch zijn. " +
      "Houd de tekst vlot en begrijpelijk, met duidelijke verbanden ('Hierdoor...', 'Doordat...', 'Op dezelfde manier...'). " +
      "Zorg dat 'In de praktijk' en 'Verdieping' kaders concreet en relevant zijn waar de outline dat vraagt."
  };

  console.log("🚀 Enqueuing book_generate_chapter job...");
  console.log("Payload:", JSON.stringify(payload, null, 2));

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

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Enqueue failed (${res.status}): ${txt}`);
  }

  const json = await res.json();
  console.log(`✅ Job Enqueued: ${json.jobId}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

