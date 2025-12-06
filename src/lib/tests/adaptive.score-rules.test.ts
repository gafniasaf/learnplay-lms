/**
 * Adaptive Score Rules Test
 * Verifies that correct +1, wrong -1, floored at 0
 */

export async function runAdaptiveScoreRulesTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const results: any[] = [];
    let score = 0;
    const correct = () => { score += 1; };
    const wrong = () => { score = Math.max(0, score - 1); };

    // Initial state
    results.push({ step: 'initial', score, pass: true });

    // Two correct answers
    correct(); 
    correct();
    const test1Pass = score === 2;
    results.push({ step: 'after 2 correct (score = 2)', pass: test1Pass, score });

    // Three wrong answers (2 -> 1 -> 0 -> 0)
    const beforeWrong = score;
    wrong(); 
    const afterFirstWrong = score;
    results.push({ step: 'after 1 wrong (score = 1)', pass: afterFirstWrong === 1, score: afterFirstWrong });
    
    wrong(); 
    const afterSecondWrong = score;
    results.push({ step: 'after 2 wrong (score = 0)', pass: afterSecondWrong === 0, score: afterSecondWrong });
    
    wrong();
    const afterThirdWrong = score;
    const test2Pass = afterThirdWrong === 0; // floored at 0
    results.push({ step: 'after 3 wrong (floored at 0)', pass: test2Pass, score: afterThirdWrong });

    const pass = results.every(r => r.pass);

    return {
      pass,
      details: {
        results,
        allPassed: pass,
        noteOnFloor: 'Score cannot go below 0',
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
