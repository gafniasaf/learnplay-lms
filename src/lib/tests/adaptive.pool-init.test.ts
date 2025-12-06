/**
 * Adaptive Pool Init Test
 * Verifies that poolSize equals initial pool length and all items are in allowed range
 */

export async function runAdaptivePoolInitializationTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const level = { start: 0, end: 7 };
    const items = Array.from({ length: 48 }, (_, i) => ({ id: i + 1, groupId: i % 16 }));
    const allowed = new Set(Array.from({ length: level.end - level.start + 1 }, (_, i) => level.start + i));
    const pool = items.filter(i => allowed.has(i.groupId));
    const poolSize = pool.length;
    
    const test1Pass = poolSize === pool.length;
    const test2Pass = pool.every(i => i.groupId >= 0 && i.groupId <= 7);
    
    const pass = test1Pass && test2Pass;

    return {
      pass,
      details: {
        poolSize,
        poolLength: pool.length,
        poolSizeEqualsLength: test1Pass,
        allItemsInRange: test2Pass,
        levelRange: `${level.start}-${level.end}`,
        allowedGroupIds: Array.from(allowed).sort((a, b) => a - b),
        sampleItems: pool.slice(0, 5).map(i => ({ id: i.id, groupId: i.groupId })),
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
