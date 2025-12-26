/**
 * Legacy Course Import Types
 * 
 * These types represent the structure of courses in the legacy MES system.
 * Used for one-way import into IgniteZero format.
 */

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY SCHEMA TYPES (from mes_* tables)
// ═══════════════════════════════════════════════════════════════════════════

export interface LegacyCourse {
  id: number;
  name: string;
  category: string | null;
  image: string | null;
}

export interface LegacyTopic {
  mes_topic_id: number;
  mes_topic_name: string;
  mes_topic_parent_id: number | null;
  tree_level: number;
  // Exercise info (joined)
  mes_exercise_id: number | null;
  mes_exercise_studytext_id: number | null;
  mes_exercise_name: string | null;
  mes_exercise_type: string | null;
  mes_exercise_metadata: string | null;
  mes_exercise_key_metadata: string | null;
}

export interface LegacySubject {
  mes_subject_id: number;
  mes_subject_order: number;
  mes_subject_name: string;
  mes_subject_parent_id: number | null;
  tree_level: number;
  // Study text info (joined)
  mes_studytext_id: number | null;
  mes_resource_language: string | null;
  mes_resource_displayname: string | null;
  mes_resource_content_text: string | null; // Already transformed HTML with images
}

export interface LegacyCourseContent {
  course: LegacyCourse[];
  topics: LegacyTopic[];
  subjects: LegacySubject[];
}

// ═══════════════════════════════════════════════════════════════════════════
// IGNITEZERO TARGET TYPES (extended for i18n)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Localized content wrapper - used for multi-language support
 * Currently imports single language, but structure supports future i18n
 */
export interface LocalizedString {
  /** Primary language content */
  default: string;
  /** Additional languages keyed by ISO 639-1 code */
  [locale: string]: string;
}

/**
 * Import metadata - tracks source system for audit/debugging
 */
export interface ImportMetadata {
  sourceSystem: 'mes_legacy';
  sourceCourseId: number;
  sourceExerciseId?: number;
  sourceStudyTextId?: number;
  importedAt: string;
  importVersion: string;
}

/**
 * Extended Course type with i18n preparation
 */
export interface ImportedCourse {
  id: string;
  title: string;
  description?: string;
  
  // Multi-language preparation
  locale: string; // Primary language (e.g., 'he', 'en')
  availableLocales?: string[]; // For future: ['he', 'en', 'ar']
  
  // Standard course fields
  subject?: string;
  gradeBand?: string;
  contentVersion: string;
  format: string;
  
  // Content
  groups: ImportedGroup[];
  items: ImportedItem[];
  studyTexts: ImportedStudyText[];
  levels: ImportedLevel[];
  
  // Metadata
  _import: ImportMetadata;
}

export interface ImportedGroup {
  id: number;
  name: string;
  parentId?: number; // Preserve hierarchy info
  treeLevel?: number;
  color?: string;
}

export interface ImportedItem {
  id: number;
  groupId: number;
  text: string;
  explain: string;
  clusterId: string;
  variant: string;
  mode: 'options' | 'numeric';
  options: string[];
  correctIndex: number;
  answer?: number;
  hints?: {
    nudge?: string;
    guide?: string;
    reveal?: string;
  };
  relatedStudyTextIds?: string[];
  stimulus?: {
    type: 'image';
    url: string;
    alt?: string;
    placement?: 'block' | 'inline';
  };
  optionMedia?: ({
    type: 'image';
    url: string;
    alt?: string;
    fitMode?: 'cover' | 'contain';
  } | null)[];
  
  // Import metadata
  _import?: {
    sourceExerciseId: number;
    exerciseType: string | null;
  };
}

export interface ImportedStudyText {
  id: string;
  title: string;
  content: string; // HTML content with migrated image URLs
  order: number;
  parentId?: string; // Preserve hierarchy
  treeLevel?: number;
  
  // Import metadata
  _import?: {
    sourceStudyTextId: number;
    sourceSubjectId: number;
  };
}

export interface ImportedLevel {
  id: number;
  title: string;
  start: number;
  end: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE MIGRATION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ImageMigrationResult {
  originalUrl: string;
  newUrl: string;
  success: boolean;
  error?: string;
}

export interface ImportResult {
  courseId: string;
  success: boolean;
  itemsImported: number;
  studyTextsImported: number;
  imagesMigrated: number;
  imagesFailedCount: number;
  errors: string[];
  warnings: string[];
}

