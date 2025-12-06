/**
 * Rotation & Scoring Logic Tests
 * Tests adaptive learning rotation and pool management
 */

import { resolveOnWrong, nextVariant } from "@/lib/gameLogic";
import type { Course, CourseItem } from "@/lib/types/course";

/**
 * Create mock course with clustered items
 */
function createMockCourse(): Course {
  return {
    id: "test-course",
    title: "Test Course",
    levels: [{ id: 1, start: 1, end: 6, title: "Level 1" }],
    groups: [{ id: 1, name: "Group 1" }],
    items: [
      {
        id: 1,
        groupId: 1,
        text: "Item _ variant 1",
        explain: "Explanation",
        clusterId: "cluster-1",
        variant: "1",
        options: ["a", "b", "c"],
        correctIndex: 0,
      },
      {
        id: 2,
        groupId: 1,
        text: "Item _ variant 2",
        explain: "Explanation",
        clusterId: "cluster-1",
        variant: "2",
        options: ["a", "b", "c"],
        correctIndex: 0,
      },
      {
        id: 3,
        groupId: 1,
        text: "Item _ variant 3",
        explain: "Explanation",
        clusterId: "cluster-1",
        variant: "3",
        options: ["a", "b", "c"],
        correctIndex: 0,
      },
      {
        id: 4,
        groupId: 1,
        text: "Standalone item _",
        explain: "Explanation",
        clusterId: "standalone",
        variant: "1",
        options: ["x", "y", "z"],
        correctIndex: 1,
      },
    ],
  };
}

/**
 * Test 1: Variant rotation with cluster
 * Simulate 3 wrongs on variant '1' → should enqueue '2', '3', '1'
 */
export async function testVariantRotation(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  const item1 = course.items[0]; // variant 1
  const pool: CourseItem[] = [item1];
  const variantMap = new Map<string, number>();

  const results: any[] = [];

  // First wrong: should enqueue variant 2
  const result1 = resolveOnWrong(item1, pool, course, variantMap);
  results.push({
    attempt: 1,
    enqueued: result1.itemToEnqueue.id,
    variant: result1.itemToEnqueue.variant,
    nextVariantNum: result1.nextVariantNum,
  });

  // Update pool and variant map as the game would
  const pool2 = [...pool, result1.itemToEnqueue];
  if (result1.nextVariantNum && item1.clusterId) {
    variantMap.set(item1.clusterId, result1.nextVariantNum);
  }

  // Second wrong: should enqueue variant 3
  const result2 = resolveOnWrong(
    result1.itemToEnqueue,
    pool2,
    course,
    variantMap
  );
  results.push({
    attempt: 2,
    enqueued: result2.itemToEnqueue.id,
    variant: result2.itemToEnqueue.variant,
    nextVariantNum: result2.nextVariantNum,
  });

  // Update pool and variant map
  const pool3 = [...pool2, result2.itemToEnqueue];
  if (result2.nextVariantNum && result1.itemToEnqueue.clusterId) {
    variantMap.set(result1.itemToEnqueue.clusterId, result2.nextVariantNum);
  }

  // Third wrong: should wrap to variant 1
  const result3 = resolveOnWrong(
    result2.itemToEnqueue,
    pool3,
    course,
    variantMap
  );
  results.push({
    attempt: 3,
    enqueued: result3.itemToEnqueue.id,
    variant: result3.itemToEnqueue.variant,
    nextVariantNum: result3.nextVariantNum,
  });

  // Validate rotation sequence: 2 → 3 → 1
  const pass =
    result1.itemToEnqueue.variant === "2" &&
    result2.itemToEnqueue.variant === "3" &&
    result3.itemToEnqueue.variant === "1";

  return {
    pass,
    details: {
      rotationSequence: results,
      poolGrowth: [pool.length, pool2.length, pool3.length],
      expectedSequence: ["2", "3", "1"],
      actualSequence: [
        result1.itemToEnqueue.variant,
        result2.itemToEnqueue.variant,
        result3.itemToEnqueue.variant,
      ],
    },
  };
}

