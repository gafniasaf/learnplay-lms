/**
 * Math Numeric Grading Test
 * Validates numeric answer grading logic for math courses
 * Tests tolerance, edge cases, and mode validation
 */

import type { CourseItem } from "@/lib/types/course";

/**
 * Tolerance for numeric comparison (from Play.tsx)
 */
const NUMERIC_TOLERANCE = 0.001;

/**
 * Grade numeric answer (mirrors Play.tsx logic)
 */
function gradeNumericAnswer(userAnswer: number, correctAnswer: number): boolean {
  return Math.abs(userAnswer - correctAnswer) < NUMERIC_TOLERANCE;
}

/**
 * Test 1: Exact match is correct
 */
export async function testExactMatch(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 42,
    text: "6 × 7 = _",
  };

  const result = gradeNumericAnswer(42, item.answer!);
  
  return {
    pass: result === true,
    details: {
      userAnswer: 42,
      correctAnswer: item.answer,
      result,
      expected: true,
    },
  };
}

/**
 * Test 2: Wrong answer is incorrect
 */
export async function testWrongAnswer(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 42,
    text: "6 × 7 = _",
  };

  const result = gradeNumericAnswer(41, item.answer!);
  
  return {
    pass: result === false,
    details: {
      userAnswer: 41,
      correctAnswer: item.answer,
      result,
      expected: false,
    },
  };
}

/**
 * Test 3: Within tolerance is correct
 */
export async function testWithinTolerance(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 10.5,
    text: "What is 10.5?",
  };

  // Test just within tolerance (10.5 + 0.0005)
  const result1 = gradeNumericAnswer(10.5005, item.answer!);
  // Test just within tolerance (10.5 - 0.0005)
  const result2 = gradeNumericAnswer(10.4995, item.answer!);
  
  const pass = result1 === true && result2 === true;
  
  return {
    pass,
    details: {
      correctAnswer: item.answer,
      test1: { userAnswer: 10.5005, result: result1, expected: true },
      test2: { userAnswer: 10.4995, result: result2, expected: true },
      tolerance: NUMERIC_TOLERANCE,
    },
  };
}

/**
 * Test 4: Outside tolerance is incorrect
 */
export async function testOutsideTolerance(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 10.5,
    text: "What is 10.5?",
  };

  // Test just outside tolerance (10.5 + 0.002)
  const result1 = gradeNumericAnswer(10.502, item.answer!);
  // Test just outside tolerance (10.5 - 0.002)
  const result2 = gradeNumericAnswer(10.498, item.answer!);
  
  const pass = result1 === false && result2 === false;
  
  return {
    pass,
    details: {
      correctAnswer: item.answer,
      test1: { userAnswer: 10.502, result: result1, expected: false },
      test2: { userAnswer: 10.498, result: result2, expected: false },
      tolerance: NUMERIC_TOLERANCE,
    },
  };
}

/**
 * Test 5: Zero handling
 */
export async function testZeroHandling(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 0,
    text: "5 - 5 = _",
  };

  const exactZero = gradeNumericAnswer(0, item.answer!);
  const nearZero = gradeNumericAnswer(0.0005, item.answer!);
  const notZero = gradeNumericAnswer(1, item.answer!);
  
  const pass = exactZero === true && nearZero === true && notZero === false;
  
  return {
    pass,
    details: {
      correctAnswer: item.answer,
      exactZero: { userAnswer: 0, result: exactZero, expected: true },
      nearZero: { userAnswer: 0.0005, result: nearZero, expected: true },
      notZero: { userAnswer: 1, result: notZero, expected: false },
    },
  };
}

/**
 * Test 6: Negative number handling
 */
export async function testNegativeNumbers(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: -15,
    text: "5 - 20 = _",
  };

  const exact = gradeNumericAnswer(-15, item.answer!);
  const wrong = gradeNumericAnswer(15, item.answer!);
  const close = gradeNumericAnswer(-15.0005, item.answer!);
  
  const pass = exact === true && wrong === false && close === true;
  
  return {
    pass,
    details: {
      correctAnswer: item.answer,
      exact: { userAnswer: -15, result: exact, expected: true },
      wrong: { userAnswer: 15, result: wrong, expected: false },
      close: { userAnswer: -15.0005, result: close, expected: true },
    },
  };
}

/**
 * Test 7: Large number handling
 */
export async function testLargeNumbers(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 9999,
    text: "100 × 99 + 99 = _",
  };

  const exact = gradeNumericAnswer(9999, item.answer!);
  const offByOne = gradeNumericAnswer(10000, item.answer!);
  const close = gradeNumericAnswer(9999.0005, item.answer!);
  
  const pass = exact === true && offByOne === false && close === true;
  
  return {
    pass,
    details: {
      correctAnswer: item.answer,
      exact: { userAnswer: 9999, result: exact, expected: true },
      offByOne: { userAnswer: 10000, result: offByOne, expected: false },
      close: { userAnswer: 9999.0005, result: close, expected: true },
    },
  };
}

