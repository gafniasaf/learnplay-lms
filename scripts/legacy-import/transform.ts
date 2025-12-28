/**
 * Legacy Course Transformation Logic
 * 
 * Transforms MES legacy format to IgniteZero format.
 */

import type {
  LegacyCourseContent,
  LegacyTopic,
  LegacySubject,
  ImportedCourse,
  ImportedGroup,
  ImportedItem,
  ImportedStudyText,
  ImportedLevel,
} from './types.ts';

const IMPORT_VERSION = '1.0.0';

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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TRANSFORMER
// ═══════════════════════════════════════════════════════════════════════════

export function transformLegacyCourse(
  legacy: LegacyCourseContent,
  options: {
    locale: string;
    imageUrlMapper?: (originalUrl: string) => string;
  }
): ImportedCourse {
  const { locale, imageUrlMapper } = options;
  const course = legacy.course[0];
  
  if (!course) {
    throw new Error('No course data found in legacy content');
  }

  // Transform groups from topics hierarchy
  const { groups, groupIdMap } = transformTopicsToGroups(legacy.topics);
  
  // Transform items from exercises in topics
  const items = transformExercisesToItems(legacy.topics, groupIdMap);
  
  // Transform study texts from subjects
  const studyTexts = transformSubjectsToStudyTexts(legacy.subjects, imageUrlMapper);
  
  // Generate default levels based on item count
  const levels = generateDefaultLevels(items.length);

  return {
    id: `legacy-${course.id}`,
    title: course.name,
    description: `Imported from legacy system (Course ID: ${course.id})`,
    locale,
    availableLocales: [locale],
    subject: course.category || 'General',
    gradeBand: 'K-12', // Default - could be parsed from metadata
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
      importVersion: IMPORT_VERSION,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TOPICS → GROUPS
// ═══════════════════════════════════════════════════════════════════════════

function transformTopicsToGroups(topics: LegacyTopic[]): {
  groups: ImportedGroup[];
  groupIdMap: Map<number, number>; // legacy topic ID → new group ID
} {
  // Get unique topics (a topic can appear multiple times for each exercise)
  const uniqueTopics = new Map<number, LegacyTopic>();
  for (const topic of topics) {
    if (!uniqueTopics.has(topic.mes_topic_id)) {
      uniqueTopics.set(topic.mes_topic_id, topic);
    }
  }

  // Sort by tree level and ID to maintain hierarchy order
  const sortedTopics = Array.from(uniqueTopics.values())
    .sort((a, b) => {
      if (a.tree_level !== b.tree_level) return a.tree_level - b.tree_level;
      return a.mes_topic_id - b.mes_topic_id;
    });

  const groupIdMap = new Map<number, number>();
  const groups: ImportedGroup[] = [];
  
  let groupId = 0;
  for (const topic of sortedTopics) {
    groupIdMap.set(topic.mes_topic_id, groupId);
    groups.push({
      id: groupId,
      name: topic.mes_topic_name,
      parentId: topic.mes_topic_parent_id !== null 
        ? groupIdMap.get(topic.mes_topic_parent_id) 
        : undefined,
      treeLevel: topic.tree_level,
    });
    groupId++;
  }

  return { groups, groupIdMap };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXERCISES → ITEMS
// ═══════════════════════════════════════════════════════════════════════════

function transformExercisesToItems(
  topics: LegacyTopic[],
  groupIdMap: Map<number, number>
): ImportedItem[] {
  const items: ImportedItem[] = [];
  let itemId = 0;

  for (const topic of topics) {
    if (!topic.mes_exercise_id) continue;

    const groupId = groupIdMap.get(topic.mes_topic_id) ?? 0;
    
    // Parse exercise metadata
    const { text, options, correctIndex, mode, answer, stimulus } = parseExerciseMetadata(
      topic.mes_exercise_metadata,
      topic.mes_exercise_key_metadata,
      topic.mes_exercise_type
    );

    items.push({
      id: itemId,
      groupId,
      text: text || topic.mes_exercise_name || `Exercise ${itemId + 1}`,
      explain: '', // Legacy doesn't have explanations - will be generated by AI
      clusterId: `cluster-${groupId}`,
      variant: '1',
      mode,
      options,
      correctIndex,
      answer,
      stimulus,
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

  return items;
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
  stimulus?: { type: 'image'; url: string; alt?: string; placement: 'block' };
} {
  // Default values
  let text: string | null = null;
  let options: string[] = [];
  let correctIndex = 0;
  let mode: 'options' | 'numeric' = 'options';
  let answer: number | undefined;
  let stimulus: { type: 'image'; url: string; alt?: string; placement: 'block' } | undefined;

  // Try to parse metadata as JSON or XML
  if (metadata) {
    try {
      // Try JSON first
      const parsed = JSON.parse(metadata);
      
      // Common JSON structures from legacy system
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
      
      if (typeof parsed.correctIndex === 'number') {
        correctIndex = parsed.correctIndex;
      } else if (typeof parsed.correct === 'number') {
        correctIndex = parsed.correct;
      } else if (typeof parsed.correctAnswer === 'number') {
        correctIndex = parsed.correctAnswer;
      }
      
      if (parsed.image) {
        stimulus = {
          type: 'image',
          url: normalizeImageUrl(parsed.image),
          placement: 'block',
        };
      }
    } catch {
      // Not JSON, might be XML or plain text
      text = extractTextFromMetadata(metadata);
    }
  }

  // Parse key metadata for correct answer
  if (keyMetadata) {
    try {
      const key = JSON.parse(keyMetadata);
      if (typeof key.correctIndex === 'number') {
        correctIndex = key.correctIndex;
      }
      if (typeof key.answer === 'number') {
        answer = key.answer;
        mode = 'numeric';
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Detect numeric mode from exercise type
  if (exerciseType?.toLowerCase().includes('numeric') || 
      exerciseType?.toLowerCase().includes('number') ||
      exerciseType?.toLowerCase().includes('input')) {
    mode = 'numeric';
  }

  // Ensure we have at least some options for options mode
  if (mode === 'options' && options.length === 0) {
    options = ['Option A', 'Option B', 'Option C', 'Option D'];
  }

  return { text, options, correctIndex, mode, answer, stimulus };
}

function extractTextFromMetadata(metadata: string): string | null {
  // Try to extract meaningful text from XML or other formats
  // Remove XML tags and get text content
  const textOnly = metadata.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return textOnly.length > 0 ? textOnly : null;
}

function normalizeImageUrl(url: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) {
    return `https://expertcollegeresources.blob.core.windows.net/assets-cnt${url}`;
  }
  return `https://expertcollegeresources.blob.core.windows.net/assets-cnt/${url}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBJECTS → STUDY TEXTS
// ═══════════════════════════════════════════════════════════════════════════

function transformSubjectsToStudyTexts(
  subjects: LegacySubject[],
  imageUrlMapper?: (originalUrl: string) => string
): ImportedStudyText[] {
  const studyTexts: ImportedStudyText[] = [];
  let order = 0;

  for (const subject of subjects) {
    if (!subject.mes_studytext_id) continue;

    const title = subject.mes_subject_name || subject.mes_resource_displayname || `Section ${order + 1}`;
    // Check all possible content fields (SQL function may return content in different fields)
    // The study_text field contains the full HTML with embedded multimedia
    let content = (subject as any).study_text || 
                  (subject as any).regexp_replace || 
                  subject.mes_resource_content_text || '';
    
    // Apply image URL mapping if provided
    if (imageUrlMapper) {
      content = migrateImagesInContent(content, imageUrlMapper);
    }

    studyTexts.push({
      id: `st-${subject.mes_studytext_id}`,
      title,
      content: legacyHtmlToStudyTextMarkers({ title, html: content }),
      order,
      parentId: subject.mes_subject_parent_id ? `subj-${subject.mes_subject_parent_id}` : undefined,
      treeLevel: subject.tree_level,
      _import: {
        sourceStudyTextId: subject.mes_studytext_id,
        sourceSubjectId: subject.mes_subject_id,
      },
    });
    
    order++;
  }

  return studyTexts;
}

/**
 * Migrate image URLs in HTML content
 */
function migrateImagesInContent(
  content: string,
  imageUrlMapper: (originalUrl: string) => string
): string {
  // Match custom [$IMG(...)] syntax: [$IMG("/media/Images/file.jpg";200,300)]
  content = content.replace(
    /\$IMG\(["']([^"']+)["'][^;]*\)/gi,
    (match, path) => {
      const newUrl = imageUrlMapper(path);
      return `[$IMG("${newUrl}")]`;
    }
  );
  
  // Match <img src="..."> patterns
  content = content.replace(
    /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi,
    (match, before, src, after) => {
      const newUrl = imageUrlMapper(src);
      return `<img ${before}src="${newUrl}"${after}>`;
    }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVELS
// ═══════════════════════════════════════════════════════════════════════════

function generateDefaultLevels(itemCount: number): ImportedLevel[] {
  // Create 3-5 levels based on item count
  const levelCount = Math.min(5, Math.max(3, Math.ceil(itemCount / 10)));
  const itemsPerLevel = Math.ceil(itemCount / levelCount);
  
  const levels: ImportedLevel[] = [];
  for (let i = 0; i < levelCount; i++) {
    levels.push({
      id: i,
      title: `Level ${i + 1}`,
      start: i * itemsPerLevel,
      end: Math.min((i + 1) * itemsPerLevel - 1, itemCount - 1),
    });
  }
  
  return levels;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE URL EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract all image URLs from legacy content for batch migration
 */
export function extractImageUrls(legacy: LegacyCourseContent): string[] {
  const urls = new Set<string>();

  // Course image
  const course = legacy.course[0];
  if (course?.image) {
    urls.add(course.image);
  }

  // Images and multimedia in study texts
  for (const subject of legacy.subjects) {
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

  // Images in exercise metadata
  for (const topic of legacy.topics) {
    if (!topic.mes_exercise_metadata) continue;
    
    try {
      const parsed = JSON.parse(topic.mes_exercise_metadata);
      if (parsed.image) urls.add(normalizeImageUrl(parsed.image));
      if (parsed.images && Array.isArray(parsed.images)) {
        parsed.images.forEach((img: string) => urls.add(normalizeImageUrl(img)));
      }
    } catch {
      // Not JSON, skip
    }
  }

  return Array.from(urls);
}

