#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("BLOCKED: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const bookVersionId = process.argv[2] || "331a7dcd-8efc-4c93-9126-b4fd247b2ecb";

const sb = createClient(url, key);

async function main() {
  const { data: v, error: vErr } = await sb
    .from("book_versions")
    .select("skeleton_path,compiled_canonical_path")
    .eq("id", bookVersionId)
    .single();

  if (vErr) {
    console.error("Failed to load book_version:", vErr.message);
    process.exit(1);
  }

  console.log("skeleton_path:", v.skeleton_path);
  console.log("compiled_canonical_path:", v.compiled_canonical_path);

  if (!v.skeleton_path) {
    console.log("No skeleton_path set.");
    process.exit(0);
  }

  const { data: skel, error: skelErr } = await sb.storage
    .from("books")
    .download(v.skeleton_path);

  if (skelErr) {
    console.error("skeleton download error:", skelErr.message);
    process.exit(1);
  }

  const txt = await skel.text();
  const json = JSON.parse(txt);

  console.log("\n--- SKELETON ---");
  console.log("meta:", JSON.stringify(json.meta, null, 2));
  console.log("chapters:", json.chapters?.length || 0);

  if (json.chapters && json.chapters.length > 0) {
    const ch = json.chapters[0];
    console.log("\n--- CHAPTER 0 ---");
    console.log("title:", ch.title);
    console.log("openerImageSrc:", ch.openerImageSrc || null);
    console.log("sections:", ch.sections?.length || 0);

    // Flatten blocks from all sections
    const allBlocks = [];
    for (const sec of ch.sections || []) {
      allBlocks.push(...(sec.blocks || []));
    }
    console.log("total blocks (across sections):", allBlocks.length);

    // Find images within blocks
    const allImages = [];
    for (const block of allBlocks) {
      if (block.images && Array.isArray(block.images)) {
        allImages.push(...block.images);
      }
    }
    console.log("total image placeholders:", allImages.length);
    if (allImages.length > 0) {
      console.log("\nFirst image placeholder:");
      console.log(JSON.stringify(allImages[0], null, 2));
    }

    const paras = allBlocks.filter((b) => b.type === "paragraph");
    console.log("paragraphs:", paras.length);
    if (paras.length > 0) {
      console.log("\nFirst paragraph block (snippet):");
      console.log(JSON.stringify(paras[0], null, 2).slice(0, 500));
    }
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

