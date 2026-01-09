import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { createClient } from "@supabase/supabase-js";

loadLocalEnvForTests();

function env(name: string): string | null {
  const v = process.env[name];
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function requireEnv(name: string): string {
  const v = env(name);
  if (!v) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v;
}

function requireAnyEnv(names: string[]): { name: string; value: string } {
  for (const n of names) {
    const v = env(n);
    if (v) return { name: n, value: v };
  }
  console.error(`BLOCKED: missing required env var (tried: ${names.join(", ")})`);
  process.exit(1);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) return t;
  }
  return "";
}

function stripGeneratedContent(node: any): any {
  if (!node) return node;
  if (Array.isArray(node)) return node.map(stripGeneratedContent);
  if (typeof node !== "object") return node;

  const t = typeof (node as any).type === "string" ? String((node as any).type) : "";

  // Keep the outline structure, wipe generated content.
  if (t === "subparagraph") {
    const blocks = Array.isArray((node as any).blocks) ? (node as any).blocks : [];
    const nestedSubs = blocks.filter((b: any) => b && typeof b === "object" && b.type === "subparagraph");
    return {
      ...(node as any),
      // Only keep nested subparagraphs (rare), always wipe paragraph content inside.
      blocks: nestedSubs.map(stripGeneratedContent),
    };
  }

  if (t === "paragraph") {
    const next: any = { ...(node as any) };
    delete next.basisHtml;
    delete next.praktijkHtml;
    delete next.verdiepingHtml;
    delete next.basis;
    delete next.praktijk;
    delete next.verdieping;
    // Images are generated during BookGen; remove to prevent "mixed" artifacts.
    delete next.images;
    return next;
  }

  const next: any = { ...(node as any) };
  // Remove any accidental compiled fields if present.
  delete next.basisHtml;
  delete next.praktijkHtml;
  delete next.verdiepingHtml;
  delete next.basis;
  delete next.praktijk;
  delete next.verdieping;

  for (const [k, v] of Object.entries(next)) {
    next[k] = stripGeneratedContent(v);
  }
  return next;
}

async function downloadJsonFromStorage(supabase: any, bucket: string, path: string): Promise<any> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || `Failed to download ${bucket}/${path}`);
  const txt = await data.text();
  return txt ? JSON.parse(txt) : null;
}

