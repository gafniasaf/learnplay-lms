/**
 * Import Legacy Course Edge Function
 *
 * One-way import from MES legacy DB into IgniteZero:
 * - Fetch legacy course payload (via get_course_content)
 * - (Optional) migrate images from legacy blob → Supabase Storage (media-library)
 * - Save course.json to courses bucket (path: <courseId>/course.json)
 * - Upsert course_metadata for catalog visibility
 *
 * NOTE: This function MUST NOT hardcode any secrets. Configure:
 * - LEGACY_DATABASE_URL (required)
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { getRequestId } from "../_shared/log.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { upsertCourseMetadata } from "../_shared/metadata.ts";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEGACY_DATABASE_URL = Deno.env.get("LEGACY_DATABASE_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!LEGACY_DATABASE_URL) {
  throw new Error("LEGACY_DATABASE_URL is REQUIRED (set as an Edge secret).");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are REQUIRED.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const LEGACY_BLOB_BASE = "https://expertcollegeresources.blob.core.windows.net/assets-cnt";
const MEDIA_BUCKET = "media-library";
const COURSES_BUCKET = "courses";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface LegacyCourse {
  id: number;
  name: string;
  category: string | null;
  image: string | null;
}

interface LegacyTopic {
  mes_topic_id: number;
  mes_topic_name: string;
  mes_topic_parent_id: number | null;
  tree_level: number;
  mes_exercise_id: number | null;
  mes_exercise_studytext_id: number | null;
  mes_exercise_name: string | null;
  mes_exercise_type: string | null;
  mes_exercise_metadata: string | null;
  mes_exercise_key_metadata: string | null;
}

interface LegacySubject {
  mes_subject_id: number;
  mes_subject_order: number;
  mes_subject_name: string;
  mes_subject_parent_id: number | null;
  tree_level: number;
  mes_studytext_id: number | null;
  mes_resource_language: string | null;
  mes_resource_displayname: string | null;
  mes_resource_content_text: string | null;
}

interface LegacyCourseContent {
  course: LegacyCourse[];
  topics: LegacyTopic[];
  subjects: LegacySubject[];
}

type ImportLegacyCourseRequest = {
  action?: "import" | "list";
  limit?: number;
  courseId?: number;
  migrateImages?: boolean;
  locale?: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY DATABASE
// ═══════════════════════════════════════════════════════════════════════════

async function fetchLegacyCourseContent(courseId: number): Promise<LegacyCourseContent> {
  const pool = new Pool(LEGACY_DATABASE_URL!, 1);
  
  try {
    const connection = await pool.connect();
    try {
      const result = await connection.queryObject<{ get_course_content: LegacyCourseContent }>(
        'SELECT get_course_content($1)',
        [courseId]
      );
      const row = result.rows?.[0]?.get_course_content as any;
      if (!row) throw new Error("legacy_query_failed: empty_result");
      return row as LegacyCourseContent;
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
}

async function listLegacyCourses(limit: number): Promise<Array<{ id: number; name: string }>> {
  const pool = new Pool(LEGACY_DATABASE_URL!, 1);
  try {
    const connection = await pool.connect();
    try {
      const result = await connection.queryObject<{ id: number; name: string }>(
        "SELECT mes_course_id AS id, mes_course_name AS name FROM mes_course ORDER BY mes_course_id LIMIT $1",
        [Math.max(1, Math.min(50, Math.floor(limit)))]
      );
      return (result.rows ?? []).map((r: any) => ({ id: Number(r.id), name: String(r.name ?? "") }));
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

function normalizeLegacyImageUrl(url: string): string {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return `${LEGACY_BLOB_BASE}${s}`;
  return `${LEGACY_BLOB_BASE}/${s}`;
}

function fileExtForContentType(contentType: string): string {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("webp")) return "webp";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("gif")) return "gif";
  return "bin";
}

async function migrateImageToMediaLibrary(args: {
  originalUrl: string;
  courseId: string;
}): Promise<{ ok: true; url: string } | { ok: false; url: string; error: string }> {
  const originalUrl = normalizeLegacyImageUrl(args.originalUrl);
  if (!originalUrl) return { ok: false, url: args.originalUrl, error: "empty_url" };

  try {
    const resp = await fetch(originalUrl);
    if (!resp.ok) {
      return { ok: false, url: originalUrl, error: `http_${resp.status}` };
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const ext = fileExtForContentType(contentType);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const path = `courses/${args.courseId}/legacy-import/${crypto.randomUUID()}.${ext}`;

    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: contentType });
    const { error: upErr } = await admin.storage.from(MEDIA_BUCKET).upload(path, blob, {
      upsert: true,
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    });
    if (upErr) {
      return { ok: false, url: originalUrl, error: `upload_failed: ${upErr.message}` };
    }
    const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (err) {
    return {
      ok: false,
      url: originalUrl,
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

function extractImageUrls(legacy: LegacyCourseContent): string[] {
  const urls = new Set<string>();

  // Course image
  const course = legacy.course[0];
  if (course?.image) {
    urls.add(course.image);
  }

  // Images and multimedia in study texts
  for (const subject of legacy.subjects || []) {
    // Check all possible content fields (SQL function may return content in different fields)
    const content = (subject as any).study_text || 
                    (subject as any).regexp_replace || 
                    subject.mes_resource_content_text || '';
    if (!content) continue;
    
    // Extract custom [$IMG(...)] syntax: [$IMG("/media/Images/file.jpg";200,300)]
    const customImgMatches = content.matchAll(/\$IMG\(["']([^"']+)["']/gi);
    for (const match of customImgMatches) {
      urls.add(match[1]);
    }
    
    // Extract image URLs from standard HTML
    const imgMatches = content.matchAll(/<img\s+[^>]*src="([^"]+)"[^>]*>/gi);
    for (const match of imgMatches) {
      urls.add(match[1]);
    }
    
    // Extract iframe/embed sources (HTML5 animations)
    const iframeMatches = content.matchAll(/<iframe[^>]*src="([^"]+)"[^>]*>/gi);
    for (const match of iframeMatches) {
      urls.add(match[1]);
    }
    
    const embedMatches = content.matchAll(/<embed[^>]*src="([^"]+)"[^>]*>/gi);
    for (const match of embedMatches) {
      urls.add(match[1]);
    }
    
    // Extract object data (Flash/HTML5)
    const objectMatches = content.matchAll(/<object[^>]*data="([^"]+)"[^>]*>/gi);
    for (const match of objectMatches) {
      urls.add(match[1]);
    }
    
    // Extract video sources
    const videoMatches = content.matchAll(/<video[^>]*src="([^"]+)"[^>]*>/gi);
    for (const match of videoMatches) {
      urls.add(match[1]);
    }
    
    // Extract HTML file links (HTML5 animations)
    const htmlLinkMatches = content.matchAll(/href=["']([^"']*\.html[^"']*)["']/gi);
    for (const match of htmlLinkMatches) {
      urls.add(match[1]);
    }
  }

  return Array.from(urls);
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORMATION
// ═══════════════════════════════════════════════════════════════════════════

function decodeBasicHtmlEntities(input: string): string {
  const s = String(input || '');
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function legacyHtmlToStudyTextMarkers(args: { title: string; html: string }): string {
  const title = String(args.title || 'Study Text');
  let s = String(args.html || '');

  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Convert custom [$IMG(...)] syntax to [IMAGE:...] markers
  // Format: [$IMG("/media/Images/file.jpg";200,300)] -> [IMAGE:/media/Images/file.jpg]
  s = s.replace(/\$IMG\(["']([^"']+)["'][^;]*\)/gi, (_m, path) => `\n[IMAGE:${path}]\n`);

  // Convert standard HTML images into explicit markers.
  s = s.replace(/<img\s+[^>]*src="([^"]+)"[^>]*>/gi, (_m, src) => `\n[IMAGE:${src}]\n`);

  // Convert HTML5 animations/interactive content into markers
  // iframe (HTML5 animations, embedded content)
  s = s.replace(/<iframe[^>]*src="([^"]+)"[^>]*>.*?<\/iframe>/gis, (_m, src) => `\n[ANIMATION:${src}]\n`);
  
  // embed (Flash, HTML5)
  s = s.replace(/<embed[^>]*src="([^"]+)"[^>]*>/gi, (_m, src) => `\n[ANIMATION:${src}]\n`);
  
  // object (Flash, HTML5)
  s = s.replace(/<object[^>]*data="([^"]+)"[^>]*>.*?<\/object>/gis, (_m, data) => `\n[ANIMATION:${data}]\n`);
  
  // video
  s = s.replace(/<video[^>]*src="([^"]+)"[^>]*>.*?<\/video>/gis, (_m, src) => `\n[VIDEO:${src}]\n`);
  
  // YouTube/Vimeo links (detect via text matching)
  s = s.replace(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[^\s<>"']+)/gi, 
    (url) => `\n[VIDEO:${url}]\n`);
  
  // HTML file links (HTML5 animations)
  s = s.replace(/<a[^>]*href=["']([^"']*\.html[^"']*)["'][^>]*>(.*?)<\/a>/gi, (_m, href, text) => {
    const linkText = text.trim() || 'Animation';
    return `\n[ANIMATION:${href}]\n${linkText}\n`;
  });

  // Preserve custom block syntax markers (convert to readable format but keep structure)
  // [$BOX], [$CELL], [$BLOCK], etc. - convert to section markers
  s = s.replace(/\$BOX\]/gi, '\n[BOX]\n');
  s = s.replace(/\$\/BOX\]/gi, '\n[/BOX]\n');
  s = s.replace(/\$CELL\]/gi, '\n[CELL]\n');
  s = s.replace(/\$\/CELL\]/gi, '\n[/CELL]\n');
  s = s.replace(/\$BLOCK\]/gi, '\n[BLOCK]\n');
  s = s.replace(/\$\/BLOCK\]/gi, '\n[/BLOCK]\n');

  // Convert common block-ish tags into line breaks.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p\s*>/gi, '\n');
  s = s.replace(/<\/div\s*>/gi, '\n');
  s = s.replace(/<\/li\s*>/gi, '\n');

  // Make list items readable.
  s = s.replace(/<li\s*[^>]*>/gi, '- ');

  // Remove remaining HTML tags (but preserve marker content).
  s = s.replace(/<[^>]+>/g, '');

  // Decode a minimal set of entities.
  s = decodeBasicHtmlEntities(s);

  // Normalize whitespace while keeping markers on their own lines.
  const lines = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const safeTitle = title.replace(/\]/g, '').slice(0, 120);
  const hasSection = lines.some((l) => l.startsWith('[SECTION:'));
  const out = hasSection ? lines : [`[SECTION:${safeTitle}]`, ...lines];
  return out.join('\n');
}

function transformLegacyCourse(
  legacy: LegacyCourseContent,
  options: { locale: string; imageUrlMap: Map<string, string> }
) {
  const { locale, imageUrlMap } = options;
  const course = legacy.course[0];

  if (!course) {
    throw new Error('No course data found');
  }

  // Transform groups from topics
  const uniqueTopics = new Map<number, LegacyTopic>();
  for (const topic of legacy.topics || []) {
    if (!uniqueTopics.has(topic.mes_topic_id)) {
      uniqueTopics.set(topic.mes_topic_id, topic);
    }
  }

  const sortedTopics = Array.from(uniqueTopics.values())
    .sort((a, b) => {
      if (a.tree_level !== b.tree_level) return a.tree_level - b.tree_level;
      return a.mes_topic_id - b.mes_topic_id;
    });

  const groupIdMap = new Map<number, number>();
  const groups: any[] = [];
  for (const topic of sortedTopics) {
    const id = groups.length;
    groupIdMap.set(topic.mes_topic_id, id);
    const parentId =
      topic.mes_topic_parent_id !== null ? groupIdMap.get(topic.mes_topic_parent_id) : undefined;
    groups.push({
      id,
      name: topic.mes_topic_name,
      parentId,
      treeLevel: topic.tree_level,
    });
  }

  // Transform items from exercises
  const items: any[] = [];
  let itemId = 0;
  for (const topic of legacy.topics || []) {
    if (!topic.mes_exercise_id) continue;

    const groupId = groupIdMap.get(topic.mes_topic_id) ?? 0;
    const { text, options, correctIndex, mode, answer } = parseExerciseMetadata(
      topic.mes_exercise_metadata,
      topic.mes_exercise_key_metadata,
      topic.mes_exercise_type
    );

    items.push({
      id: itemId,
      groupId,
      text: text || topic.mes_exercise_name || `Exercise ${itemId + 1}`,
      explain: '', // Will be generated by AI
      clusterId: `cluster-${groupId}`,
      variant: '1',
      mode,
      options,
      correctIndex,
      answer,
      relatedStudyTextIds: topic.mes_exercise_studytext_id
        ? [`st-${topic.mes_exercise_studytext_id}`]
        : undefined,
      _import: {
        sourceExerciseId: topic.mes_exercise_id,
        exerciseType: topic.mes_exercise_type,
      },
    });
    itemId++;
  }

  // Transform study texts
  const studyTexts: any[] = [];
  let order = 0;
  for (const subject of legacy.subjects || []) {
    if (!subject.mes_studytext_id) continue;

    const title =
      subject.mes_subject_name || subject.mes_resource_displayname || `Section ${order + 1}`;
    // Check all possible content fields (SQL function may return content in different fields)
    // The study_text field contains the full HTML with embedded multimedia
    let content = (subject as any).study_text || 
                  (subject as any).regexp_replace || 
                  subject.mes_resource_content_text || '';
    
    // Replace image and multimedia URLs
    for (const [oldUrl, newUrl] of imageUrlMap) {
      content = content.replace(new RegExp(escapeRegex(oldUrl), 'g'), newUrl);
    }

    studyTexts.push({
      id: `st-${subject.mes_studytext_id}`,
      title,
      content: legacyHtmlToStudyTextMarkers({ title, html: content }),
      order,
      parentId: subject.mes_subject_parent_id !== null ? `subj-${subject.mes_subject_parent_id}` : undefined,
      treeLevel: subject.tree_level,
      _import: {
        sourceStudyTextId: subject.mes_studytext_id,
        sourceSubjectId: subject.mes_subject_id,
      },
    });
    order++;
  }

  // Generate levels
  const levelCount = Math.min(5, Math.max(3, Math.ceil(items.length / 10)));
  const itemsPerLevel = Math.ceil(items.length / levelCount);
  const levels = Array.from({ length: levelCount }, (_, i) => ({
    id: i,
    title: `Level ${i + 1}`,
    start: i * itemsPerLevel,
    end: Math.min((i + 1) * itemsPerLevel - 1, items.length - 1),
  }));

  return {
    id: `legacy-${course.id}`,
    title: course.name,
    description: `Imported from legacy system (Course ID: ${course.id})`,
    locale,
    availableLocales: [locale],
    subject: course.category || 'General',
    gradeBand: 'K-12',
    contentVersion: new Date().toISOString().split('T')[0],
    format: 'learnplay-v1',
    groups,
    items,
    studyTexts,
    levels,
    _import: {
      sourceSystem: 'mes_legacy',
      sourceCourseId: course.id,
      importedAt: new Date().toISOString(),
      importVersion: '1.0.0',
    },
  };
}

function parseExerciseMetadata(
  metadata: string | null,
  keyMetadata: string | null,
  exerciseType: string | null
): {
  text: string | null;
  options: string[];
  correctIndex: number;
  mode: 'options' | 'numeric';
  answer?: number;
} {
  let text: string | null = null;
  let options: string[] = [];
  let correctIndex = 0;
  let mode: 'options' | 'numeric' = 'options';
  let answer: number | undefined;

  if (metadata) {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed.question) text = parsed.question;
      if (parsed.text) text = parsed.text;
      if (parsed.stem) text = parsed.stem;
      
      if (Array.isArray(parsed.options)) {
        options = parsed.options.map((o: any) => 
          typeof o === 'string' ? o : (o.text || o.value || String(o))
        );
      }
      if (Array.isArray(parsed.answers)) {
        options = parsed.answers.map((o: any) => 
          typeof o === 'string' ? o : (o.text || o.value || String(o))
        );
      }
      
      if (typeof parsed.correctIndex === 'number') correctIndex = parsed.correctIndex;
      else if (typeof parsed.correct === 'number') correctIndex = parsed.correct;
      else if (typeof parsed.correctAnswer === 'number') correctIndex = parsed.correctAnswer;
    } catch {
      // Not JSON
      text = metadata.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null;
    }
  }

  if (keyMetadata) {
    try {
      const key = JSON.parse(keyMetadata);
      if (typeof key.correctIndex === 'number') correctIndex = key.correctIndex;
      if (typeof key.answer === 'number') {
        answer = key.answer;
        mode = 'numeric';
      }
    } catch { /* ignore */ }
  }

  if (exerciseType?.toLowerCase().includes('numeric') || 
      exerciseType?.toLowerCase().includes('number') ||
      exerciseType?.toLowerCase().includes('input')) {
    mode = 'numeric';
  }

  if (mode === 'options' && options.length === 0) {
    options = ['Option A', 'Option B', 'Option C', 'Option D'];
  }

  return { text, options, correctIndex, mode, answer };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

