/**
 * book_studio_rewrite_chapter strategy
 *
 * Rewrites all paragraphs in a specified chapter using AI and saves the rewrites
 * into a book overlay (v2 format).
 *
 * Payload:
 * {
 *   bookId: string,
 *   bookVersionId: string,
 *   overlayId: string,
 *   chapterIndex: number,
 *   skipMicroheadings?: boolean  // If true, only rewrite paragraphs
 * }
 */
import type { JobContext, JobExecutor } from "./types.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emitAgentJobEvent } from "../../_shared/job-events.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(`BLOCKED: ${name} is REQUIRED`);
  }
  return v;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`BLOCKED: ${key} is REQUIRED`);
  }
  return v.trim();
}

function requireNumber(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`BLOCKED: ${key} is REQUIRED (number)`);
  }
  return Math.floor(v);
}

function optionalBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const v = payload[key];
  if (typeof v !== "boolean") return undefined;
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const AGENT_TOKEN = requireEnv("AGENT_TOKEN");

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

interface RewriteEntry {
  paragraph_id: string;
  rewritten: string;
}

interface OverlayV2 {
  paragraphs: RewriteEntry[];
  microheadings?: Record<string, string>;
}

async function aiRewriteText(opts: {
  currentText: string;
  segmentType: "book_paragraph" | "book_microheading";
  styleHints?: string[];
  organizationId: string;
}): Promise<string> {
  const { currentText, segmentType, styleHints, organizationId } = opts;

  const url = `${SUPABASE_URL}/functions/v1/ai-rewrite-text`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      "x-organization-id": organizationId,
    },
    body: JSON.stringify({
      segmentType,
      currentText,
      styleHints,
      candidateCount: 1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `[book_studio_rewrite_chapter] ai-rewrite-text failed (${res.status}): ${errText || res.statusText}`,
    );
  }

  const json = await res.json();
  if (json.candidates && Array.isArray(json.candidates) && json.candidates.length > 0) {
    const text = json.candidates[0]?.text;
    if (typeof text === "string" && text.trim()) return text;
    throw new Error("[book_studio_rewrite_chapter] ai-rewrite-text returned empty candidate text");
  }
  throw new Error("[book_studio_rewrite_chapter] ai-rewrite-text returned no candidates");
}

async function downloadJson(bucket: string, path: string): Promise<any> {
  const { data, error } = await adminSupabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message || `Failed to download ${bucket}/${path}`);
  const text = await data.text();
  return JSON.parse(text);
}

export class BookStudioRewriteChapter implements JobExecutor {
  async execute(context: JobContext): Promise<any> {
    const { payload, jobId } = context;

    const p = (payload || {}) as Record<string, unknown>;

    const organizationId = requireString(p, "organization_id");
    const bookId = requireString(p, "bookId");
    const bookVersionId = requireString(p, "bookVersionId");
    const overlayId = requireString(p, "overlayId");
    const chapterIndex = requireNumber(p, "chapterIndex");
    const skipMicroheadings = optionalBoolean(p, "skipMicroheadings") === true;

    if (chapterIndex < 0) throw new Error("BLOCKED: chapterIndex must be >= 0");

    // 1. Download canonical
    try {
      await emitAgentJobEvent(jobId, "generating", 10, "Loading canonical JSON", {
        bookId,
        bookVersionId,
        overlayId,
        chapterIndex,
      });
    } catch {
      // best-effort
    }

    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("canonical_path")
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId)
      .maybeSingle();

    if (versionErr || !version?.canonical_path) {
      throw new Error(versionErr?.message || "Book version canonical not found");
    }

    const canonical = await downloadJson("books", String(version.canonical_path));

    const chapters = Array.isArray(canonical?.chapters) ? canonical.chapters : [];
    if (chapterIndex >= chapters.length) {
      throw new Error(`chapterIndex ${chapterIndex} out of range (book has ${chapters.length} chapters)`);
    }

    const chapter = chapters[chapterIndex];

    // 2. Collect paragraphs from the chapter
    const paragraphs: Array<{ id: string; basis: string }> = [];

    function walk(node: any) {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node !== "object") return;

      const id = typeof node.id === "string" ? node.id : "";
      const basis = typeof node.basis === "string" ? node.basis : "";
      const nodeType = typeof node.type === "string" ? node.type : "";

