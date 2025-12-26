/**
 * Import Legacy Course Edge Function
 * 
 * Imports courses from the legacy MES system into IgniteZero.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Pool } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
import { stdHeaders, handleOptions } from '../_shared/cors.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEGACY_DB_URL = Deno.env.get('LEGACY_DATABASE_URL') || 
  'postgresql://postgres:d584WwaNjJbcQxHs@db.yqpqdtedhoffgmurpped.supabase.co:5432/postgres';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LEGACY_BLOB_BASE = 'https://expertcollegeresources.blob.core.windows.net/assets-cnt';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY DATABASE
// ═══════════════════════════════════════════════════════════════════════════

async function fetchLegacyCourseContent(courseId: number): Promise<LegacyCourseContent> {
  const pool = new Pool(LEGACY_DB_URL, 3);
  
  try {
    const connection = await pool.connect();
    try {
      const result = await connection.queryObject<{ get_course_content: LegacyCourseContent }>(
        'SELECT get_course_content($1)',
        [courseId]
      );
      return result.rows[0].get_course_content;
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

async function migrateImage(
  originalUrl: string, 
  targetPath: string
): Promise<{ success: boolean; newUrl: string; error?: string }> {
  try {
    // Download image
    const response = await fetch(originalUrl);
    if (!response.ok) {
      return { success: false, newUrl: originalUrl, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('media')
      .upload(targetPath, arrayBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      return { success: false, newUrl: originalUrl, error: error.message };
    }

    const newUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${targetPath}`;
    return { success: true, newUrl };
  } catch (err) {
    return { 
      success: false, 
      newUrl: originalUrl, 
      error: err instanceof Error ? err.message : 'Unknown error' 
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptions();
  }

  try {
    const body = await req.json();
    const { courseId, migrateImages = true, locale = 'he' } = body;

    if (!courseId || typeof courseId !== 'number') {
      return new Response(
        JSON.stringify({ success: false, error: 'courseId is required and must be a number' }),
        { status: 400, headers: stdHeaders }
      );
    }

    console.log(`[import-legacy-course] Starting import for course ${courseId}`);

    // 1. Fetch legacy content
    console.log('[import-legacy-course] Fetching from legacy database...');
    const legacyContent = await fetchLegacyCourseContent(courseId);

    if (!legacyContent.course || legacyContent.course.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Course not found in legacy database' }),
        { status: 404, headers: stdHeaders }
      );
    }

    // 2. Migrate images
    let imageUrlMap = new Map<string, string>();
    let imagesMigrated = 0;
    let imagesFailedCount = 0;

    if (migrateImages) {
      console.log('[import-legacy-course] Extracting images...');
      const imageUrls = extractImageUrls(legacyContent);
      console.log(`[import-legacy-course] Found ${imageUrls.length} images`);

      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        const filename = url.split('/').pop() || 'image.jpg';
        const targetPath = `legacy-import/legacy-${courseId}/${Date.now()}-${i}-${filename}`.toLowerCase().replace(/[^a-z0-9._/-]/g, '_');
        
        const result = await migrateImage(url, targetPath);
        imageUrlMap.set(url, result.newUrl);
        
        if (result.success) {
          imagesMigrated++;
        } else {
          imagesFailedCount++;
          console.warn(`[import-legacy-course] Image migration failed: ${url} - ${result.error}`);
        }
      }
    }

    // 3. Transform course
    console.log('[import-legacy-course] Transforming course...');
    const course = transformLegacyCourse(legacyContent, { locale, imageUrlMap });

    // 4. Save to Storage
    console.log('[import-legacy-course] Saving to storage...');
    const { error: uploadError } = await supabase.storage
      .from('courses')
      .upload(`${course.id}.json`, JSON.stringify(course, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ success: false, error: `Storage upload failed: ${uploadError.message}` }),
        { status: 500, headers: stdHeaders }
      );
    }

    // 5. Create metadata (if organization_id available)
    const organizationId = req.headers.get('x-organization-id');
    const warnings: string[] = [];

    if (organizationId) {
      const { error: metaError } = await supabase
        .from('course_metadata')
        .upsert({
          id: course.id,
          title: course.title,
          organization_id: organizationId,
          status: 'draft',
          subject: course.subject,
          grade_band: course.gradeBand,
          locale: course.locale,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (metaError) {
        warnings.push(`Metadata insert warning: ${metaError.message}`);
      }
    } else {
      warnings.push('No organization_id provided - skipping metadata insert');
    }

    console.log(`[import-legacy-course] Import complete: ${course.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        courseId: course.id,
        stats: {
          itemsImported: course.items.length,
          studyTextsImported: course.studyTexts.length,
          imagesMigrated,
          imagesFailedCount,
        },
        warnings,
      }),
      { status: 200, headers: stdHeaders }
    );

  } catch (error) {
    console.error('[import-legacy-course] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: stdHeaders }
    );
  }
});

