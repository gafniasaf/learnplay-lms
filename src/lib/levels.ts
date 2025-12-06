/**
 * Level filtering utilities
 * Handles level-based item filtering using numeric group ranges
 * Single source of truth: course.levels from JSON
 */

import type { Course, CourseItem, CourseLevel } from "@/lib/types/course";

/**
 * Generate fallback levels if course lacks levels[] array
 * Creates a single default level covering all groups
 * 
 * @param course Course data
 * @returns Array with single fallback level
 */
function generateFallbackLevels(course: Course): CourseLevel[] {
  console.warn(
    `[levels] Course '${course.id}' missing levels[] - generating fallback. ` +
    `Add levels to course JSON for proper level support.`
  );

  // Find min/max group IDs from items
  const groupIds = course.items.map(item => item.groupId);
  const minGroup = Math.min(...groupIds, 0);
  const maxGroup = Math.max(...groupIds, 0);

  return [
    {
      id: 1,
      title: "All Content",
      start: minGroup,
      end: maxGroup,
      description: "Complete course (fallback level)",
    },
  ];
}

/**
 * Get course levels with fallback generation
 * 
 * @param course Course data
 * @returns Course levels (from JSON or generated fallback)
 */
export function getCourseLevels(course: Course): CourseLevel[] {
  if (!course.levels || course.levels.length === 0) {
    return generateFallbackLevels(course);
  }
  return course.levels;
}

/**
 * Get items for a specific level based on group range
 * Levels define start..end as group IDs (inclusive)
 * 
 * @param course Full course data
 * @param levelId Level identifier (matches level.id)
 * @returns Filtered items within the level's group range
 */
export function getItemsForLevel(
  course: Course,
  levelId: number
): CourseItem[] {
  const levels = getCourseLevels(course);
  const level = levels.find((l) => l.id === levelId);
  
  if (!level) {
    console.warn(`[levels] Level ${levelId} not found in course ${course.id}`);
    return [];
  }

  // Build set of allowed group IDs (start..end inclusive)
  const allowedGroupIds = new Set<number>();
  for (let gid = level.start; gid <= level.end; gid++) {
    allowedGroupIds.add(gid);
  }

  // Filter items by group range
  const levelItems = course.items.filter((item) =>
    allowedGroupIds.has(item.groupId)
  );

  return levelItems;
}

/**
 * Get all group IDs within a level's range
 * 
 * @param level Level definition
 * @returns Array of group IDs in the level's range (sorted)
 */
export function getGroupIdsForLevel(level: CourseLevel): number[] {
  const groupIds: number[] = [];
  for (let gid = level.start; gid <= level.end; gid++) {
    groupIds.push(gid);
  }
  return groupIds;
}

/**
 * Validate level ID exists in course
 * 
 * @param course Course data
 * @param levelId Level identifier to validate
 * @returns True if level exists, false otherwise
 */
export function isValidLevel(course: Course, levelId: number): boolean {
  const levels = getCourseLevels(course);
  return levels.some((l) => l.id === levelId);
}

/**
 * Get next level ID, or null if on last level
 * 
 * @param course Course data
 * @param currentLevelId Current level identifier
 * @returns Next level ID or null if no next level
 */
export function getNextLevelId(
  course: Course,
  currentLevelId: number
): number | null {
  const levels = getCourseLevels(course);
  const currentIndex = levels.findIndex((l) => l.id === currentLevelId);
  
  if (currentIndex === -1 || currentIndex === levels.length - 1) {
    return null;
  }
  
  return levels[currentIndex + 1].id;
}

/**
 * Parse level from URL search params with validation
 * 
 * @param searchParams URLSearchParams object
 * @param course Course data for validation
 * @returns Parsed level ID or null if invalid/missing
 */
export function parseLevelFromUrl(
  searchParams: URLSearchParams,
  course: Course
): number | null {
  const levelParam = searchParams.get("level");
  
  if (!levelParam) {
    return null;
  }
  
  const parsed = parseInt(levelParam, 10);
  
  if (isNaN(parsed)) {
    console.warn(`[levels] Invalid level param: ${levelParam}`);
    return null;
  }
  
  if (!isValidLevel(course, parsed)) {
    console.warn(`[levels] Level ${parsed} not found in course`);
    return null;
  }
  
  return parsed;
}
