/**
 * book-export-studytexts (HYBRID AUTH)
 *
 * Exports canonical book content (optionally with an overlay applied) into a Course's `studyTexts[]`.
 * Also upserts `book_elearning_links` records so overlay edits can mark downstream outputs stale.
 *
 * Request (POST):
 * {
 *   bookId: string,
 *   bookVersionId: string,
 *   overlayId?: string,
 *   courseId: string,
 *   mode?: "chapter" | "section" // default: "chapter"
 * }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import { upsertCourseMetadata } from "../_shared/metadata.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface Body {
  bookId: string;
  bookVersionId: string;
  overlayId?: string;
  courseId: string;
  mode?: "chapter" | "section";
}

type StudyText = {
  id: string;
  title: string;
  content: string;
  order: number;
  learningObjectives?: string[];
  metadata?: Record<string, unknown>;
  source?: {
    type: "book";
    bookId: string;
    bookVersionId: string;
    overlayId?: string | null;
    overlayUpdatedAt?: string | null;
    chapterIndex?: number;
    sectionIndex?: number;
    paragraphIds?: string[];
  };
};

type CourseEnvelope = {
  id?: string;
  format?: string;
  version?: string | number;
  content: any;
};

function isEnvelope(x: any): x is CourseEnvelope {
  return !!x && typeof x === "object" && "content" in x && "format" in x;
}

function stripHtml(s: string): string {
  return String(s || "").replace(/<[^>]*>/g, "");
}

function applyOverlayToCanonical(canonical: any, overlay: any): any {
  const entries = Array.isArray(overlay?.paragraphs) ? overlay.paragraphs : [];
  const map = new Map<string, string>();
  for (const e of entries) {
    const pid = e?.paragraph_id;
    const rewritten = e?.rewritten;
    if (typeof pid === "string" && typeof rewritten === "string") {
      map.set(pid, rewritten);
    }
  }
  if (map.size === 0) return canonical;

  const next = structuredClone(canonical);
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const id = node.id;
    if (typeof id === "string" && typeof node.basis === "string" && map.has(id)) {
      node.basis = map.get(id);
    }
    Object.values(node).forEach(walk);
  };
  walk(next);
  return next;
}

function extractParagraphsFromBlocks(blocks: any): Array<{ id: string; basis: string; images: any[] }> {
  const out: Array<{ id: string; basis: string; images: any[] }> = [];
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const t = typeof node.type === "string" ? node.type : "";
    if (t === "paragraph") {
      const id = typeof node.id === "string" ? node.id : "";
      const basis = typeof node.basis === "string" ? node.basis : "";
      const images = Array.isArray(node.images) ? node.images : [];
      if (id && basis) out.push({ id, basis, images });
      return;
    }
    if (t === "subparagraph") {
      walk(node.content);
      return;
    }
    // Fallback
    if (Array.isArray(node.content)) walk(node.content);
    if (Array.isArray(node.blocks)) walk(node.blocks);
    if (Array.isArray(node.items)) walk(node.items);
  };
  walk(blocks);
  return out;
}

function buildStudyTextContentForChapter(chapter: any): { content: string; paragraphIds: string[] } {
  const sections = Array.isArray(chapter?.sections) ? chapter.sections : [];
  const parts: string[] = [];
  const ids: string[] = [];

  if (sections.length > 0) {
    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      const sectionTitle =
        (typeof section?.title === "string" && section.title) ||
        (typeof section?.meta?.title === "string" && section.meta.title) ||
        `Section ${si + 1}`;

      parts.push(`[SECTION:${sectionTitle}]`);

      const paragraphs = extractParagraphsFromBlocks(section?.content ?? section?.blocks ?? section?.items);
      for (const p of paragraphs) {
        ids.push(p.id);
        parts.push(stripHtml(p.basis));
        // Attach images as markers if src is present
        for (const img of p.images || []) {
          const src = typeof img?.src === "string" ? img.src : "";
          if (src) parts.push(`[IMAGE:${src}]`);
        }
        parts.push(""); // blank line between paragraphs
      }
    }
  } else {
    parts.push(`[SECTION:Chapter]`);
    const paragraphs = extractParagraphsFromBlocks(chapter?.content ?? chapter?.blocks ?? chapter?.items);
    for (const p of paragraphs) {
      ids.push(p.id);
      parts.push(stripHtml(p.basis));
      for (const img of p.images || []) {
        const src = typeof img?.src === "string" ? img.src : "";
        if (src) parts.push(`[IMAGE:${src}]`);
      }
      parts.push("");
    }
  }

  return { content: parts.join("\n").trim(), paragraphIds: ids };
}

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, { "Content-Type": "application/json", "X-Request-Id": requestId }),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method not allowed" }, httpStatus: 405, requestId }, 200);
  }

  try {
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, httpStatus: 401, requestId }, 200);
    }

    const orgId = requireOrganizationId(auth);

    let body: Body;
    try {
      body = await req.json() as Body;
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
    const bookVersionId = typeof body.bookVersionId === "string" ? body.bookVersionId.trim() : "";
    const courseId = typeof body.courseId === "string" ? body.courseId.trim() : "";
    const overlayId = typeof body.overlayId === "string" ? body.overlayId.trim() : null;
    const mode = body.mode === "section" ? "section" : "chapter";

    if (!bookId || !bookVersionId || !courseId) {
      return json({ ok: false, error: { code: "invalid_request", message: "bookId, bookVersionId, and courseId are required" }, httpStatus: 400, requestId }, 200);
    }

    // Verify course belongs to org (service role bypasses RLS).
    const { data: meta, error: metaErr } = await adminSupabase
      .from("course_metadata")
      .select("id, organization_id")
      .eq("id", courseId)
      .maybeSingle();
    if (metaErr) {
      return json({ ok: false, error: { code: "db_error", message: metaErr.message }, httpStatus: 500, requestId }, 200);
    }
    if (!meta) {
      return json({ ok: false, error: { code: "not_found", message: "Course not found" }, httpStatus: 404, requestId }, 200);
    }
    if (String((meta as any).organization_id) !== String(orgId)) {
      return json({ ok: false, error: { code: "forbidden", message: "Not authorized for this course" }, httpStatus: 403, requestId }, 200);
    }

    // Load book version paths
    const { data: version, error: vErr } = await adminSupabase
      .from("book_versions")
      .select("canonical_path")
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId)
      .single();
    if (vErr || !version?.canonical_path) {
      return json({ ok: false, error: { code: "not_found", message: "Book version not found" }, httpStatus: 404, requestId }, 200);
    }

    // Download canonical JSON
    const { data: canonicalFile, error: canErr } = await adminSupabase.storage.from("books").download(version.canonical_path);
    if (canErr || !canonicalFile) {
      return json({ ok: false, error: { code: "storage_error", message: canErr?.message || "Failed to download canonical JSON" }, httpStatus: 500, requestId }, 200);
    }
    const canonicalText = await canonicalFile.text();
    const canonical = JSON.parse(canonicalText);

    // Optional overlay
    let overlayUpdatedAt: string | null = null;
    let overlayJson: any = null;
    if (overlayId) {
      const { data: ov, error: ovErr } = await adminSupabase
        .from("book_overlays")
        .select("id, overlay_path, updated_at")
        .eq("id", overlayId)
        .eq("book_id", bookId)
        .eq("book_version_id", bookVersionId)
        .single();
      if (ovErr || !ov?.overlay_path) {
        return json({ ok: false, error: { code: "not_found", message: "Overlay not found" }, httpStatus: 404, requestId }, 200);
      }
      overlayUpdatedAt = ov.updated_at ? String(ov.updated_at) : null;

      const { data: ovFile, error: ovDlErr } = await adminSupabase.storage.from("books").download(ov.overlay_path);
      if (ovDlErr || !ovFile) {
        return json({ ok: false, error: { code: "storage_error", message: ovDlErr?.message || "Failed to download overlay JSON" }, httpStatus: 500, requestId }, 200);
      }
      overlayJson = JSON.parse(await ovFile.text());
    }

    const assembled = overlayJson ? applyOverlayToCanonical(canonical, overlayJson) : canonical;

    const chapters = Array.isArray(assembled?.chapters) ? assembled.chapters : [];
    const bookTitle = typeof assembled?.meta?.title === "string" ? assembled.meta.title : bookId;

    // Load course JSON
    const coursePath = `${courseId}/course.json`;
    const { data: courseFile, error: courseDlErr } = await adminSupabase.storage.from("courses").download(coursePath);
    if (courseDlErr || !courseFile) {
      return json({ ok: false, error: { code: "not_found", message: "Course JSON not found in storage" }, httpStatus: 404, requestId }, 200);
    }
    const courseRaw = JSON.parse(await courseFile.text());
    const envelope = isEnvelope(courseRaw) ? (courseRaw as CourseEnvelope) : null;
    const course = envelope ? envelope.content : courseRaw;

    const existing: any[] = Array.isArray(course?.studyTexts) ? course.studyTexts : [];
    const existingById = new Map<string, any>();
    for (const st of existing) {
      const id = typeof st?.id === "string" ? st.id : "";
      if (id) existingById.set(id, st);
    }

    const newStudyTexts: StudyText[] = [];
    const linkRows: Array<{ studyTextId: string; paragraphIds: string[] }> = [];

    let nextOrder = existing.reduce((m, st) => {
      const o = typeof st?.order === "number" ? st.order : 0;
      return Math.max(m, o);
    }, 0) + 1;

    if (mode === "chapter") {
      for (let ci = 0; ci < chapters.length; ci++) {
        const ch = chapters[ci];
        const chapterTitle =
          (typeof ch?.title === "string" && ch.title) ||
          (typeof ch?.meta?.title === "string" && ch.meta.title) ||
          `Chapter ${ci + 1}`;

        const { content, paragraphIds } = buildStudyTextContentForChapter(ch);
        if (!content) continue;

        const id = `book:${bookId}:${bookVersionId}:ch:${ci}`;
        const prev = existingById.get(id);
        const order = typeof prev?.order === "number" ? prev.order : nextOrder++;

        newStudyTexts.push({
          id,
          title: `${bookTitle} — ${chapterTitle}`,
          content,
          order,
          source: {
            type: "book",
            bookId,
            bookVersionId,
            overlayId,
            overlayUpdatedAt,
            chapterIndex: ci,
            paragraphIds,
          },
        });
        linkRows.push({ studyTextId: id, paragraphIds });
      }
    } else {
      // "section" mode: create a study text per section
      for (let ci = 0; ci < chapters.length; ci++) {
        const ch = chapters[ci];
        const chapterTitle =
          (typeof ch?.title === "string" && ch.title) ||
          (typeof ch?.meta?.title === "string" && ch.meta.title) ||
          `Chapter ${ci + 1}`;
        const sections = Array.isArray(ch?.sections) ? ch.sections : [];
        for (let si = 0; si < sections.length; si++) {
          const s = sections[si];
          const sectionTitle =
            (typeof s?.title === "string" && s.title) ||
            (typeof s?.meta?.title === "string" && s.meta.title) ||
            `Section ${si + 1}`;
          const paragraphs = extractParagraphsFromBlocks(s?.content ?? s?.blocks ?? s?.items);
          if (paragraphs.length === 0) continue;
          const paragraphIds = paragraphs.map((p) => p.id);
          const lines: string[] = [];
          lines.push(`[SECTION:${sectionTitle}]`);
          for (const p of paragraphs) {
            lines.push(stripHtml(p.basis));
            for (const img of p.images || []) {
              const src = typeof img?.src === "string" ? img.src : "";
              if (src) lines.push(`[IMAGE:${src}]`);
            }
            lines.push("");
          }
          const content = lines.join("\n").trim();
          const id = `book:${bookId}:${bookVersionId}:ch:${ci}:sec:${si}`;
          const prev = existingById.get(id);
          const order = typeof prev?.order === "number" ? prev.order : nextOrder++;

          newStudyTexts.push({
            id,
            title: `${bookTitle} — ${chapterTitle} — ${sectionTitle}`,
            content,
            order,
            source: {
              type: "book",
              bookId,
              bookVersionId,
              overlayId,
              overlayUpdatedAt,
              chapterIndex: ci,
              sectionIndex: si,
              paragraphIds,
            },
          });
          linkRows.push({ studyTextId: id, paragraphIds });
        }
      }
    }

    if (newStudyTexts.length === 0) {
      return json({ ok: false, error: { code: "invalid_request", message: "No paragraphs found to export" }, httpStatus: 400, requestId }, 200);
    }

    // Merge into course.studyTexts
    const mergedById = new Map<string, any>(existingById);
    for (const st of newStudyTexts) {
      mergedById.set(st.id, st);
    }
    const merged = Array.from(mergedById.values());
    merged.sort((a, b) => {
      const ao = typeof a?.order === "number" ? a.order : 0;
      const bo = typeof b?.order === "number" ? b.order : 0;
      return ao - bo;
    });
    merged.forEach((st, idx) => {
      st.order = idx + 1;
    });

    course.studyTexts = merged;
    course.updatedAt = new Date().toISOString();
    course.contentVersion = new Date().toISOString();

    const persist = envelope ? { ...envelope, content: course } : course;
    const updatedContent = JSON.stringify(persist, null, 2);
    const { error: upCourseErr } = await adminSupabase.storage
      .from("courses")
      .upload(coursePath, new Blob([updatedContent], { type: "application/json" }), { upsert: true, contentType: "application/json" });
    if (upCourseErr) {
      return json({ ok: false, error: { code: "storage_error", message: upCourseErr.message }, httpStatus: 500, requestId }, 200);
    }

    // Metadata + catalog update
    await upsertCourseMetadata(adminSupabase as any, courseId, persist as any);

    // Upsert link rows
    const nowIso = new Date().toISOString();
    const linkInserts = linkRows.map((lr) => ({
      organization_id: orgId,
      book_id: bookId,
      book_version_id: bookVersionId,
      overlay_id: overlayId,
      kind: "study_text",
      course_id: courseId,
      study_text_id: lr.studyTextId,
      source_paragraph_ids: lr.paragraphIds,
      overlay_updated_at_at_link: overlayUpdatedAt,
      stale: false,
      stale_reason: null,
      last_synced_at: nowIso,
    }));

    const { error: linkErr } = await adminSupabase
      .from("book_elearning_links")
      .upsert(linkInserts, { onConflict: "course_id,kind,study_text_id" });
    if (linkErr) {
      return json({ ok: false, error: { code: "db_error", message: linkErr.message }, httpStatus: 500, requestId }, 200);
    }

    return json({
      ok: true,
      courseId,
      mode,
      studyTextsUpserted: newStudyTexts.length,
      linksUpserted: linkInserts.length,
      requestId,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-export-studytexts] Unhandled error (${requestId}):`, message);
    return json({ ok: false, error: { code: "internal_error", message }, httpStatus: 500, requestId }, 200);
  }
});


