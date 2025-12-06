import type { Course, CourseItem, CourseGroup, CourseLevel } from "../types/course";

/**
 * Raw JSON structure from existing course files
 */
interface RawCourseJson {
  id: string;
  title: string;
  locale?: string;
  contentVersion?: string;
  description?: string;
  levels: Array<{
    id: number;
    start: number;
    end: number;
    title: string;
    description?: string;
  }>;
  groups: Array<{
    id: number;
    name: string;
    color?: string;
  }>;
  items: Array<{
    id: number;
    groupId: number;
    text: string;
    explain: string;
    clusterId?: string;
    variant?: string;
    mode?: 'options' | 'numeric';
    options: string[];
    correctIndex: number;
    wrongExplanations?: string[];
    answer?: number;
    hint?: string;
  }>;
}

/**
 * Normalize placeholder format
 * Converts both _ and [blank] to [blank] for consistent rendering
 */
function normalizePlaceholder(text: string): string {
  // Replace standalone underscores with [blank]
  return text.replace(/\s_\s/g, ' [blank] ').replace(/^_\s/, '[blank] ').replace(/\s_$/, ' [blank]');
}

/**
 * Generate wrong explanations if not provided
 * Creates generic explanations for each wrong answer
 */
function generateWrongExplanations(
  options: string[],
  correctIndex: number,
  correctExplanation: string
): string[] {
  return options.map((option, index) => {
    if (index === correctIndex) {
      return correctExplanation;
    }
    return `'${option}' is not correct in this context. ${correctExplanation}`;
  });
}

/**
 * Get default color for a group based on index
 */
function getDefaultColor(index: number): string {
  const colors = [
    'blue',
    'green',
    'purple',
    'orange',
    'pink',
    'cyan',
    'red',
    'amber',
    'indigo',
    'teal',
  ];
  return colors[index % colors.length];
}

/**
 * Parse raw JSON course data into typed Course structure
 * 
 * @param raw - Raw JSON object from course file
 * @param courseId - Course identifier (used as fallback if not in JSON)
 * @returns Typed Course object
 */
export function parseMedJson(raw: RawCourseJson, courseId?: string): Course {
  // Extract basic course info
  const id = raw.id || courseId || 'unknown';
  const title = raw.title || (id === 'modals' ? 'English Modals' : id === 'verbs' ? 'English Verbs' : 'Unknown Course');
  const description = raw.description || `Learn ${title.toLowerCase()} through interactive exercises.`;

  // Parse groups - add default colors if not provided
  const groups: CourseGroup[] = raw.groups.map((group, index) => ({
    id: group.id,
    name: group.name,
    color: group.color || getDefaultColor(index),
  }));

  // Parse levels - add descriptions if not provided
  const levels: CourseLevel[] = raw.levels.map((level) => ({
    id: level.id,
    start: level.start,
    end: level.end,
    title: level.title,
    description: level.description || `Items ${level.start} to ${level.end}`,
    minScore: 0, // Default, can be customized
  }));

  // Parse items - normalize placeholders and add wrong explanations
  const items: CourseItem[] = raw.items.map((item) => {
    const text = normalizePlaceholder(item.text);
    
    // Validate correctIndex is within bounds
    if (item.correctIndex < 0 || item.correctIndex >= item.options.length) {
      console.warn(
        `[Course ${id}] Item ${item.id}: correctIndex ${item.correctIndex} is out of bounds (options length: ${item.options.length}). Defaulting to 0.`
      );
      item.correctIndex = 0;
    }
    
    // Validate options array has 3-4 items (or warn if outside typical range)
    if (item.options.length < 3 || item.options.length > 4) {
      console.warn(
        `[Course ${id}] Item ${item.id}: has ${item.options.length} options (typical: 3-4)`
      );
    }
    
    const wrongExplanations = item.wrongExplanations || 
      generateWrongExplanations(item.options, item.correctIndex, item.explain);

    return {
      id: item.id,
      groupId: item.groupId,
      text,
      explain: item.explain,
      clusterId: item.clusterId || `${id}-${String(item.id).padStart(3, '0')}`,
      variant: item.variant || 'a',
      mode: item.mode || 'options', // Default to options mode
      options: item.options,
      correctIndex: item.correctIndex,
      wrongExplanations,
      answer: item.answer,
      hint: item.hint,
    };
  });

  return {
    id,
    title,
    locale: raw.locale,
    contentVersion: raw.contentVersion,
    description,
    items,
    groups,
    levels,
  };
}

/**
 * Fetch and parse a course JSON file
 * 
 * @param courseId - Course identifier ('modals' or 'verbs')
 * @returns Promise resolving to typed Course object
 */
export async function fetchAndParseCourse(courseId: string): Promise<Course> {
  const response = await fetch(`/mock/courses/${courseId}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load course: ${courseId}`);
  }
  const raw: RawCourseJson = await response.json();
  return parseMedJson(raw, courseId);
}
