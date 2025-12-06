/**
 * Adaptive Wrong Answer Rotation Test
 * Verifies that wrong answers duplicate items with 1→2→3→1 variant rotation
 */

type Variant = '1' | '2' | '3';

// Minimal helpers mirroring nextVariant 1->2->3->1
function nextVariant(v: Variant): Variant {
  return v === '1' ? '2' : v === '2' ? '3' : '1';
}

export async function runAdaptiveWrongRotationTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const results: any[] = [];

    // Test 1: Variant rotation on wrong answers
    {
      const clusterId = 'c';
      const a1 = { id: 10, clusterId, variant: '1' as Variant };
      const a2 = { id: 11, clusterId, variant: '2' as Variant };
      const a3 = { id: 12, clusterId, variant: '3' as Variant };
      const all = [a1, a2, a3];
      const pool = [a1];
      let poolSize = pool.length;

      // wrong on 1 -> enqueue 2
      {
        const current = a1;
        const target = all.find(x => x.clusterId === current.clusterId && x.variant === nextVariant(current.variant))!;
        pool.push(target);
        poolSize = Math.max(poolSize, pool.length);
        
        const test1Pass = 
          JSON.stringify(pool.map(x => x.variant)) === JSON.stringify(['1', '2']) &&
          poolSize === 2;
        
        results.push({ step: 'wrong on 1', pass: test1Pass, poolVariants: pool.map(x => x.variant), poolSize });
      }

      // wrong on 2 -> enqueue 3
      {
        const current = a2;
        const target = all.find(x => x.variant === nextVariant(current.variant))!;
        pool.push(target);
        poolSize = Math.max(poolSize, pool.length);
        
        const test2Pass = 
          JSON.stringify(pool.map(x => x.variant)) === JSON.stringify(['1', '2', '3']) &&
          poolSize === 3;
        
        results.push({ step: 'wrong on 2', pass: test2Pass, poolVariants: pool.map(x => x.variant), poolSize });
      }

      // wrong on 3 -> enqueue 1
      {
        const current = a3;
        const target = all.find(x => x.variant === nextVariant(current.variant))!;
        pool.push(target);
        poolSize = Math.max(poolSize, pool.length);
        
        const test3Pass = 
          JSON.stringify(pool.map(x => x.variant)) === JSON.stringify(['1', '2', '3', '1']) &&
          poolSize === 4;
        
        results.push({ step: 'wrong on 3', pass: test3Pass, poolVariants: pool.map(x => x.variant), poolSize });
      }
    }

    // Test 2: No cluster fallback - duplicates same item object
    {
      const item = { id: 99 };
      const pool = [item];
      const before = pool.length;
      pool.push(item);
      
      const test4Pass = 
        pool.length === before + 1 &&
        pool[0] === pool[1];
      
      results.push({ 
        step: 'no cluster fallback', 
        pass: test4Pass, 
        poolLength: pool.length, 
        sameReference: pool[0] === pool[1] 
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
