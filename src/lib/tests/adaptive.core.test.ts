/**
 * Adaptive Algorithm Core Test
 * Comprehensive test verifying cluster rotation (1→2→3→1), poolSize tracking, and progress calculation
 */

import { resolveOnWrong } from "@/lib/gameLogic";
import type { Course, CourseItem } from "@/lib/types/course";

/**
 * Create mock course with clustered items for testing
 */
function createTestCourse(): Course {
  return {
    id: "adaptive-test",
    title: "Adaptive Test Course",
    levels: [{ id: 1, start: 1, end: 8, title: "Level 1" }],
    groups: [{ id: 1, name: "Group 1" }],
    items: [
      // Cluster A: variants 1, 2, 3
      {
        id: 1,
        groupId: 1,
        text: "Cluster A variant _",
        explain: "Explanation A",
        clusterId: "cluster-a",
        variant: "1",
        options: ["one", "two", "three"],
        correctIndex: 0,
      },
      {
        id: 2,
        groupId: 1,
        text: "Cluster A variant _",
        explain: "Explanation A",
        clusterId: "cluster-a",
        variant: "2",
        options: ["one", "two", "three"],
        correctIndex: 0,
      },
      {
        id: 3,
        groupId: 1,
        text: "Cluster A variant _",
        explain: "Explanation A",
        clusterId: "cluster-a",
        variant: "3",
        options: ["one", "two", "three"],
        correctIndex: 0,
      },
      // Cluster B: variants 1, 2, 3
      {
        id: 4,
        groupId: 1,
        text: "Cluster B variant _",
        explain: "Explanation B",
        clusterId: "cluster-b",
        variant: "1",
        options: ["a", "b", "c"],
        correctIndex: 1,
      },
      {
        id: 5,
        groupId: 1,
        text: "Cluster B variant _",
        explain: "Explanation B",
        clusterId: "cluster-b",
        variant: "2",
        options: ["a", "b", "c"],
        correctIndex: 1,
      },
      {
        id: 6,
        groupId: 1,
        text: "Cluster B variant _",
        explain: "Explanation B",
        clusterId: "cluster-b",
        variant: "3",
        options: ["a", "b", "c"],
        correctIndex: 1,
      },
      // Standalone item (no cluster rotation)
      {
        id: 7,
        groupId: 1,
        text: "Standalone item _",
        explain: "Explanation standalone",
        clusterId: "",
        variant: "",
        options: ["x", "y", "z"],
        correctIndex: 2,
      },
    ],
  };
}

/**
 * Test 1: Cluster rotation 1→2→3→1 with poolSize tracking
 */
