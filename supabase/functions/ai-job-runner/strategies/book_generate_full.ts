/**
 * book_generate_full (Factory / ai_agent_jobs)
 *
 * Orchestrates a skeleton-first book generation pipeline:
 * - Creates/validates book + version metadata
 * - Creates a minimal skeleton_v1 scaffold (fast, deterministic structure)
 * - Saves skeleton via book-version-save-skeleton (optionally compiles)
 * - Uploads a canonical.json (root path) so the render worker always has a canonical input
 * - Enqueues the first chapter generation job (book_generate_chapter), which chains the rest
 *
 * IMPORTANT:
 * - No silent fallbacks (fail loudly on missing required inputs/env)
 * - No image generation here (placeholders only, suggestions created in chapter jobs)
 */
import type { JobContext, JobExecutor } from "./types.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";
import { compileSkeletonToCanonical, validateBookSkeleton, type BookSkeletonV1 } from "../../_shared/bookSkeletonCore.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED`);
  }
  return v.trim();
}

function requireString(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${key} is REQUIRED`);
  }
  return v.trim();
}

function optionalString(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function optionalBoolean(p: Record<string, unknown>, key: string): boolean | null {
  const v = p[key];
  return typeof v === "boolean" ? v : null;
}

function requireModelSpec(p: Record<string, unknown>, key: string): string {
  const raw = requireString(p, key);
  const parts = raw.split(":").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`BLOCKED: ${key} must be prefixed with provider (use 'openai:<model>' or 'anthropic:<model>')`);
  }
  const provider = parts[0];
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`BLOCKED: ${key} provider must be 'openai' or 'anthropic'`);
  }
  const model = parts.slice(1).join(":").trim();
  if (!model) {
    throw new Error(`BLOCKED: ${key} model is missing`);
  }
  return `${provider}:${model}`;
}

function requireNumber(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`BLOCKED: ${key} is REQUIRED (number)`);
  }
  return v;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], keyName: string): T {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || !allowed.includes(s as T)) {
    throw new Error(`BLOCKED: ${keyName} must be one of: ${allowed.join(", ")}`);
  }
  return s as T;
}

async function storageExists(supabase: any, bucket: string, path: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

async function uploadJson(supabase: any, bucket: string, path: string, value: unknown, upsert: boolean) {
  const text = JSON.stringify(value, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert, contentType: "application/json" });
  if (error) throw new Error(error.message);
}

async function callEdgeAsAgent(opts: { orgId: string; path: string; body: unknown }) {
  const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${opts.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": opts.orgId,
    },
    body: JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `Edge call failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

function buildScaffoldSkeleton(opts: {
  bookId: string;
  bookVersionId: string;
  title: string;
  level: "n3" | "n4";
  language: string;
  chapterCount: number;
  promptPackId?: string | null;
  promptPackVersion?: number | null;
}): BookSkeletonV1 {
  const {
    bookId,
    bookVersionId,
    title,
    level,
    language,
    chapterCount,
    promptPackId,
    promptPackVersion,
  } = opts;

  const chapters = Array.from({ length: chapterCount }).map((_, idx) => {
    const n = idx + 1;
    return {
      id: `ch-${n}`,
      number: n,
      title: `Hoofdstuk ${n}`,
      openerImageSrc: null,
      sections: [
        {
          id: `ch-${n}-s-1`,
          title: "",
          blocks: [
            {
              type: "paragraph",
              id: `ch-${n}-p-1`,
              basisHtml: "",
              images: null,
            },
          ],
        },
      ],
    };
  });

  const meta: any = {
    bookId,
    bookVersionId,
    title,
    level,
    language,
    schemaVersion: "skeleton_v1",
  };
  if (typeof promptPackId === "string" && promptPackId.trim()) meta.promptPackId = promptPackId.trim();
  if (typeof promptPackVersion === "number" && Number.isFinite(promptPackVersion)) meta.promptPackVersion = Math.floor(promptPackVersion);

  return {
    meta,
    styleProfile: null,
    chapters,
  } as BookSkeletonV1;
}

export class BookGenerateFull implements JobExecutor {
  async execute(context: JobContext): Promise<unknown> {
    const { payload, jobId } = context;
    const p = (payload || {}) as Record<string, unknown>;

    const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const organizationId = requireString(p, "organization_id");

    const mode = requireEnum(p.mode, ["create", "existing"] as const, "mode");
    const bookId = requireString(p, "bookId");
    const language = requireString(p, "language");
    const level = requireEnum(p.level, ["n3", "n4"] as const, "level");
    const chapterCountRaw = requireNumber(p, "chapterCount");
    const chapterCount = Math.floor(chapterCountRaw);
    if (!Number.isFinite(chapterCountRaw) || chapterCountRaw !== chapterCount) {
      throw new Error("BLOCKED: chapterCount must be an integer");
    }
    if (chapterCount < 1 || chapterCount > 50) {
      throw new Error("BLOCKED: chapterCount must be between 1 and 50");
    }

    const topic = requireString(p, "topic");
    const userInstructions = optionalString(p, "userInstructions");
    const promptPackId = optionalString(p, "promptPackId");
    const promptPackVersionRaw = p.promptPackVersion;
    const promptPackVersion =
      typeof promptPackVersionRaw === "number" && Number.isFinite(promptPackVersionRaw) ? Math.floor(promptPackVersionRaw) : null;

    // Optional quality knobs (kept generic for all MBO books)
    const imagePromptLanguageRaw = optionalString(p, "imagePromptLanguage");
    const imagePromptLanguage =
      imagePromptLanguageRaw === "en" || imagePromptLanguageRaw === "book"
        ? imagePromptLanguageRaw
        : null;

    const layoutProfileRaw = optionalString(p, "layoutProfile");
    const layoutProfile =
      layoutProfileRaw === "auto" || layoutProfileRaw === "pass2" || layoutProfileRaw === "sparse"
        ? layoutProfileRaw
        : null;

    const microheadingDensityRaw = optionalString(p, "microheadingDensity");
    const microheadingDensity =
      microheadingDensityRaw === "low" || microheadingDensityRaw === "medium" || microheadingDensityRaw === "high"
        ? microheadingDensityRaw
        : null;

    const sectionMaxTokensRaw = (p as any).sectionMaxTokens;
    const sectionMaxTokens =
      typeof sectionMaxTokensRaw === "number" && Number.isFinite(sectionMaxTokensRaw)
        ? Math.max(1200, Math.min(12_000, Math.floor(sectionMaxTokensRaw)))
        : null;

    // Allow callers (proofs/scripts) to create a book + version + scaffold WITHOUT immediately enqueuing chapter jobs.
    // Default is true to preserve existing UI flows.
    const enqueueChapters = optionalBoolean(p, "enqueueChapters") ?? true;

    const writeModel = requireModelSpec(p, "writeModel");

    const title =
      mode === "create"
        ? requireString(p, "title")
        : optionalString(p, "title"); // existing mode may omit title; we’ll load from DB below if missing/empty

    await emitAgentJobEvent(jobId, "generating", 5, "Initializing book generation", {
      mode,
      bookId,
      level,
      language,
      chapterCount,
    }).catch(() => {});

    // 1) Verify/create book row
    if (mode === "existing") {
      const { data: book, error } = await adminSupabase
        .from("books")
        .select("id, title, level, organization_id")
        .eq("id", bookId)
        .single();
      if (error || !book) throw new Error(error?.message || "Book not found");
      if ((book as any).organization_id !== organizationId) {
        throw new Error("BLOCKED: Book belongs to a different organization");
      }
    } else {
      // create
      const { error } = await adminSupabase
        .from("books")
        .upsert(
          {
            id: bookId,
            organization_id: organizationId,
            title,
            level,
            source: "BOOKGEN_PRO",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      if (error) throw new Error(error.message);
    }

    // Load canonical title for existing mode if not provided
    let resolvedTitle = title;
    if (!resolvedTitle) {
      const { data: book, error } = await adminSupabase.from("books").select("title").eq("id", bookId).single();
      if (error || !book) throw new Error(error?.message || "Book not found");
      resolvedTitle = String((book as any).title || "").trim();
      if (!resolvedTitle) throw new Error("BLOCKED: Book is missing title");
    }

    await emitAgentJobEvent(jobId, "storage_write", 10, "Ensuring shared image library index exists", { bookId }).catch(() => {});

    // 2) Ensure images-index exists
    const libraryIndexPath = `library/${bookId}/images-index.json`;
    const hasIndex = await storageExists(adminSupabase, "books", libraryIndexPath);
    if (!hasIndex) {
      // Create an empty index so later flows can upsert mappings.
      await uploadJson(
        adminSupabase,
        "books",
        libraryIndexPath,
        { bookSlug: bookId, updatedAt: new Date().toISOString(), srcMap: {} },
        true,
      );
    }

    // 3) Create version row (canonical inputs live at root: {bookId}/{bookVersionId}/...)
    const bookVersionId = crypto.randomUUID();
    const canonicalPath = `${bookId}/${bookVersionId}/canonical.json`;
    const designTokensPath = `${bookId}/${bookVersionId}/design_tokens.json`;
    const figuresPath = libraryIndexPath; // re-use shared library mapping

    await emitAgentJobEvent(jobId, "storage_write", 18, "Creating book version metadata", {
      bookId,
      bookVersionId,
    }).catch(() => {});

    const { error: versionErr } = await adminSupabase.from("book_versions").insert({
      book_id: bookId,
      book_version_id: bookVersionId,
      schema_version: "1.0",
      source: "BOOKGEN_PRO",
      exported_at: new Date().toISOString(),
      canonical_path: canonicalPath,
      figures_path: figuresPath,
      design_tokens_path: designTokensPath,
      status: "active",
    });
    if (versionErr) throw new Error(versionErr.message);

    // 4) Upload minimal design tokens (renderer tolerates null, but keep the bundle complete)
    await uploadJson(adminSupabase, "books", designTokensPath, { schemaVersion: "1.0", source: "BOOKGEN_PRO" }, true);

    // 5) Build + validate skeleton scaffold (fast)
    const skeleton = buildScaffoldSkeleton({
      bookId,
      bookVersionId,
      title: resolvedTitle,
      level,
      language,
      chapterCount,
      promptPackId,
      promptPackVersion,
    });
    const v = validateBookSkeleton(skeleton);
    if (!v.ok) {
      throw new Error(`BLOCKED: Scaffold skeleton validation failed (${v.issues.length} issue(s))`);
    }

    await emitAgentJobEvent(jobId, "storage_write", 25, "Saving skeleton scaffold", { bookId, bookVersionId }).catch(() => {});

    // 6) Save skeleton via edge (updates authoring_mode + skeleton pointers; also compiles)
    const saveRes = await callEdgeAsAgent({
      orgId: organizationId,
      path: "book-version-save-skeleton",
      body: { bookId, bookVersionId, skeleton: v.skeleton, note: "BookGen Pro scaffold", compileCanonical: true },
    });
    if (saveRes?.ok !== true) throw new Error("Failed to save skeleton scaffold");

    // 7) Upload canonical.json at the root path (required by book-worker input gate)
    const compiled = compileSkeletonToCanonical(v.skeleton);
    await uploadJson(adminSupabase, "books", canonicalPath, compiled, true);

    if (!enqueueChapters) {
      await emitAgentJobEvent(jobId, "done", 100, "Book scaffold complete (chapters not enqueued)", {
        bookId,
        bookVersionId,
        chapterCount,
        enqueueChapters,
      }).catch(() => {});
      return {
        ok: true,
        mode,
        bookId,
        bookVersionId,
        chapterCount,
        canonicalPath,
        figuresPath,
        designTokensPath,
        enqueueChapters,
      };
    }

    // 8) Enqueue first chapter job (chain)
    await emitAgentJobEvent(jobId, "generating", 35, "Enqueuing chapter generation", {
      chapterIndex: 0,
      chapterCount,
      enqueueChapters,
    }).catch(() => {});

    const { data: queued, error: enqueueErr } = await adminSupabase
      .from("ai_agent_jobs")
      .insert({
        organization_id: organizationId,
        job_type: "book_generate_chapter",
        status: "queued",
        payload: {
          bookId,
          bookVersionId,
          chapterIndex: 0,
          chapterCount,
          topic,
          level,
          language,
          userInstructions,
          promptPackId,
          promptPackVersion,
          ...(imagePromptLanguage ? { imagePromptLanguage } : {}),
          ...(layoutProfile ? { layoutProfile } : {}),
          ...(microheadingDensity ? { microheadingDensity } : {}),
          ...(typeof sectionMaxTokens === "number" ? { sectionMaxTokens } : {}),
          // Model selection is required by the chapter job (write stage)
          writeModel,
        },
      })
      .select("id")
      .single();
    if (enqueueErr || !queued?.id) throw new Error(enqueueErr?.message || "Failed to enqueue chapter job");

    await emitAgentJobEvent(jobId, "done", 100, "Book generation queued", {
      bookId,
      bookVersionId,
      chapterCount,
      firstChapterJobId: queued.id,
      enqueueChapters,
    }).catch(() => {});

    return {
      ok: true,
      mode,
      bookId,
      bookVersionId,
      chapterCount,
      canonicalPath,
      figuresPath,
      designTokensPath,
      firstChapterJobId: queued.id,
      enqueueChapters,
    };
  }
}


