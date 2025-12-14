/**
 * Course Schema vNext with Variants and Multi-Tenancy
 * 
 * This is the evolved course structure supporting:
 * - Multi-tenant organization scoping
 * - Difficulty variants (beginner/intermediate/advanced/expert)
 * - Curated tags
 * - Version tracking
 * - Backward compatibility with legacy format
 */

export type VariantLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface VariantRecord<T> {
  beginner?: T;
  intermediate?: T;
  advanced?: T;
  expert?: T;
}

export interface MediaAsset {
  type: 'image' | 'audio' | 'video';
  url: string;
  alt?: string;
  transcriptUrl?: string;
  captionsUrl?: string;
  placement?: 'block' | 'inline';
}

export interface VariantConfig {
  difficulty: {
    levels: Array<{
      id: VariantLevel;
      label: string;
      order: number;
    }>;
    default: VariantLevel;
  };
}

export interface StudyTextVNext {
  id: string;
  title: string;
  content: string;                        // Base content
  variants?: VariantRecord<string>;       // Per-level HTML content
  order: number;
  learningObjectives?: string[];
  metadata?: {
    difficulty?: string;
    estimatedReadingTime?: number;
    keywords?: string[];
  };
}

export interface CourseItemVNext {
  id: number;
  groupId: number;
  mode?: 'options' | 'numeric';
  
  // Stem with variants
  stem: {
    variants: VariantRecord<string>;
    media?: {
      variants?: VariantRecord<MediaAsset[]>;
    };
  };
  
  // Options (for mode: 'options')
  options?: Array<{
    id: string;
    variants: VariantRecord<string>;
    media?: {
      variants?: VariantRecord<MediaAsset[]>;
    };
  }>;
  
  // Numeric answer (for mode: 'numeric')
  answer?: number;
  correctIndex?: number;                  // For mode: 'options'
  
  // Explanation with variants
  explanation?: {
    variants: VariantRecord<string>;      // Full HTML
    media?: {
      variants?: VariantRecord<MediaAsset[]>;
    };
  };
  
  // Metadata
  clusterId?: string;
  variant?: string;
  hint?: string;
  relatedStudyTextIds?: string[];
  learningObjectiveId?: string;
  
  // Legacy fields (for backward compatibility - deprecated)
  text?: string;                          // Old stem.text
  explain?: string;                       // Old explanation
  stimulus?: MediaAsset;                  // Old stem.media[0]
  optionMedia?: (MediaAsset | null)[];    // Old options[i].media[0]
  wrongExplanations?: string[];
  reference?: {
    html?: string;
  };
  referenceHtml?: string;
}

export interface CourseGroupVNext {
  id: number;
  name: string;
  color?: string;
}

export interface CourseLevelVNext {
  id: number;
  start: number;
  end: number;
  title: string;
  description?: string;
  minScore?: number;
}

export interface CourseVNext {
  id: string;                             // kebab-case, e.g., 'heart-anatomy'
  organizationId?: string;                // UUID (optional for legacy courses)
  title: string;
  locale?: string;
  contentVersion: number;                 // Bumped on every publish
  etag: number;                           // Bumped on every save
  description?: string;
  
  // Curated tags (slugs reference tags table)
  tags?: {
    domain?: string[];
    level?: string[];
    theme?: string[];
    subject?: string[];
    class?: string[];
  };
  
  // Variants configuration
  variants?: VariantConfig;
  
  // Study texts (course-level HTML)
  studyTexts?: StudyTextVNext[];
  
  // Course structure
  levels: CourseLevelVNext[];
  groups: CourseGroupVNext[];
  items: CourseItemVNext[];
}

/**
 * Type guard to check if course uses vNext format
 */
export function isCourseVNext(course: any): course is CourseVNext {
  return (
    course &&
    typeof course === 'object' &&
    'variants' in course &&
    course.variants?.difficulty !== undefined
  );
}

/**
 * Type guard to check if item uses vNext format
 */
export function isItemVNext(item: any): item is CourseItemVNext {
  return (
    item &&
    typeof item === 'object' &&
    'stem' in item &&
    item.stem?.variants !== undefined
  );
}

/**
 * Convert legacy course to vNext format (migration helper)
 */
export function migrateCourseToVNext(legacyCourse: any): CourseVNext {
  return {
    id: legacyCourse.id,
    organizationId: legacyCourse.organizationId,
    title: legacyCourse.title,
    locale: legacyCourse.locale,
    contentVersion: legacyCourse.contentVersion || 1,
    etag: legacyCourse.etag || 1,
    description: legacyCourse.description,
    tags: legacyCourse.tags || {},
    variants: {
      difficulty: {
        levels: [
          { id: 'beginner', label: 'Beginner', order: 0 },
          { id: 'intermediate', label: 'Intermediate', order: 1 },
          { id: 'advanced', label: 'Advanced', order: 2 },
          { id: 'expert', label: 'Expert', order: 3 },
        ],
        default: 'intermediate',
      },
    },
    studyTexts: legacyCourse.studyTexts?.map((st: any) => ({
      ...st,
      variants: {
        intermediate: st.content,
      },
    })),
    levels: legacyCourse.levels || [],
    groups: legacyCourse.groups || [],
    items: legacyCourse.items?.map((item: any) => {
      const migratedItem: CourseItemVNext = {
        id: item.id,
        groupId: item.groupId,
        mode: item.mode,
        stem: {
          variants: {
            intermediate: item.text || item.stem?.text || '',
          },
          media: item.stimulus
            ? { variants: { intermediate: [item.stimulus] } }
            : undefined,
        },
        correctIndex: item.correctIndex,
        answer: item.answer,
        clusterId: item.clusterId,
        variant: item.variant,
        hint: item.hint,
        relatedStudyTextIds: item.relatedStudyTextIds,
        learningObjectiveId: item.learningObjectiveId,
      };

      // Migrate options
      if (item.options && item.mode !== 'numeric') {
        if (typeof item.options[0] === 'string') {
          // Legacy string array
          migratedItem.options = (item.options ?? []).map((text: string, idx: number) => ({
            id: idx.toString(),
            variants: {
              intermediate: text,
            },
            media: item.optionMedia?.[idx]
              ? { variants: { intermediate: [item.optionMedia[idx]] } }
              : undefined,
          }));
        } else {
          // Already has option objects
          migratedItem.options = item.options;
        }
      }

      // Migrate explanation
      if (item.explain || item.reference?.html || item.referenceHtml) {
        migratedItem.explanation = {
          variants: {
            intermediate: item.explain || item.reference?.html || item.referenceHtml || '',
          },
        };
      }

      return migratedItem;
    }) || [],
  };
}