serve(
  withCors(async (req) => {
    const reqId = getRequestId(req);

    if (req.method !== "POST") {
      return Errors.methodNotAllowed(req.method, reqId, req);
    }

    // Hybrid auth (agent token OR user session)
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch {
      return Errors.invalidAuth(reqId, req);
    }
    if (auth.type === "agent" && !auth.organizationId) {
      return Errors.invalidRequest("Missing x-organization-id for agent auth", reqId, req);
    }

    const organizationId = auth.organizationId;
    if (!organizationId) {
      return Errors.invalidRequest("Missing organization_id", reqId, req);
    }

    let body: ImportLegacyCourseRequest;
    try {
      body = (await req.json()) as ImportLegacyCourseRequest;
    } catch {
      return Errors.invalidRequest("Invalid JSON body", reqId, req);
    }

    const action = body?.action ?? "import";
    const courseId = body?.courseId;
    const migrateImages = body?.migrateImages !== false; // default true
    const locale = typeof body?.locale === "string" && body.locale.trim().length > 0 ? body.locale.trim() : "he";

    if (action === "list") {
      const limit = typeof body?.limit === "number" && Number.isFinite(body.limit) ? body.limit : 10;
      const items = await listLegacyCourses(limit);
      return { success: true, items, requestId: reqId };
    }

    if (typeof courseId !== "number" || !Number.isFinite(courseId) || courseId <= 0) {
      return Errors.invalidRequest("courseId is required and must be a positive number", reqId, req);
    }

    const newCourseId = `legacy-${courseId}`;
    console.log(`[import-legacy-course] reqId=${reqId} importing legacy course ${courseId} -> ${newCourseId}`);

    // 1) Fetch legacy content
    let legacy: LegacyCourseContent;
    try {
      legacy = await fetchLegacyCourseContent(courseId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Errors.internal(`Legacy DB fetch failed: ${msg}`, reqId, req);
    }
    if (!legacy?.course || legacy.course.length === 0) {
      return Errors.notFound(`Legacy course ${courseId}`, reqId, req);
    }

    // 2) Optional image migration
    const imageUrlMap = new Map<string, string>();
    let imagesMigrated = 0;
    let imagesFailedCount = 0;

    if (migrateImages) {
      const extracted = extractImageUrls(legacy)
        .map((u) => String(u || "").trim())
        .filter(Boolean);
      const unique = Array.from(new Set(extracted));
      console.log(`[import-legacy-course] Found ${unique.length} image(s) to migrate`);

      for (const rawUrl of unique) {
        const normalized = normalizeLegacyImageUrl(rawUrl);
        const res = await migrateImageToMediaLibrary({ originalUrl: normalized, courseId: newCourseId });
        if (res.ok) imagesMigrated++;
        else imagesFailedCount++;

        // Map both raw + normalized → new URL so string replace works reliably.
        imageUrlMap.set(rawUrl, res.url);
        if (normalized && normalized !== rawUrl) imageUrlMap.set(normalized, res.url);
      }
    }

    // 3) Transform course payload (flat items + groups)
    const course = transformLegacyCourse(legacy, { locale, imageUrlMap }) as any;
    course.id = newCourseId;
    course.organization_id = organizationId;
    course.visibility = "org";

    // 4) Save course.json to Storage (canonical path)
    const coursePath = `${newCourseId}/course.json`;
    const blob = new Blob([JSON.stringify(course, null, 2)], { type: "application/json" });
    const { error: uploadErr } = await admin.storage.from(COURSES_BUCKET).upload(coursePath, blob, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "public, max-age=60",
    });
    if (uploadErr) {
      return Errors.internal(`Storage upload failed: ${uploadErr.message}`, reqId, req);
    }

    // 5) Upsert metadata for catalog + org scoping
    try {
      await upsertCourseMetadata(admin as any, newCourseId, course);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Errors.internal(`Metadata upsert failed: ${msg}`, reqId, req);
    }

    console.log(`[import-legacy-course] Done: ${newCourseId} (items=${course?.items?.length ?? 0})`);

    return {
      success: true,
      courseId: newCourseId,
      stats: {
        itemsImported: Array.isArray(course?.items) ? course.items.length : 0,
        studyTextsImported: Array.isArray(course?.studyTexts) ? course.studyTexts.length : 0,
        imagesMigrated,
        imagesFailedCount,
      },
      requestId: reqId,
    };
  })
);