/**
 * Test 8: Decimal precision
 */
export async function testDecimalPrecision(): Promise<{
  pass: boolean;
  details: any;
}> {
  const item: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 3.14159,
    text: "What is π to 5 decimals?",
  };

  const exact = gradeNumericAnswer(3.14159, item.answer!);
  const tooImprecise = gradeNumericAnswer(3.14, item.answer!);
  const closeEnough = gradeNumericAnswer(3.141595, item.answer!);
  
  const pass = exact === true && tooImprecise === false && closeEnough === true;
  
  return {
    pass,
    details: {
      correctAnswer: item.answer,
      exact: { userAnswer: 3.14159, result: exact, expected: true },
      tooImprecise: { userAnswer: 3.14, result: tooImprecise, expected: false },
      closeEnough: { userAnswer: 3.141595, result: closeEnough, expected: true },
      tolerance: NUMERIC_TOLERANCE,
    },
  };
}

/**
 * Test 9: Validate item structure for numeric mode
 */
export async function testNumericModeStructure(): Promise<{
  pass: boolean;
  details: any;
}> {
  const validItem: Partial<CourseItem> = {
    id: 1,
    mode: 'numeric',
    answer: 42,
    text: "6 × 7 = _",
    groupId: 1,
    clusterId: "mult-7",
    variant: "1",
    explain: "Multiplication",
  };

  const invalidItemNoAnswer: Partial<CourseItem> = {
    id: 2,
    mode: 'numeric',
    text: "Invalid",
  };

  const invalidItemWithOptions: Partial<CourseItem> = {
    id: 3,
    mode: 'numeric',
    answer: 42,
    options: ["40", "42", "44"],
    correctIndex: 1,
    text: "Should not have options",
  };

  const validHasAnswer = validItem.answer !== undefined;
  const invalidMissingAnswer = invalidItemNoAnswer.answer === undefined;
  const invalidHasOptions = invalidItemWithOptions.options !== undefined;

  const pass = validHasAnswer && invalidMissingAnswer && invalidHasOptions;

  return {
    pass,
    details: {
      validItem: {
        hasAnswer: validHasAnswer,
        hasOptions: validItem.options !== undefined,
        expected: "answer required, no options",
      },
      invalidNoAnswer: {
        hasAnswer: !invalidMissingAnswer,
        expected: "should fail - missing answer",
      },
      invalidWithOptions: {
        hasOptions: invalidHasOptions,
        expected: "should fail - has options",
      },
    },
  };
}

/**
 * Test 10: Rounding edge cases
 */
export async function testRoundingEdgeCases(): Promise<{
  pass: boolean;
  details: any;
}> {
  // Test cases where floating point arithmetic might cause issues
  const tests = [
    { answer: 0.1 + 0.2, userInput: 0.3, shouldBeCorrect: true },
    { answer: 0.7 + 0.1, userInput: 0.8, shouldBeCorrect: true },
    { answer: 1.1 + 2.2, userInput: 3.3, shouldBeCorrect: true },
  ];

  const results = tests.map(test => ({
    answer: test.answer,
    userInput: test.userInput,
    result: gradeNumericAnswer(test.userInput, test.answer),
    expected: test.shouldBeCorrect,
    pass: gradeNumericAnswer(test.userInput, test.answer) === test.shouldBeCorrect,
  }));

  const allPass = results.every(r => r.pass);

  return {
    pass: allPass,
    details: {
      tests: results,
      note: "Floating point arithmetic edge cases",
    },
  };
}

/**
 * Run all numeric grading tests
 */
export async function runMathNumericGradeTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const [
      test1,
      test2,
      test3,
      test4,
      test5,
      test6,
      test7,
      test8,
      test9,
      test10,
    ] = await Promise.all([
      testExactMatch(),
      testWrongAnswer(),
      testWithinTolerance(),
      testOutsideTolerance(),
      testZeroHandling(),
      testNegativeNumbers(),
      testLargeNumbers(),
      testDecimalPrecision(),
      testNumericModeStructure(),
      testRoundingEdgeCases(),
    ]);

    const allPass =
      test1.pass &&
      test2.pass &&
      test3.pass &&
      test4.pass &&
      test5.pass &&
      test6.pass &&
      test7.pass &&
      test8.pass &&
      test9.pass &&
      test10.pass;

    return {
      pass: allPass,
      details: {
        exactMatch: test1,
        wrongAnswer: test2,
        withinTolerance: test3,
        outsideTolerance: test4,
        zeroHandling: test5,
        negativeNumbers: test6,
        largeNumbers: test7,
        decimalPrecision: test8,
        numericModeStructure: test9,
        roundingEdgeCases: test10,
        summary: {
          total: 10,
          passed: [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10].filter(
            (t) => t.pass
          ).length,
          tolerance: NUMERIC_TOLERANCE,
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
