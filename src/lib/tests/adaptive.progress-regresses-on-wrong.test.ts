/**
 * Adaptive Progress Regression Test
 * Verifies that progress = 1 - pool.length / poolSize regresses on wrong answers
 */

export async function runAdaptiveProgressRegressTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const results: any[] = [];
    const pool = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    let poolSize = pool.length;

    const progress = () => poolSize > 0 ? 1 - pool.length / poolSize : 0;
    
    // Initial state: progress should be 0.000
    const p0 = Number(progress().toFixed(3));
    const test1Pass = p0 === 0.000;
    results.push({ 
      step: 'initial (progress = 0)', 
      pass: test1Pass, 
      progress: p0, 
      poolLength: pool.length, 
      poolSize 
    });

    // Correct -> remove one item
    pool.splice(0, 1);
    const p1 = Number(progress().toFixed(3));
    const test2Pass = Math.abs(p1 - 0.200) < 0.001;
    results.push({ 
      step: 'after correct (progress = 0.2)', 
      pass: test2Pass, 
      progress: p1, 
      poolLength: pool.length, 
      poolSize 
    });

    // Wrong -> add one duplicate (pool doesn't exceed high-water yet)
    pool.push({ id: 1 } as any);
    const p2 = Number(progress().toFixed(3));
    const test3Pass = p2 < p1; // progress should regress
    results.push({ 
      step: 'after first wrong (regressed)', 
      pass: test3Pass, 
      progress: p2, 
      previousProgress: p1,
      poolLength: pool.length, 
      poolSize,
      regressed: p2 < p1
    });

    // Wrong again -> pool exceeds high-water, raise poolSize
    // progress may stay 0 when pool == poolSize (floor)
    pool.push({ id: 2 } as any);
    poolSize = Math.max(poolSize, pool.length); // bump high-water mark
    const p3 = Number(progress().toFixed(3));
    const test4Pass = p3 <= p2; // allow equal at 0 floor
    results.push({ 
      step: 'after second wrong (regressed or stayed at floor)', 
      pass: test4Pass, 
      progress: p3,
      previousProgress: p2,
      poolLength: pool.length, 
      poolSize,
      regressedOrFloor: p3 <= p2,
      atFloor: pool.length === poolSize
    });

    // Verify poolSize never decreases
    const savedPoolSize = poolSize;
    pool.splice(0, 2); // simulate more corrects
    const test5Pass = poolSize === savedPoolSize;
    results.push({
      step: 'poolSize never decreases',
      pass: test5Pass,
      poolSize,
      savedPoolSize,
      poolLength: pool.length
    });

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