      if (nodeType === "paragraph" && id && basis) {
        paragraphs.push({ id, basis });
      }

      for (const v of Object.values(node)) walk(v);
    }

    walk(chapter);

    if (paragraphs.length === 0) {
      throw new Error("No paragraphs found in chapter");
    }

    // 3. Rewrite each paragraph using AI
    const rewrittenParagraphs: RewriteEntry[] = [];
    const microheadings: Record<string, string> = {};
    let rewriteCount = 0;
    let microCount = 0;

    try {
      await emitAgentJobEvent(jobId, "generating", 20, `Rewriting ${paragraphs.length} paragraphs`, {
        paragraphs: paragraphs.length,
        skipMicroheadings,
      });
    } catch {
      // best-effort
    }

    for (const p of paragraphs) {
      // Rewrite paragraph
      const rewritten = await aiRewriteText({
        currentText: p.basis,
        segmentType: "book_paragraph",
        styleHints: ["simplify"],
        organizationId,
      });

      if (rewritten && rewritten !== p.basis) {
        rewrittenParagraphs.push({ paragraph_id: p.id, rewritten });
        rewriteCount++;
      }

      // Generate microheading (optional)
      if (!skipMicroheadings) {
        const microheading = await aiRewriteText({
          currentText: p.basis.slice(0, 500), // Use first 500 chars for context
          segmentType: "book_microheading",
          organizationId,
        });
        if (microheading && microheading.trim().length > 0 && microheading.length <= 80) {
          microheadings[p.id] = microheading.trim();
          microCount++;
        }
      }

      // Rate limit: small delay between calls
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // 4. Get overlay path and merge with existing rewrites
    const { data: overlay, error: overlayErr } = await adminSupabase
      .from("book_overlays")
      .select("overlay_path")
      .eq("id", overlayId)
      .single();

    if (overlayErr || !overlay?.overlay_path) {
      return { error: `Overlay not found: ${overlayErr?.message}` };
    }

    let existingOverlay: OverlayV2 = { paragraphs: [] };
    try {
      existingOverlay = await downloadJson("books", overlay.overlay_path);
    } catch {
      // Overlay doesn't exist yet, start fresh
    }

    // Merge rewrites
    const existingMap = new Map<string, string>();
    for (const e of existingOverlay.paragraphs || []) {
      if (e.paragraph_id && e.rewritten) {
        existingMap.set(e.paragraph_id, e.rewritten);
      }
    }
    for (const e of rewrittenParagraphs) {
      existingMap.set(e.paragraph_id, e.rewritten);
    }

    const mergedParagraphs = Array.from(existingMap.entries()).map(([paragraph_id, rewritten]) => ({
      paragraph_id,
      rewritten,
    }));

    // Merge microheadings
    const mergedMicroheadings = {
      ...(existingOverlay.microheadings || {}),
      ...microheadings,
    };

    // 5. Save overlay via edge function
    try {
      await emitAgentJobEvent(jobId, "storage_write", 85, "Saving overlay rewrites", {
        rewritesCount: rewriteCount,
        microheadingsCount: microCount,
      });
    } catch {
      // best-effort
    }

    const saveUrl = `${SUPABASE_URL}/functions/v1/book-save-overlay`;

    const saveRes = await fetch(saveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": AGENT_TOKEN,
        "x-organization-id": organizationId,
      },
      body: JSON.stringify({
        overlayId,
        rewrites: {
          paragraphs: mergedParagraphs,
          microheadings: Object.keys(mergedMicroheadings).length > 0 ? mergedMicroheadings : undefined,
        },
        note: `AI rewrite of chapter ${chapterIndex + 1}`,
      }),
    });

    if (!saveRes.ok) {
      const errText = await saveRes.text();
      throw new Error(`Failed to save overlay: ${errText}`);
    }

    const saveJson = await saveRes.json();
    if (!saveJson.ok) {
      throw new Error(`Failed to save overlay: ${saveJson.error?.message || JSON.stringify(saveJson)}`);
    }

    return {
      ok: true,
      bookId,
      overlayId,
      chapterIndex,
      paragraphsProcessed: paragraphs.length,
      rewritesCount: rewriteCount,
      microheadingsCount: microCount,
    };
  }
}

