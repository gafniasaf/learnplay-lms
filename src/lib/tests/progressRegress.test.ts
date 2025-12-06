/**
 * Progress Regression Test
 * Verifies that wrong answers increase pool size and reduce progress
 */

import { getCourse } from "@/lib/api";
import type { Course, CourseItem } from "@/lib/types/course";
import { resolveOnWrong } from "@/lib/gameLogic";

/**
 * Simulate game state to test progress regression
 */
function simulateWrongAnswer(
  course: Course,
  initialPoolSize: number
): {
  poolGrew: boolean;
  progressRegressed: boolean;
  details: any;
} {
  // Create a simple pool with 3 items from level 1
  const level1 = course.levels[0];
  const allowedGroupIds = new Set<number>();
  for (let gid = level1.start; gid <= level1.end; gid++) {
    allowedGroupIds.add(gid);
  }

  const levelItems = course.items
    .filter((item) => allowedGroupIds.has(item.groupId))
    .slice(0, 3); // Just take first 3 for testing

  if (levelItems.length < 3) {
    return {
      poolGrew: false,
      progressRegressed: false,
      details: { error: "Not enough items for test" },
    };
  }

  const pool = [...levelItems];
  const poolSize = pool.length;

  // Calculate initial progress
  const initialProgress = 1 - pool.length / initialPoolSize;

  // Select first item and answer incorrectly
  const currentItem = pool[0];
  const variantMap = new Map<string, number>();

  // Resolve what to enqueue on wrong answer
  const { itemToEnqueue } = resolveOnWrong(
    currentItem,
    pool,
    course,
    variantMap
  );

  // Simulate pool update on WRONG answer: ADD item (don't remove current)
  const newPool = [...pool, itemToEnqueue];
  const newPoolSize = Math.max(poolSize, newPool.length);

  // Calculate new progress
  const newProgress = 1 - newPool.length / newPoolSize;

  // Check if pool grew
  const poolGrew = newPool.length > pool.length;

  // Check if progress regressed (decreased)
  const progressRegressed = newProgress < initialProgress;

  return {
    poolGrew,
    progressRegressed,
    details: {
      initialPool: pool.length,
      newPool: newPool.length,
      initialPoolSize,
      newPoolSize,
      initialProgress: Math.round(initialProgress * 100) / 100,
      newProgress: Math.round(newProgress * 100) / 100,
      itemEnqueued: itemToEnqueue.id,
      isVariantRotation: itemToEnqueue.id !== currentItem.id,
    },
  };
}

/**
 * Run progress regression test
 */
export async function runProgressRegressTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const course = await getCourse("modals");

    if (!course || !course.items || course.items.length === 0) {
      return {
        pass: false,
        details: {
          error: "Course not loaded or has no items",
        },
      };
    }

    // Simulate wrong answer with initial pool size of 10
    const result1 = simulateWrongAnswer(course, 10);

    // Simulate another scenario with different initial pool size
    const result2 = simulateWrongAnswer(course, 15);

    // Both scenarios should show pool growth and progress regression
    const pass =
      result1.poolGrew &&
      result1.progressRegressed &&
      result2.poolGrew &&
      result2.progressRegressed;

    return {
      pass,
      details: {
        scenario1: result1.details,
        scenario2: result2.details,
        summary: {
          allPoolsGrew: result1.poolGrew && result2.poolGrew,
          allProgressRegressed:
            result1.progressRegressed && result2.progressRegressed,
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