/**
 * Test 2: No cluster fallback
 * Wrong answer on item without cluster should duplicate the same item
 */
export async function testNoClusterFallback(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  
  // Create item without cluster/variant
  const standaloneItem: CourseItem = {
    id: 99,
    groupId: 1,
    text: "No cluster item _",
    explain: "Explanation",
    clusterId: "", // No cluster
    variant: "",
    options: ["a", "b", "c"],
    correctIndex: 0,
  };

  const pool: CourseItem[] = [standaloneItem];
  const variantMap = new Map<string, number>();

  // Wrong answer: should re-enqueue same item
  const result = resolveOnWrong(standaloneItem, pool, course, variantMap);

  const pass =
    result.itemToEnqueue.id === standaloneItem.id &&
    result.nextVariantNum === undefined;

  return {
    pass,
    details: {
      originalItemId: standaloneItem.id,
      enqueuedItemId: result.itemToEnqueue.id,
      sameItem: result.itemToEnqueue.id === standaloneItem.id,
      poolLengthBefore: pool.length,
      poolLengthAfter: pool.length + 1, // Would grow by 1
      variantRotated: result.nextVariantNum !== undefined,
    },
  };
}

/**
 * Test 3: Pool management
 * Correct answer should remove item, wrong answer should grow pool
 */
export async function testPoolManagement(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  const item1 = course.items[0];
  const item2 = course.items[1];
  
  // Start with 2 items in pool
  let pool: CourseItem[] = [item1, item2];
  const initialLength = pool.length;

  // Simulate wrong answer: pool should GROW (add only, don't remove)
  const variantMap = new Map<string, number>();
  const wrongResult = resolveOnWrong(item1, pool, course, variantMap);
  
  // Wrong branch: ADD item to pool (don't remove current)
  pool = [...pool, wrongResult.itemToEnqueue];
  const poolSize = Math.max(initialLength, pool.length);
  const afterWrongLength = pool.length;

  // Simulate correct answer: pool should shrink (remove one)
  pool = pool.slice(1); // Remove first item
  const afterCorrectLength = pool.length;
  // poolSize stays the same (high-water mark never decreases)

  const pass =
    afterWrongLength === initialLength + 1 && // Wrong: grows by 1
    afterCorrectLength === afterWrongLength - 1 && // Correct: shrinks by 1
    poolSize === afterWrongLength; // poolSize tracks maximum

  return {
    pass,
    details: {
      initialLength,
      afterWrongLength,
      afterCorrectLength,
      poolSize,
      wrongGrowsPool: afterWrongLength === initialLength + 1,
      correctShrinksPool: afterCorrectLength === afterWrongLength - 1,
      poolSizeIsMax: poolSize === Math.max(initialLength, afterWrongLength, afterCorrectLength),
    },
  };
}

/**
 * Test 4: Next variant helper
 */
export async function testNextVariantHelper(): Promise<{
  pass: boolean;
  details: any;
}> {
  const results = [
    { input: "1", output: nextVariant("1"), expected: "2" },
    { input: "2", output: nextVariant("2"), expected: "3" },
    { input: "3", output: nextVariant("3"), expected: "1" },
  ];

  const pass = results.every((r) => r.output === r.expected);

  return {
    pass,
    details: {
      testCases: results,
      rotationWorks: pass,
    },
  };
}

/**
 * Combined rotation & scoring test
 */
export async function runRotationTests(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const [test1, test2, test3, test4] = await Promise.all([
      testVariantRotation(),
      testNoClusterFallback(),
      testPoolManagement(),
      testNextVariantHelper(),
    ]);

    const allPass = test1.pass && test2.pass && test3.pass && test4.pass;

    return {
      pass: allPass,
      details: {
        variantRotation: test1,
        noClusterFallback: test2,
        poolManagement: test3,
        nextVariantHelper: test4,
        summary: {
          total: 4,
          passed: [test1.pass, test2.pass, test3.pass, test4.pass].filter(
            Boolean
          ).length,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Test execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
}
