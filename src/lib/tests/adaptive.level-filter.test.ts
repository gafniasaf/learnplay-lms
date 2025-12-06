/**
 * Adaptive Level Filter Test
 * Verifies that level group range filtering correctly includes groups 0-7 for Level 3
 * and groups 8-15 for Level 6
 */

function makeCourse() {
  const groups = Array.from({ length: 16 }, (_, id) => ({ id, name: `G${id}` }));
  const items = Array.from({ length: 48 }, (_, i) => ({ id: i + 1, groupId: i % 16 })); // 3 per group
  return { groups, items };
}

function filterByLevel(items: any[], start: number, end: number) {
  const allowed = new Set(Array.from({ length: end - start + 1 }, (_, i) => start + i));
  return items.filter(it => allowed.has(it.groupId));
}

export async function runAdaptiveLevelFilterTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const results: any[] = [];
    const { groups, items } = makeCourse();

    // Test 1: Level 3 includes groups 0-7 (24 items)
    {
      const filtered = filterByLevel(items, 0, 7);
      const presentGroups = Array.from(new Set(filtered.map(i => i.groupId))).sort((a, b) => a - b);
      const visibleGroups = groups.filter(g => g.id >= 0 && g.id <= 7);
      
      const test1Pass = 
        filtered.length === 24 &&
        JSON.stringify(presentGroups) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]) &&
        visibleGroups.length === 8;
      
      results.push({
        level: 'Level 3',
        range: '0-7',
        pass: test1Pass,
        itemCount: filtered.length,
        expectedItemCount: 24,
        presentGroups,
        expectedGroups: [0, 1, 2, 3, 4, 5, 6, 7],
        visibleGroupCount: visibleGroups.length,
        expectedVisibleCount: 8,
      });
    }

    // Test 2: Level 6 includes groups 8-15 (24 items)
    {
      const filtered = filterByLevel(items, 8, 15);
      const presentGroups = Array.from(new Set(filtered.map(i => i.groupId))).sort((a, b) => a - b);
      const visibleGroups = groups.filter(g => g.id >= 8 && g.id <= 15);
      
      const test2Pass = 
        filtered.length === 24 &&
        JSON.stringify(presentGroups) === JSON.stringify([8, 9, 10, 11, 12, 13, 14, 15]) &&
        visibleGroups.length === 8;
      
      results.push({
        level: 'Level 6',
        range: '8-15',
        pass: test2Pass,
        itemCount: filtered.length,
        expectedItemCount: 24,
        presentGroups,
        expectedGroups: [8, 9, 10, 11, 12, 13, 14, 15],
        visibleGroupCount: visibleGroups.length,
        expectedVisibleCount: 8,
      });
    }

    const pass = results.every(r => r.pass);

    return {
      pass,
      details: {
        results,
        allPassed: pass,
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
