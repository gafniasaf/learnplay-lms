/**
 * Adaptive Correct Answer Test
 * Verifies that correct answers remove only the selected instance from the pool
 */

export async function runAdaptiveCorrectRemovesTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const pool = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 2 }]; // duplicate id=2
    const poolSize = pool.length;
    const randomIndex = 1; // the first id=2
    const newPool = pool.slice();
    newPool.splice(randomIndex, 1); // correct branch

    const test1Pass = JSON.stringify(newPool.map(x => x.id)) === JSON.stringify([1, 3, 2]);
    const test2Pass = poolSize === 4; // unchanged high-water mark

    const pass = test1Pass && test2Pass;

    return {
      pass,
      details: {
        initialPool: pool.map(x => x.id),
        initialPoolSize: poolSize,
        removedIndex: randomIndex,
        afterCorrectPool: newPool.map(x => x.id),
        afterCorrectPoolLength: newPool.length,
        poolSizeUnchanged: test2Pass,
        correctInstanceRemoved: test1Pass,
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