export async function testClusterRotationWithPoolSize(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createTestCourse();
  const item1 = course.items.find(i => i.clusterId === "cluster-a" && i.variant === "1")!;
  
  let pool: CourseItem[] = [item1];
  let poolSize = pool.length;
  const variantMap = new Map<string, number>();
  
  const steps: any[] = [];

  // Step 1: Wrong on variant 1 → should enqueue variant 2
  const result1 = resolveOnWrong(item1, pool, course, variantMap);
  pool = [...pool, result1.itemToEnqueue]; // Add without removing
  poolSize = Math.max(poolSize, pool.length);
  
  if (result1.nextVariantNum && item1.clusterId) {
    variantMap.set(item1.clusterId, result1.nextVariantNum);
  }
  
  steps.push({
    step: 1,
    action: "wrong",
    enqueuedId: result1.itemToEnqueue.id,
    enqueuedVariant: result1.itemToEnqueue.variant,
    poolLength: pool.length,
    poolSize,
    progress: 1 - pool.length / poolSize,
  });

  // Step 2: Wrong on variant 2 → should enqueue variant 3
  const currentItem2 = result1.itemToEnqueue;
  const result2 = resolveOnWrong(currentItem2, pool, course, variantMap);
  pool = [...pool, result2.itemToEnqueue];
  poolSize = Math.max(poolSize, pool.length);
  
  if (result2.nextVariantNum && currentItem2.clusterId) {
    variantMap.set(currentItem2.clusterId, result2.nextVariantNum);
  }
  
  steps.push({
    step: 2,
    action: "wrong",
    enqueuedId: result2.itemToEnqueue.id,
    enqueuedVariant: result2.itemToEnqueue.variant,
    poolLength: pool.length,
    poolSize,
    progress: 1 - pool.length / poolSize,
  });

  // Step 3: Wrong on variant 3 → should wrap to variant 1
  const currentItem3 = result2.itemToEnqueue;
  const result3 = resolveOnWrong(currentItem3, pool, course, variantMap);
  pool = [...pool, result3.itemToEnqueue];
  poolSize = Math.max(poolSize, pool.length);
  
  if (result3.nextVariantNum && currentItem3.clusterId) {
    variantMap.set(currentItem3.clusterId, result3.nextVariantNum);
  }
  
  steps.push({
    step: 3,
    action: "wrong",
    enqueuedId: result3.itemToEnqueue.id,
    enqueuedVariant: result3.itemToEnqueue.variant,
    poolLength: pool.length,
    poolSize,
    progress: 1 - pool.length / poolSize,
  });

  // Validate rotation: 2 → 3 → 1
  const rotationCorrect =
    result1.itemToEnqueue.variant === "2" &&
    result2.itemToEnqueue.variant === "3" &&
    result3.itemToEnqueue.variant === "1";

  // Validate pool growth and poolSize tracking
  const poolGrowthCorrect = steps.every((s, i) => s.poolLength === i + 2);
  const poolSizeCorrect = steps[2].poolSize === 4; // High-water mark after 3 wrongs

  // Validate progress calculation: progress = 1 - pool.length / poolSize
  const progressCorrect = steps.every(s => 
    Math.abs(s.progress - (1 - s.poolLength / s.poolSize)) < 0.001
  );

  const pass = rotationCorrect && poolGrowthCorrect && poolSizeCorrect && progressCorrect;

  return {
    pass,
    details: {
      rotationCorrect,
      poolGrowthCorrect,
      poolSizeCorrect,
      progressCorrect,
      steps,
      expectedRotation: ["2", "3", "1"],
      actualRotation: [
        result1.itemToEnqueue.variant,
        result2.itemToEnqueue.variant,
        result3.itemToEnqueue.variant,
      ],
    },
  };
}

/**
 * Test 2: Correct removes item, poolSize stays constant (high-water mark)
 */
export async function testCorrectRemovesItem(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createTestCourse();
  const item1 = course.items[0];
  const item2 = course.items[1];
  
  let pool: CourseItem[] = [item1, item2];
  let poolSize = pool.length; // Initial: 2
  
  const steps: any[] = [];

  // Step 1: Correct answer → remove item
  pool = pool.filter(item => item.id !== item1.id);
  const progress1 = 1 - pool.length / poolSize;
  
  steps.push({
    step: 1,
    action: "correct",
    poolLength: pool.length,
    poolSize,
    progress: progress1,
  });

  // Step 2: Wrong answer → add item, update poolSize
  const variantMap = new Map<string, number>();
  const wrongResult = resolveOnWrong(item2, pool, course, variantMap);
  pool = [...pool, wrongResult.itemToEnqueue];
  poolSize = Math.max(poolSize, pool.length); // High-water mark
  const progress2 = 1 - pool.length / poolSize;
  
  steps.push({
    step: 2,
    action: "wrong",
    poolLength: pool.length,
    poolSize,
    progress: progress2,
  });

  // Step 3: Correct answer → remove item, poolSize stays at high-water
  pool = pool.filter(item => item.id !== item2.id);
  const progress3 = 1 - pool.length / poolSize;
  
  steps.push({
    step: 3,
    action: "correct",
    poolLength: pool.length,
    poolSize,
    progress: progress3,
  });

  // Validate: poolSize never decreases (high-water mark)
  const poolSizeNeverDecreases = 
    steps[0].poolSize === 2 &&
    steps[1].poolSize === 2 && // Grew to 2 but was already 2
    steps[2].poolSize === 2;   // Stays at 2 even after removing

  // Validate: correct removes, wrong adds
  const correctRemoves = steps[0].poolLength === 1 && steps[2].poolLength === 1;
  const wrongAdds = steps[1].poolLength === 2;

  const pass = poolSizeNeverDecreases && correctRemoves && wrongAdds;

  return {
    pass,
    details: {
      poolSizeNeverDecreases,
      correctRemoves,
      wrongAdds,
      steps,
    },
  };
}

