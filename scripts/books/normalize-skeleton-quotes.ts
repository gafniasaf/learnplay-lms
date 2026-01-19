import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";
import { compileSkeletonToCanonical } from "../../src/lib/books/bookSkeletonCore.js";

loadLocalEnvForTests();

type BookKey = { bookId: string; bookVersionId: string };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function normalizeQuotes(raw: string): string {
  return String(raw || "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00AB\u00BB\u2039\u203A]/g, '"');
}

function normalizeTitle(title: string): { next: string; changed: boolean } {
  const next = normalizeQuotes(title);
  return { next, changed: next !== title };
}

function collectFailedBookVersions(jobs: any[]): BookKey[] {
  const out: BookKey[] = [];
  const seen = new Set<string>();
  for (const job of jobs) {
    const payload = job?.payload;
    const bookId = typeof payload?.bookId === "string" ? payload.bookId.trim() : "";
    const bookVersionId = typeof payload?.bookVersionId === "string" ? payload.bookVersionId.trim() : "";
    if (!bookId || !bookVersionId) continue;
    const key = `${bookId}:${bookVersionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bookId, bookVersionId });
  }
  return out;
}

function normalizeSkeletonTitles(skeleton: any) {
  let changed = false;
  let chapterCount = 0;
  let sectionCount = 0;
  let subparagraphCount = 0;

  const walkBlocks = (blocks: any[]) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "subparagraph") {
        if (typeof b.title === "string") {
          const { next, changed: ch } = normalizeTitle(b.title);
          if (ch) {
            b.title = next;
            changed = true;
            subparagraphCount += 1;
          }
        }
        if (Array.isArray(b.blocks)) walkBlocks(b.blocks);
        if (Array.isArray(b.content)) walkBlocks(b.content);
      }
    }
  };

  if (Array.isArray(skeleton?.chapters)) {
    for (const chapter of skeleton.chapters) {
      if (!chapter || typeof chapter !== "object") continue;
      if (typeof chapter.title === "string") {
        const { next, changed: ch } = normalizeTitle(chapter.title);
        if (ch) {
          chapter.title = next;
          changed = true;
          chapterCount += 1;
        }
      }
      if (Array.isArray(chapter.sections)) {
        for (const section of chapter.sections) {
          if (!section || typeof section !== "object") continue;
          if (typeof section.title === "string") {
            const { next, changed: ch } = normalizeTitle(section.title);
            if (ch) {
              section.title = next;
              changed = true;
              sectionCount += 1;
            }
          }
          if (Array.isArray(section.blocks)) walkBlocks(section.blocks);
          if (Array.isArray(section.content)) walkBlocks(section.content);
        }
      }
    }
  }

  return { changed, chapterCount, sectionCount, subparagraphCount };
}

async function main() {
  const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORG_ID = requireEnv("ORGANIZATION_ID");
  if (!SUPABASE_URL) {
    console.error("BLOCKED: SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
    process.exit(1);
  }

  const limitArg = typeof process.argv[2] === "string" ? process.argv[2].trim() : "";
  const limitEnvRaw = typeof process.env.BOOK_FAILED_JOB_LIMIT === "string" ? process.env.BOOK_FAILED_JOB_LIMIT.trim() : "";
  const limitRaw = limitArg || limitEnvRaw;
  if (!limitRaw) {
    console.error("BLOCKED: BOOK_FAILED_JOB_LIMIT is REQUIRED (or pass a limit as the first CLI arg)");
    process.exit(1);
  }
  const limitValue = Number(limitRaw);
  if (!Number.isFinite(limitValue) || limitValue <= 0) {
    console.error("BLOCKED: BOOK_FAILED_JOB_LIMIT must be a positive number");
    process.exit(1);
  }
  const limit = Math.floor(limitValue);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: jobs, error } = await supabase
    .from("ai_agent_jobs")
    .select("id,job_type,status,error,created_at,payload")
    .eq("status", "failed")
    .in("job_type", ["book_generate_section", "book_generate_chapter"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const targets = collectFailedBookVersions(jobs || []);
  if (!targets.length) {
    console.log(JSON.stringify({ ok: true, updated: 0, targets: [] }, null, 2));
    return;
  }

  const results: any[] = [];
  const postJson = async (path: string, body: Record<string, unknown>) => {
    const url = `${SUPABASE_URL}/functions/v1/${path.replace(/^\//, "")}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-agent-token": AGENT_TOKEN,
          "x-organization-id": ORG_ID,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${path} fetch failed: ${msg}`);
    }
    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok || json?.ok === false) {
      const msg = typeof json?.error?.message === "string" ? json.error.message : `HTTP ${res.status}`;
      throw new Error(`${path} failed: ${msg}`);
    }
    return json;
  };

  for (const target of targets) {
    console.log(`[normalize-quotes] Processing ${target.bookId} / ${target.bookVersionId}`);
    const { data: versionRows, error: verErr } = await supabase
      .from("book_versions")
      .select("skeleton_path,canonical_path")
      .eq("book_id", target.bookId)
      .eq("book_version_id", target.bookVersionId)
      .limit(1);
    const version = Array.isArray(versionRows) ? versionRows[0] : null;
    if (verErr || !version?.skeleton_path) {
      results.push({
        ...target,
        ok: false,
        stage: "load_book_version",
        error: String(verErr?.message || verErr || "missing skeleton_path"),
      });
      continue;
    }

    const { data: blob, error: dlErr } = await supabase.storage.from("books").download(version.skeleton_path);
    if (dlErr || !blob) {
      results.push({
        ...target,
        ok: false,
        stage: "download_skeleton",
        error: String(dlErr?.message || dlErr || "failed to download skeleton"),
      });
      continue;
    }
    const skeleton = JSON.parse(await blob.text());
    const changes = normalizeSkeletonTitles(skeleton);
    if (!changes.changed) {
      results.push({ ...target, ok: true, updated: false, changes });
      continue;
    }

    try {
      await postJson("book-version-save-skeleton", {
        bookId: target.bookId,
        bookVersionId: target.bookVersionId,
        skeleton,
        note: "Normalize curly quotes in chapter/section/subparagraph titles to avoid outline mismatches",
        compileCanonical: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ ...target, ok: false, stage: "save_skeleton", error: msg });
      continue;
    }

    const compiled = compileSkeletonToCanonical(skeleton);
    const compiledText = JSON.stringify(compiled, null, 2);
    const compiledPath = `books/${target.bookId}/${target.bookVersionId}/compiled_canonical.json`;
    if (!version?.canonical_path) {
      results.push({
        ...target,
        ok: false,
        stage: "load_book_version",
        error: "missing canonical_path",
      });
      continue;
    }

    const { error: upCompiledErr } = await supabase.storage.from("books").upload(
      compiledPath,
      new Blob([compiledText], { type: "application/json" }),
      { upsert: true, contentType: "application/json" },
    );
    if (upCompiledErr) {
      results.push({ ...target, ok: false, stage: "upload_compiled", error: String(upCompiledErr.message) });
      continue;
    }

    const { error: upCanonErr } = await supabase.storage.from("books").upload(
      version.canonical_path,
      new Blob([compiledText], { type: "application/json" }),
      { upsert: true, contentType: "application/json" },
    );
    if (upCanonErr) {
      results.push({ ...target, ok: false, stage: "upload_canonical", error: String(upCanonErr.message) });
      continue;
    }

    const { error: updateErr } = await supabase
      .from("book_versions")
      .update({ compiled_canonical_path: compiledPath })
      .eq("book_id", target.bookId)
      .eq("book_version_id", target.bookVersionId);
    if (updateErr) {
      results.push({ ...target, ok: false, stage: "update_version", error: String(updateErr.message) });
      continue;
    }

    results.push({ ...target, ok: true, updated: true, changes });
  }

  console.log(JSON.stringify({ ok: true, updated: results.filter((r) => r.updated).length, results }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ normalize-skeleton-quotes failed: ${msg}`);
  process.exit(1);
});
