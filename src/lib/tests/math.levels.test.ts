/**
 * Level Filtering Test
 * Verifies that level-based item filtering uses numeric ranges correctly
 * Tests future math courses with numeric groupId ranges
 */

import { getItemsForLevel, getGroupIdsForLevel, isValidLevel, getNextLevelId, parseLevelFromUrl } from "@/lib/levels";
import type { Course, CourseLevel } from "@/lib/types/course";

/**
 * Create mock course with numeric group ranges
 */
function createMockCourse(): Course {
  return {
    id: "math-test",
    title: "Math Test Course",
    levels: [
      { id: 1, start: 1, end: 4, title: "Level 1: Addition" },
      { id: 2, start: 5, end: 8, title: "Level 2: Subtraction" },
      { id: 3, start: 9, end: 12, title: "Level 3: Multiplication" },
    ],
    groups: [
      { id: 1, name: "Add 1-digit" },
      { id: 2, name: "Add 2-digit" },
      { id: 3, name: "Add 3-digit" },
      { id: 4, name: "Add mixed" },
      { id: 5, name: "Subtract 1-digit" },
      { id: 6, name: "Subtract 2-digit" },
      { id: 7, name: "Subtract 3-digit" },
      { id: 8, name: "Subtract mixed" },
      { id: 9, name: "Multiply 1-digit" },
      { id: 10, name: "Multiply 2-digit" },
      { id: 11, name: "Multiply 3-digit" },
      { id: 12, name: "Multiply mixed" },
    ],
    items: [
      // Level 1 items (groups 1-4)
      { id: 1, groupId: 1, text: "2 + 2 = _", explain: "Basic addition", clusterId: "add-1", variant: "1", options: ["3", "4", "5"], correctIndex: 1 },
      { id: 2, groupId: 2, text: "12 + 23 = _", explain: "Two-digit addition", clusterId: "add-2", variant: "1", options: ["34", "35", "36"], correctIndex: 1 },
      { id: 3, groupId: 3, text: "123 + 234 = _", explain: "Three-digit addition", clusterId: "add-3", variant: "1", options: ["356", "357", "358"], correctIndex: 1 },
      { id: 4, groupId: 4, text: "5 + 15 = _", explain: "Mixed addition", clusterId: "add-4", variant: "1", options: ["19", "20", "21"], correctIndex: 1 },
      // Level 2 items (groups 5-8)
      { id: 5, groupId: 5, text: "5 - 2 = _", explain: "Basic subtraction", clusterId: "sub-1", variant: "1", options: ["2", "3", "4"], correctIndex: 1 },
      { id: 6, groupId: 6, text: "25 - 12 = _", explain: "Two-digit subtraction", clusterId: "sub-2", variant: "1", options: ["12", "13", "14"], correctIndex: 1 },
      { id: 7, groupId: 7, text: "234 - 123 = _", explain: "Three-digit subtraction", clusterId: "sub-3", variant: "1", options: ["110", "111", "112"], correctIndex: 1 },
      { id: 8, groupId: 8, text: "20 - 5 = _", explain: "Mixed subtraction", clusterId: "sub-4", variant: "1", options: ["14", "15", "16"], correctIndex: 1 },
      // Level 3 items (groups 9-12)
      { id: 9, groupId: 9, text: "3 × 2 = _", explain: "Basic multiplication", clusterId: "mul-1", variant: "1", options: ["5", "6", "7"], correctIndex: 1 },
      { id: 10, groupId: 10, text: "12 × 2 = _", explain: "Two-digit multiplication", clusterId: "mul-2", variant: "1", options: ["23", "24", "25"], correctIndex: 1 },
      { id: 11, groupId: 11, text: "123 × 2 = _", explain: "Three-digit multiplication", clusterId: "mul-3", variant: "1", options: ["245", "246", "247"], correctIndex: 1 },
      { id: 12, groupId: 12, text: "5 × 15 = _", explain: "Mixed multiplication", clusterId: "mul-4", variant: "1", options: ["74", "75", "76"], correctIndex: 1 },
    ],
  };
}

/**
 * Test 1: Level 1 filters groups 1-4 (inclusive)
 */
export async function testLevel1Filtering(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  const items = getItemsForLevel(course, 1);
  
  // Should have exactly 4 items (groups 1-4)
  const correctCount = items.length === 4;
  
  // All items should have groupId 1-4
  const correctGroups = items.every(item => item.groupId >= 1 && item.groupId <= 4);
  
  // Verify specific group IDs
  const groupIds = items.map(item => item.groupId).sort((a, b) => a - b);
  const expectedGroups = [1, 2, 3, 4];
  const groupsMatch = JSON.stringify(groupIds) === JSON.stringify(expectedGroups);

  const pass = correctCount && correctGroups && groupsMatch;

  return {
    pass,
    details: {
      correctCount,
      correctGroups,
      groupsMatch,
      itemCount: items.length,
      groupIds,
      expectedGroups,
    },
  };
}

/**
 * Test 2: Level 2 filters groups 5-8 (inclusive)
 */
export async function testLevel2Filtering(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  const items = getItemsForLevel(course, 2);
  
  const correctCount = items.length === 4;
  const correctGroups = items.every(item => item.groupId >= 5 && item.groupId <= 8);
  
  const groupIds = items.map(item => item.groupId).sort((a, b) => a - b);
  const expectedGroups = [5, 6, 7, 8];
  const groupsMatch = JSON.stringify(groupIds) === JSON.stringify(expectedGroups);

  const pass = correctCount && correctGroups && groupsMatch;

  return {
    pass,
    details: {
      correctCount,
      correctGroups,
      groupsMatch,
      itemCount: items.length,
      groupIds,
      expectedGroups,
    },
  };
}