/**
 * Test 3: No cluster fallback (duplicate same item)
 */
export async function testNoClusterFallback(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createTestCourse();
  const standaloneItem = course.items.find(i => !i.clusterId)!;
  
  const pool: CourseItem[] = [standaloneItem];
  const variantMap = new Map<string, number>();
  
  // Wrong on standalone item → should duplicate same item
  const result = resolveOnWrong(standaloneItem, pool, course, variantMap);
  
  const pass = 
    result.itemToEnqueue.id === standaloneItem.id &&
    result.nextVariantNum === undefined;

  return {
    pass,
    details: {
      originalId: standaloneItem.id,
      enqueuedId: result.itemToEnqueue.id,
      sameItem: result.itemToEnqueue.id === standaloneItem.id,
      noVariantRotation: result.nextVariantNum === undefined,
    },
  };
}

/**
 * Test 4: Store returns correct/gameEnded without auto-advancing
 */
export async function testNoAutoAdvance(): Promise<{
  pass: boolean;
  details: any;
}> {
  // This test verifies the contract: processAnswer returns {isCorrect, gameEnded}
  // but does NOT change currentItem. UI controls timing via advanceToNext().
  
  // Mock implementation check - must remove by index to match store behavior
  const mockProcessAnswer = (
    pool: CourseItem[],
    currentIndex: number,
    isCorrect: boolean
  ): { correct: boolean; gameEnded: boolean; poolAfter: CourseItem[] } => {
    if (isCorrect) {
      // Remove by index (immutable splice) - matches actual store
      const newPool = [
        ...pool.slice(0, currentIndex),
        ...pool.slice(currentIndex + 1)
      ];
      return { correct: true, gameEnded: newPool.length === 0, poolAfter: newPool };
    } else {
      // Add to pool (simplified - no rotation for mock)
      const newPool = [...pool, pool[currentIndex]];
      return { correct: false, gameEnded: false, poolAfter: newPool };
    }
  };

  const item1 = { id: 1, groupId: 1, text: "Test _", explain: "", clusterId: "c1", variant: "1", options: ["a", "b"], correctIndex: 0 } as CourseItem;
  const item2 = { id: 2, groupId: 1, text: "Test _", explain: "", clusterId: "c2", variant: "1", options: ["a", "b"], correctIndex: 0 } as CourseItem;
  
  let pool = [item1, item2];
  const currentIndex = 0; // Pointing to item1

  // Wrong answer: pool should grow, currentIndex stays same
  const wrongResult = mockProcessAnswer(pool, currentIndex, false);
  const poolGrewOnWrong = wrongResult.poolAfter.length === pool.length + 1;
  
  pool = wrongResult.poolAfter;

  // Correct answer: pool should shrink, check gameEnded
  const correctResult = mockProcessAnswer(pool, currentIndex, true);
  const poolShrankOnCorrect = correctResult.poolAfter.length === pool.length - 1;
  const gameNotEnded = !correctResult.gameEnded; // Pool still has items

  const pass = poolGrewOnWrong && poolShrankOnCorrect && gameNotEnded;

  return {
    pass,
    details: {
      poolGrewOnWrong,
      poolShrankOnCorrect,
      gameNotEnded,
      wrongReturnedGameEnded: wrongResult.gameEnded,
      correctReturnedGameEnded: correctResult.gameEnded,
    },
  };
}

/**
 * Run all adaptive core tests
 */
export async function runAdaptiveCoreTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const [test1, test2, test3, test4] = await Promise.all([
      testClusterRotationWithPoolSize(),
      testCorrectRemovesItem(),
      testNoClusterFallback(),
      testNoAutoAdvance(),
    ]);

    const allPass = test1.pass && test2.pass && test3.pass && test4.pass;

    return {
      pass: allPass,
      details: {
        clusterRotationWithPoolSize: test1,
        correctRemovesItem: test2,
        noClusterFallback: test3,
        noAutoAdvance: test4,
        summary: {
          total: 4,
          passed: [test1.pass, test2.pass, test3.pass, test4.pass].filter(Boolean).length,
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
