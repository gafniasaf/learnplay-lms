/**
 * Variant Resolution Utility
 * 
 * Resolves content variants based on user-selected difficulty level.
 * Supports backward compatibility with legacy course format.
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

/**
 * Resolve a single variant field
 * Priority: userLevel → defaultLevel → first available variant
 */
export function resolveVariant<T>(
  variants: VariantRecord<T> | undefined,
  userLevel: VariantLevel,
  defaultLevel: VariantLevel
): T | undefined {
  if (!variants || Object.keys(variants).length === 0) {
    return undefined;
  }

  // Try user-selected level
  if (variants[userLevel] !== undefined) {
    return variants[userLevel];
  }

  // Fall back to default level
  if (variants[defaultLevel] !== undefined) {
    return variants[defaultLevel];
  }

  // Fall back to first available variant
  const firstKey = Object.keys(variants)[0] as VariantLevel;
  return variants[firstKey];
}

/**
 * Resolve all content for a course item
 * Returns resolved stem, options, explanation, media
 */
export function resolveItemContent(
  item: any,
  userLevel: VariantLevel,
  defaultLevel: VariantLevel
): {
  stem: string;
  stemMedia?: MediaAsset[];
  options?: Array<{ id: string; text: string; media?: MediaAsset[] }>;
  answer?: number;
  explanation?: string;
  explanationMedia?: MediaAsset[];
  mode?: 'options' | 'numeric';
} {
  // Resolve stem
  let stem: string;
  let stemMedia: MediaAsset[] | undefined;

  if (item.stem?.variants) {
    // New format with variants
    stem = resolveVariant(item.stem.variants, userLevel, defaultLevel) || '';
    
    if (item.stem.media?.variants) {
      stemMedia = resolveVariant(item.stem.media.variants, userLevel, defaultLevel);
    }
  } else if (item.text) {
    // Legacy format
    stem = item.text;
    
    if (item.stimulus) {
      stemMedia = [item.stimulus];
    }
  } else {
    stem = '';
  }

  // Resolve options (for mode: 'options')
  let options: Array<{ id: string; text: string; media?: MediaAsset[] }> | undefined;

  if (item.mode !== 'numeric' && item.options) {
    if (Array.isArray(item.options) && typeof item.options[0] === 'string') {
      // Legacy format: string array
      options = item.options.map((text: string, index: number) => ({
        id: index.toString(),
        text,
        media: item.optionMedia?.[index] ? [item.optionMedia[index]] : undefined,
      }));
    } else if (Array.isArray(item.options) && item.options[0]?.variants) {
      // New format: array of objects with variants
      options = item.options.map((option: any) => {
        const text = resolveVariant(option.variants, userLevel, defaultLevel) || '';
        const media = option.media?.variants
          ? resolveVariant(option.media.variants, userLevel, defaultLevel)
          : undefined;
        
        return {
          id: option.id || '',
          text,
          media,
        };
      });
    }
  }

  // Resolve explanation
  let explanation: string | undefined;
  let explanationMedia: MediaAsset[] | undefined;

  if (item.explanation?.variants) {
    // New format with variants
    explanation = resolveVariant(item.explanation.variants, userLevel, defaultLevel);
    
    if (item.explanation.media?.variants) {
      explanationMedia = resolveVariant(item.explanation.media.variants, userLevel, defaultLevel);
    }
  } else if (item.explain) {
    // Legacy format
    explanation = item.explain;
  } else if (item.reference?.html) {
    // Editor format
    explanation = item.reference.html;
  } else if (item.referenceHtml) {
    // Alternative legacy format
    explanation = item.referenceHtml;
  }

  return {
    stem,
    stemMedia,
    options,
    answer: item.answer,
    explanation,
    explanationMedia,
    mode: item.mode,
  };
}

/**
 * Get default variant level from course configuration
 */
export function getDefaultVariantLevel(course: any): VariantLevel {
  return course?.variants?.difficulty?.default || 'intermediate';
}

/**
 * Get available variant levels from course configuration
 */
export function getAvailableVariantLevels(course: any): Array<{
  id: VariantLevel;
  label: string;
  order: number;
}> {
  const defaults = [
    { id: 'beginner' as VariantLevel, label: 'Beginner', order: 0 },
    { id: 'intermediate' as VariantLevel, label: 'Intermediate', order: 1 },
    { id: 'advanced' as VariantLevel, label: 'Advanced', order: 2 },
    { id: 'expert' as VariantLevel, label: 'Expert', order: 3 },
  ];

  return course?.variants?.difficulty?.levels || defaults;
}

/**
 * Check if variants are exposed to users (vs admin-only)
 */
export function areVariantsUserSelectable(course: any): boolean {
  return course?.variants?.difficulty?.exposeToUsers !== false; // Default true
}

/**
 * Resolve all study texts with variants
 */
export function resolveStudyTexts(
  studyTexts: any[] | undefined,
  userLevel: VariantLevel,
  defaultLevel: VariantLevel
): Array<{
  id: string;
  title: string;
  content: string;
  order: number;
}> {
  if (!studyTexts) {
    return [];
  }

  return studyTexts.map((studyText) => {
    let content: string;

    if (studyText.variants) {
      // New format with variants
      content = resolveVariant(studyText.variants, userLevel, defaultLevel) || studyText.content || '';
    } else {
      // Legacy format
      content = studyText.content || '';
    }

    return {
      id: studyText.id,
      title: studyText.title,
      content,
      order: studyText.order,
    };
  });
}

