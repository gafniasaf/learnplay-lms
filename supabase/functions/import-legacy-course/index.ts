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
  courseId: number;
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

  // Images in study texts
  for (const subject of legacy.subjects || []) {
    if (!subject.mes_resource_content_text) continue;
    
    const imgMatches = subject.mes_resource_content_text.matchAll(
      /<img\s+[^>]*src="([^"]+)"[^>]*>/gi
    );
    for (const match of imgMatches) {
      urls.add(match[1]);
    }
  }

  return Array.from(urls);
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORMATION
// ═══════════════════════════════════════════════════════════════════════════

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
  const groups = sortedTopics.map((topic, idx) => {
    groupIdMap.set(topic.mes_topic_id, idx);
    return {
      id: idx,
      name: topic.mes_topic_name,
    };
  });

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
    });
    itemId++;
  }

  // Transform study texts
  const studyTexts: any[] = [];
  let order = 0;
  for (const subject of legacy.subjects || []) {
    if (!subject.mes_studytext_id) continue;

    let content = subject.mes_resource_content_text || '';
    
    // Replace image URLs
    for (const [oldUrl, newUrl] of imageUrlMap) {
      content = content.replace(new RegExp(escapeRegex(oldUrl), 'g'), newUrl);
    }

    studyTexts.push({
      id: `st-${subject.mes_studytext_id}`,
      title: subject.mes_subject_name || subject.mes_resource_displayname || `Section ${order + 1}`,
      content,
      order,
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

    const courseId = body?.courseId;
    const migrateImages = body?.migrateImages !== false; // default true
    const locale = typeof body?.locale === "string" && body.locale.trim().length > 0 ? body.locale.trim() : "he";

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