/**
 * Test 3: Level 3 filters groups 9-12 (inclusive)
 */
export async function testLevel3Filtering(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  const items = getItemsForLevel(course, 3);
  
  const correctCount = items.length === 4;
  const correctGroups = items.every(item => item.groupId >= 9 && item.groupId <= 12);
  
  const groupIds = items.map(item => item.groupId).sort((a, b) => a - b);
  const expectedGroups = [9, 10, 11, 12];
  const groupsMatch = JSON.stringify(groupIds) === JSON.stringify(expectedGroups);

  const pass = correctCount && correctGroups && groupsMatch;

  return {
    pass,
    details: {
      correctCount,
      correctGroups,
      groupsMatch,
      itemCount: items.length,
      groupIds,
      expectedGroups,
    },
  };
}

/**
 * Test 4: getGroupIdsForLevel returns correct range
 */
export async function testGetGroupIdsForLevel(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  const level1 = course.levels[0];
  const level2 = course.levels[1];
  
  const groupIds1 = getGroupIdsForLevel(level1);
  const groupIds2 = getGroupIdsForLevel(level2);
  
  const level1Correct = JSON.stringify(groupIds1) === JSON.stringify([1, 2, 3, 4]);
  const level2Correct = JSON.stringify(groupIds2) === JSON.stringify([5, 6, 7, 8]);

  const pass = level1Correct && level2Correct;

  return {
    pass,
    details: {
      level1Correct,
      level2Correct,
      groupIds1,
      groupIds2,
      expectedLevel1: [1, 2, 3, 4],
      expectedLevel2: [5, 6, 7, 8],
    },
  };
}

/**
 * Test 5: isValidLevel validates level IDs
 */
export async function testIsValidLevel(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  
  const valid1 = isValidLevel(course, 1);
  const valid2 = isValidLevel(course, 2);
  const valid3 = isValidLevel(course, 3);
  const invalid0 = !isValidLevel(course, 0);
  const invalid99 = !isValidLevel(course, 99);

  const pass = valid1 && valid2 && valid3 && invalid0 && invalid99;

  return {
    pass,
    details: {
      valid1,
      valid2,
      valid3,
      invalid0,
      invalid99,
    },
  };
}

/**
 * Test 6: getNextLevelId returns next level or null
 */
export async function testGetNextLevelId(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  
  const next1 = getNextLevelId(course, 1);
  const next2 = getNextLevelId(course, 2);
  const next3 = getNextLevelId(course, 3); // Should be null (last level)
  
  const correct1 = next1 === 2;
  const correct2 = next2 === 3;
  const correct3 = next3 === null;

  const pass = correct1 && correct2 && correct3;

  return {
    pass,
    details: {
      correct1,
      correct2,
      correct3,
      next1,
      next2,
      next3,
      expectedNext1: 2,
      expectedNext2: 3,
      expectedNext3: null,
    },
  };
}

/**
 * Test 7: parseLevelFromUrl validates and parses level param
 */
export async function testParseLevelFromUrl(): Promise<{
  pass: boolean;
  details: any;
}> {
  const course = createMockCourse();
  
  const params1 = new URLSearchParams("level=1");
  const params2 = new URLSearchParams("level=2");
  const paramsInvalid = new URLSearchParams("level=99");
  const paramsNaN = new URLSearchParams("level=abc");
  const paramsEmpty = new URLSearchParams("");
  
  const parsed1 = parseLevelFromUrl(params1, course);
  const parsed2 = parseLevelFromUrl(params2, course);
  const parsedInvalid = parseLevelFromUrl(paramsInvalid, course);
  const parsedNaN = parseLevelFromUrl(paramsNaN, course);
  const parsedEmpty = parseLevelFromUrl(paramsEmpty, course);
  
  const correct1 = parsed1 === 1;
  const correct2 = parsed2 === 2;
  const correctInvalid = parsedInvalid === null;
  const correctNaN = parsedNaN === null;
  const correctEmpty = parsedEmpty === null;

  const pass = correct1 && correct2 && correctInvalid && correctNaN && correctEmpty;

  return {
    pass,
    details: {
      correct1,
      correct2,
      correctInvalid,
      correctNaN,
      correctEmpty,
      parsed1,
      parsed2,
      parsedInvalid,
      parsedNaN,
      parsedEmpty,
    },
  };
}

/**
 * Run all math levels tests
 */
export async function runMathLevelsTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const [test1, test2, test3, test4, test5, test6, test7] = await Promise.all([
      testLevel1Filtering(),
      testLevel2Filtering(),
      testLevel3Filtering(),
      testGetGroupIdsForLevel(),
      testIsValidLevel(),
      testGetNextLevelId(),
      testParseLevelFromUrl(),
    ]);

    const allPass = 
      test1.pass && 
      test2.pass && 
      test3.pass && 
      test4.pass && 
      test5.pass && 
      test6.pass && 
      test7.pass;

    return {
      pass: allPass,
      details: {
        level1Filtering: test1,
        level2Filtering: test2,
        level3Filtering: test3,
        getGroupIdsForLevel: test4,
        isValidLevel: test5,
        getNextLevelId: test6,
        parseLevelFromUrl: test7,
        summary: {
          total: 7,
          passed: [test1, test2, test3, test4, test5, test6, test7].filter(t => t.pass).length,
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
