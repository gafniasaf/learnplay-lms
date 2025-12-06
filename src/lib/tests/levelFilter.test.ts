/**
 * Level Filter Test
 * Verifies that levels correctly filter items by group range
 */

import { getCourse } from "@/lib/api";

/**
 * Run level filter test
 * Tests that level ranges correctly filter items by groupId
 */
export async function runLevelFilterTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    // Load a course with multiple levels
    const course = await getCourse("modals");

    if (!course || !course.levels || course.levels.length < 6) {
      return {
        pass: false,
        details: {
          error: "Course not loaded or insufficient levels",
          hasLevels: course?.levels?.length || 0,
        },
      };
    }

    // Test Level 3: Should include groups 0-7 (review level)
    const level3 = course.levels.find((l) => l.id === 3);
    if (!level3) {
      return {
        pass: false,
        details: {
          error: "Level 3 not found",
          availableLevels: course.levels.map(l => l.id),
        },
      };
    }

    // Build expected group IDs for level 3
    const level3ExpectedGroups = new Set<number>();
    for (let gid = level3.start; gid <= level3.end; gid++) {
      level3ExpectedGroups.add(gid);
    }

    // Filter items for level 3
    const level3Items = course.items.filter((item) =>
      level3ExpectedGroups.has(item.groupId)
    );

    // Count unique groups in level 3 items
    const level3ActualGroups = new Set(level3Items.map((item) => item.groupId));

    // Verify level 3 includes groups 0-7 (8 groups total)
    const level3Pass =
      level3ActualGroups.size === 8 &&
      Array.from(level3ActualGroups).every((gid) => gid >= 0 && gid <= 7);

    // Test Level 6: Should include groups 8-15 (review level)
    const level6 = course.levels.find((l) => l.id === 6);
    if (!level6) {
      return {
        pass: false,
        details: {
          error: "Level 6 not found",
          availableLevels: course.levels.map(l => l.id),
        },
      };
    }

    // Build expected group IDs for level 6
    const level6ExpectedGroups = new Set<number>();
    for (let gid = level6.start; gid <= level6.end; gid++) {
      level6ExpectedGroups.add(gid);
    }

    // Filter items for level 6
    const level6Items = course.items.filter((item) =>
      level6ExpectedGroups.has(item.groupId)
    );

    // Count unique groups in level 6 items
    const level6ActualGroups = new Set(level6Items.map((item) => item.groupId));

    // Verify level 6 includes groups 8-15 (8 groups total)
    const level6Pass =
      level6ActualGroups.size === 8 &&
      Array.from(level6ActualGroups).every((gid) => gid >= 8 && gid <= 15);

    const pass = level3Pass && level6Pass;

    return {
      pass,
      details: {
        level3: {
          range: `${level3.start}-${level3.end}`,
          expectedGroups: Array.from(level3ExpectedGroups).sort((a, b) => a - b),
          actualGroups: Array.from(level3ActualGroups).sort((a, b) => a - b),
          itemCount: level3Items.length,
          pass: level3Pass,
        },
        level6: {
          range: `${level6.start}-${level6.end}`,
          expectedGroups: Array.from(level6ExpectedGroups).sort((a, b) => a - b),
          actualGroups: Array.from(level6ActualGroups).sort((a, b) => a - b),
          itemCount: level6Items.length,
          pass: level6Pass,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Test failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
}
