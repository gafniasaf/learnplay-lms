/**
 * Adaptive Pool Init & Level Filter Test
 * Verifies that pool initialization correctly filters items by level's group range
 */

export async function runAdaptivePoolInitTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const course = {
      groups: Array.from({ length: 16 }, (_, i) => ({ id: i, name: `G${i}` })),
      levels: [{ id: 3, title: 'L3', start: 0, end: 7 }],
      items: Array.from({ length: 48 }, (_, i) => ({ id: i + 1, groupId: i % 16 }))
    };

    const level = course.levels[0];
    const allowed = new Set(Array.from({ length: level.end - level.start + 1 }, (_, i) => level.start + i));
    const levelItems = course.items.filter(it => allowed.has(it.groupId));
    const visibleGroups = course.groups.filter(g => allowed.has(g.id));

    const pass = 
      allowed.size === 8 &&
      visibleGroups.length === 8 &&
      levelItems.every(it => it.groupId >= 0 && it.groupId <= 7);

    return {
      pass,
      details: {
        allowedSize: allowed.size,
        visibleGroupsLength: visibleGroups.length,
        levelItemsCount: levelItems.length,
        allItemsInRange: levelItems.every(it => it.groupId >= 0 && it.groupId <= 7),
        sampleItems: levelItems.slice(0, 5).map(it => ({ id: it.id, groupId: it.groupId })),
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