async function callEdgeAsAgent(opts: {
  supabaseUrl: string;
  agentToken: string;
  organizationId: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<any> {
  const url = `${opts.supabaseUrl.replace(/\/$/, "")}/functions/v1/${opts.path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": opts.agentToken,
      "x-organization-id": opts.organizationId,
    },
    body: JSON.stringify(opts.body),
  });
  const text = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!resp.ok || json?.ok === false) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${resp.status}: ${text.slice(0, 400)}`;
    throw new Error(msg);
  }
  return json;
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  const sourceBookVersionId = String(process.argv[3] || "").trim();
  if (!bookId || !sourceBookVersionId) {
    console.error("Usage: npx tsx scripts/books/start-clean-bookgen-from-version.ts <bookId> <sourceBookVersionId>");
    process.exit(1);
  }

  const supabaseUrl = requireAnyEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]).value.replace(/\/$/, "");
  const serviceKey = requireAnyEnv(["SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"]).value;
  const agentToken = requireEnv("AGENT_TOKEN");
  const organizationId = requireEnv("ORGANIZATION_ID");

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`[clean-bookgen] Book: ${bookId}`);
  console.log(`[clean-bookgen] Source version: ${sourceBookVersionId}`);

  // Load book metadata (for title/level/language fallbacks)
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("id,title,level,organization_id")
    .eq("id", bookId)
    .single();
  if (bookErr || !book) throw new Error(bookErr?.message || "Book not found");
  if (String((book as any).organization_id) !== organizationId) {
    throw new Error("BLOCKED: Book does not belong to current organization");
  }

  // Download the current skeleton and strip generated content to get a clean outline.
  const sourceSkeletonPath = `books/${bookId}/${sourceBookVersionId}/skeleton.json`;
  const sourceSkeleton = await downloadJsonFromStorage(supabase, "books", sourceSkeletonPath);
  if (!isPlainObject(sourceSkeleton) || !isPlainObject((sourceSkeleton as any).meta)) {
    throw new Error("BLOCKED: Source skeleton.json is missing meta");
  }

  const cleanSkeleton = stripGeneratedContent(sourceSkeleton);

  const chapterCount = Array.isArray((cleanSkeleton as any).chapters) ? (cleanSkeleton as any).chapters.length : 0;
  if (chapterCount <= 0) throw new Error("BLOCKED: Clean skeleton has no chapters");

  const newBookVersionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Update meta IDs
  const nextTitle = firstNonEmpty((cleanSkeleton as any).meta?.title, (book as any).title);
  const nextLevel = firstNonEmpty((cleanSkeleton as any).meta?.level, (book as any).level);
  const nextLanguage = firstNonEmpty((cleanSkeleton as any).meta?.language);

  (cleanSkeleton as any).meta = {
    ...(cleanSkeleton as any).meta,
    bookId,
    bookVersionId: newBookVersionId,
    schemaVersion: "skeleton_v1",
    title: nextTitle,
    level: nextLevel,
    language: nextLanguage,
  };

  const level = String((cleanSkeleton as any).meta.level || "").trim();
  const language = String((cleanSkeleton as any).meta.language || "").trim();
  const title = String((cleanSkeleton as any).meta.title || "").trim();
  if (!(level === "n3" || level === "n4")) throw new Error("BLOCKED: level must be n3 or n4");
  if (!language) throw new Error("BLOCKED: language is required in skeleton meta");
  if (!title) throw new Error("BLOCKED: title is required in skeleton meta");

  // Create the new book version row
  console.log(`[clean-bookgen] Creating new version: ${newBookVersionId}`);
  const { error: verErr } = await supabase.from("book_versions").insert({
    book_id: bookId,
    book_version_id: newBookVersionId,
    schema_version: "1.0",
    status: "active",
    source: "CLEAN_REGENERATE",
    exported_at: nowIso,
    canonical_path: `${bookId}/${newBookVersionId}/canonical.json`,
    compiled_canonical_path: `books/${bookId}/${newBookVersionId}/compiled_canonical.json`,
  });
  if (verErr) throw new Error(`Failed to create book version: ${verErr.message}`);

  // Save clean skeleton (Edge will validate + create history + compile canonical)
  console.log("[clean-bookgen] Saving clean skeleton via Edge...");
  const saveRes = await callEdgeAsAgent({
    supabaseUrl,
    agentToken,
    organizationId,
    path: "book-version-save-skeleton",
    body: {
      bookId,
      bookVersionId: newBookVersionId,
      skeleton: cleanSkeleton,
      note: `Clean regenerate from ${sourceBookVersionId}`,
      compileCanonical: true,
    },
  });
  if (!saveRes || saveRes.ok !== true) throw new Error("Save skeleton failed");

  // Ensure generation control is not paused/cancelled for this new version
  console.log("[clean-bookgen] Resetting BookGen control state (resume)...");
  await callEdgeAsAgent({
    supabaseUrl,
    agentToken,
    organizationId,
    path: "book-generation-control",
    body: { bookId, bookVersionId: newBookVersionId, action: "reset" },
  });

  // Enqueue chapter 1 generation (this chains subsequent chapters automatically)
  console.log("[clean-bookgen] Enqueuing Chapter 1 generation...");
  const payload: Record<string, unknown> = {
    bookId,
    bookVersionId: newBookVersionId,
    chapterIndex: 0,
    chapterCount,
    topic: title,
    language,
    level,
    layoutProfile: "pass2",
    microheadingDensity: "medium",
    imagePromptLanguage: "book",
    userInstructions:
      "Schrijf in vriendelijk, leerlinggericht Nederlands (N3-stijl). " +
      "Gebruik vaak 'je'. " +
      "Leg begrippen stap voor stap uit met zinnen als: 'Dit betekent dat...' en 'Hierbij kun je bijvoorbeeld denken aan...'. " +
      "Vermijd een te academische toon en introduceer afkortingen pas als ze logisch zijn. " +
      "Houd de tekst vlot en begrijpelijk, met duidelijke verbanden ('Hierdoor...', 'Doordat...', 'Op dezelfde manier...'). " +
      "Zorg dat 'In de praktijk' en 'Verdieping' kaders concreet en relevant zijn waar de outline dat vraagt.",
    writeModel: "anthropic:claude-sonnet-4-5",
  };

  const enqueueRes = await callEdgeAsAgent({
    supabaseUrl,
    agentToken,
    organizationId,
    path: "enqueue-job",
    body: { jobType: "book_generate_chapter", payload },
  });
  if (!enqueueRes?.ok || !enqueueRes?.jobId) throw new Error("Enqueue chapter job failed");

  console.log("");
  console.log("✅ CLEAN RUN STARTED");
  console.log(`   Book:        ${bookId}`);
  console.log(`   New version: ${newBookVersionId}`);
  console.log(`   Chapters:    ${chapterCount}`);
  console.log(`   JobId:       ${String(enqueueRes.jobId)}`);
  console.log("");
  console.log("Next:");
  console.log("- Watch progress at /admin/book-monitor (select the new version).");
  console.log("- After all chapters are done, run: Normalize Voice (N3) + Generate Index + Generate Begrippen + Render Book PDF.");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ start-clean-bookgen-from-version failed: ${msg}`);
  process.exit(1);
});


