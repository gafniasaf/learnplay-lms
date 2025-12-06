/**
 * History Course Level-Range Integration Tests
 * Verifies that level filtering correctly enforces group ranges for History course
 * Catches regressions where items from wrong groups appear
 */

import { getItemsForLevel, getGroupIdsForLevel, getCourseLevels } from "@/lib/levels";
import { getCourse } from "@/lib/api";
import type { Course } from "@/lib/types/course";

/**
 * Test Level 1: Colonial & Revolutionary Era (groups 0-3)
 */
async function testHistoryLevel1(): Promise<{ pass: boolean; details: any }> {
  try {
    const course = await getCourse("history");
    const levels = getCourseLevels(course);
    const level1 = levels.find(l => l.id === 1);
    
    if (!level1) {
      return {
        pass: false,
        details: { error: "Level 1 not found in history course" }
      };
    }

    // Expected range: 0-3
    const expectedStart = 0;
    const expectedEnd = 3;
    const expectedGroups = [0, 1, 2, 3];

    // Verify level definition
    if (level1.start !== expectedStart || level1.end !== expectedEnd) {
      return {
        pass: false,
        details: {
          error: "Level 1 has incorrect range definition",
          expected: { start: expectedStart, end: expectedEnd },
          actual: { start: level1.start, end: level1.end }
        }
      };
    }

    // Get items for level
    const items = getItemsForLevel(course, 1);
    
    if (items.length === 0) {
      return {
        pass: false,
        details: { error: "Level 1 returned 0 items" }
      };
    }

    // Verify all items are in range
    const outOfRangeItems = items.filter(item => 
      item.groupId < expectedStart || item.groupId > expectedEnd
    );

    if (outOfRangeItems.length > 0) {
      return {
        pass: false,
        details: {
          error: "Level 1 contains items outside expected group range",
          expectedRange: `${expectedStart}-${expectedEnd}`,
          outOfRangeItems: outOfRangeItems.map(item => ({
            id: item.id,
            groupId: item.groupId,
            text: item.text.substring(0, 50)
          }))
        }
      };
    }

    // Verify we have items from expected groups
    const actualGroups = [...new Set(items.map(item => item.groupId))].sort((a, b) => a - b);
    const hasAllExpectedGroups = expectedGroups.every(g => actualGroups.includes(g));

    return {
      pass: true,
      details: {
        levelTitle: level1.title,
        range: `${level1.start}-${level1.end}`,
        itemCount: items.length,
        actualGroups,
        hasAllExpectedGroups
      }
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }
}

/**
 * Test Level 2: Expansion & Division (groups 4-6)
 */
async function testHistoryLevel2(): Promise<{ pass: boolean; details: any }> {
  try {
    const course = await getCourse("history");
    const levels = getCourseLevels(course);
    const level2 = levels.find(l => l.id === 2);
    
    if (!level2) {
      return {
        pass: false,
        details: { error: "Level 2 not found in history course" }
      };
    }

    const expectedStart = 4;
    const expectedEnd = 6;
    const expectedGroups = [4, 5, 6];

    if (level2.start !== expectedStart || level2.end !== expectedEnd) {
      return {
        pass: false,
        details: {
          error: "Level 2 has incorrect range definition",
          expected: { start: expectedStart, end: expectedEnd },
          actual: { start: level2.start, end: level2.end }
        }
      };
    }

    const items = getItemsForLevel(course, 2);
    
    if (items.length === 0) {
      return {
        pass: false,
        details: { error: "Level 2 returned 0 items" }
      };
    }

    const outOfRangeItems = items.filter(item => 
      item.groupId < expectedStart || item.groupId > expectedEnd
    );

    if (outOfRangeItems.length > 0) {
      return {
        pass: false,
        details: {
          error: "Level 2 contains items outside expected group range",
          expectedRange: `${expectedStart}-${expectedEnd}`,
          outOfRangeItems: outOfRangeItems.map(item => ({
            id: item.id,
            groupId: item.groupId,
            text: item.text.substring(0, 50)
          }))
        }
      };
    }

    const actualGroups = [...new Set(items.map(item => item.groupId))].sort((a, b) => a - b);

    return {
      pass: true,
      details: {
        levelTitle: level2.title,
        range: `${level2.start}-${level2.end}`,
        itemCount: items.length,
        actualGroups
      }
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }
}

/**
 * Test Level 3: Modern America (groups 7-9) - CRITICAL TEST
 */
async function testHistoryLevel3(): Promise<{ pass: boolean; details: any }> {
  try {
    const course = await getCourse("history");
    const levels = getCourseLevels(course);
    const level3 = levels.find(l => l.id === 3);
    
    if (!level3) {
      return {
        pass: false,
        details: { error: "Level 3 not found in history course" }
      };
    }

    // CRITICAL: Level 3 should be Industrial Age, World Wars, Civil Rights (groups 7-9)
    const expectedStart = 7;
    const expectedEnd = 9;
    const expectedGroups = [7, 8, 9];

    if (level3.start !== expectedStart || level3.end !== expectedEnd) {
      return {
        pass: false,
        details: {
          error: "Level 3 has incorrect range definition",
          expected: { start: expectedStart, end: expectedEnd },
          actual: { start: level3.start, end: level3.end }
        }
      };
    }

    const items = getItemsForLevel(course, 3);
    
    if (items.length === 0) {
      return {
        pass: false,
        details: { error: "Level 3 returned 0 items - should have Modern America content" }
      };
    }

    // CRITICAL: Fail if ANY item is outside {7,8,9}
    const outOfRangeItems = items.filter(item => 
      !expectedGroups.includes(item.groupId)
    );

    if (outOfRangeItems.length > 0) {
      return {
        pass: false,
        details: {
          error: "⚠️ CRITICAL: Level 3 contains items outside Modern America range!",
          expectedGroups: expectedGroups,
          outOfRangeItems: outOfRangeItems.map(item => ({
            id: item.id,
            groupId: item.groupId,
            text: item.text.substring(0, 80),
            explain: item.explain.substring(0, 80)
          }))
        }
      };
    }

    const actualGroups = [...new Set(items.map(item => item.groupId))].sort((a, b) => a - b);
    
    // Verify we have Modern America content (groups 7, 8, 9)
    const groupNames = course.groups
      .filter(g => expectedGroups.includes(g.id))
      .map(g => ({ id: g.id, name: g.name }));

    return {
      pass: true,
      details: {
        levelTitle: level3.title,
        range: `${level3.start}-${level3.end}`,
        itemCount: items.length,
        actualGroups,
        groupNames,
        sampleItems: items.slice(0, 3).map(item => ({
          id: item.id,
          groupId: item.groupId,
          text: item.text.substring(0, 60)
        }))
      }
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }
}

/**
 * Test Level 4: Complete Review (groups 0-9)
 */
async function testHistoryLevel4(): Promise<{ pass: boolean; details: any }> {
  try {
    const course = await getCourse("history");
    const levels = getCourseLevels(course);
    const level4 = levels.find(l => l.id === 4);
    
    if (!level4) {
      return {
        pass: false,
        details: { error: "Level 4 not found in history course" }
      };
    }

    const expectedStart = 0;
    const expectedEnd = 9;

    if (level4.start !== expectedStart || level4.end !== expectedEnd) {
      return {
        pass: false,
        details: {
          error: "Level 4 has incorrect range definition",
          expected: { start: expectedStart, end: expectedEnd },
          actual: { start: level4.start, end: level4.end }
        }
      };
    }

    const items = getItemsForLevel(course, 4);
    
    // Level 4 should have ALL items from the course
    if (items.length !== course.items.length) {
      return {
        pass: false,
        details: {
          error: "Level 4 (Complete Review) should contain all course items",
          expected: course.items.length,
          actual: items.length
        }
      };
    }

    const actualGroups = [...new Set(items.map(item => item.groupId))].sort((a, b) => a - b);
    const expectedAllGroups = Array.from({ length: 10 }, (_, i) => i);
    
    return {
      pass: true,
      details: {
        levelTitle: level4.title,
        range: `${level4.start}-${level4.end}`,
        itemCount: items.length,
        actualGroups,
        coversAllGroups: expectedAllGroups.every(g => actualGroups.includes(g))
      }
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Test failed: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }
}

/**
 * Run all History level-range tests
 */
export async function runHistoryLevelsTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    console.log("[Test] Running History level-range integration tests...");

    const level1Result = await testHistoryLevel1();
    const level2Result = await testHistoryLevel2();
    const level3Result = await testHistoryLevel3();
    const level4Result = await testHistoryLevel4();

    const allPassed = 
      level1Result.pass && 
      level2Result.pass && 
      level3Result.pass && 
      level4Result.pass;

    return {
      pass: allPassed,
      details: {
        level1: level1Result,
        level2: level2Result,
        level3: level3Result,
        level4: level4Result,
        summary: {
          total: 4,
          passed: [level1Result, level2Result, level3Result, level4Result].filter(r => r.pass).length,
          failed: [level1Result, level2Result, level3Result, level4Result].filter(r => !r.pass).length
        }
      }
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Test suite failed: ${error instanceof Error ? error.message : String(error)}`
      }
    };
  }
}
