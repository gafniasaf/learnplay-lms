/**
 * Course v2 Schema Unit Tests
 * Tests valid and invalid course structures against the Zod schema
 */

import { CourseSchemaV2 } from "@/lib/schemas/courseV2";

export async function runCourseSchemaV2Test(): Promise<{
  pass: boolean;
  details: any;
}> {
  const results: { name: string; pass: boolean; error?: string }[] = [];

  // Valid course sample
  const validCourse = {
    id: "test-course",
    title: "Test Course",
    subject: "Testing",
    contentVersion: "1",
    groups: [
      { id: 1, name: "Group A" },
      { id: 2, name: "Group B" },
    ],
    levels: [
      { id: 1, title: "Level 1", start: 0, end: 4 },
      { id: 2, title: "Level 2", start: 5, end: 9 },
    ],
    items: [
      {
        id: 1,
        text: "The cat _ on the mat.",
        groupId: 1,
        clusterId: "verb-sit",
        variant: "1",
        mode: "options",
        options: ["sits", "sit", "sitting"],
        correctIndex: 0,
        explain: "Use 'sits' for third person singular.",
      },
      {
        id: 2,
        text: "2 + 2 = _",
        groupId: 2,
        clusterId: "addition",
        variant: "1",
        mode: "numeric",
        answer: 4,
        hint: "Add the numbers",
      },
    ],
  };

  // Test 1: Valid course passes
  try {
    const result = CourseSchemaV2.safeParse(validCourse);
    if (result.success) {
      results.push({ name: "valid-course-passes", pass: true });
    } else {
      results.push({
        name: "valid-course-passes",
        pass: false,
        error: JSON.stringify(result.error.issues),
      });
    }
  } catch (err) {
    results.push({
      name: "valid-course-passes",
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 2: Missing placeholder fails
  const noPlaceholder = {
    ...validCourse,
    items: [
      {
        ...validCourse.items[0],
        text: "No placeholder here",
      },
    ],
  };

  try {
    const result = CourseSchemaV2.safeParse(noPlaceholder);
    if (!result.success) {
      const hasPlaceholderError = result.error.issues.some(
        (issue) => issue.message.includes("placeholder")
      );
      results.push({
        name: "missing-placeholder-fails",
        pass: hasPlaceholderError,
        error: hasPlaceholderError ? undefined : "Expected placeholder error",
      });
    } else {
      results.push({
        name: "missing-placeholder-fails",
        pass: false,
        error: "Should have failed validation",
      });
    }
  } catch (err) {
    results.push({
      name: "missing-placeholder-fails",
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 3: Options mode without options fails
  const optionsModeNoOptions = {
    ...validCourse,
    items: [
      {
        id: 1,
        text: "The cat _ on the mat.",
        groupId: 1,
        clusterId: "verb-sit",
        variant: "1",
        mode: "options",
        correctIndex: 0,
      },
    ],
  };

  try {
    const result = CourseSchemaV2.safeParse(optionsModeNoOptions);
    if (!result.success) {
      const hasModeError = result.error.issues.some(
        (issue) => issue.message.includes("options-mode requires")
      );
      results.push({
        name: "options-mode-without-options-fails",
        pass: hasModeError,
        error: hasModeError ? undefined : "Expected mode validation error",
      });
    } else {
      results.push({
        name: "options-mode-without-options-fails",
        pass: false,
        error: "Should have failed validation",
      });
    }
  } catch (err) {
    results.push({
      name: "options-mode-without-options-fails",
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 4: Numeric mode with options fails
  const numericModeWithOptions = {
    ...validCourse,
    items: [
      {
        id: 2,
        text: "2 + 2 = _",
        groupId: 2,
        clusterId: "addition",
        variant: "1",
        mode: "numeric",
        options: ["3", "4", "5"],
        answer: 4,
      },
    ],
  };

  try {
    const result = CourseSchemaV2.safeParse(numericModeWithOptions);
    if (!result.success) {
      const hasModeError = result.error.issues.some(
        (issue) => issue.message.includes("numeric-mode") && issue.message.includes("no options")
      );
      results.push({
        name: "numeric-mode-with-options-fails",
        pass: hasModeError,
        error: hasModeError ? undefined : "Expected mode validation error",
      });
    } else {
      results.push({
        name: "numeric-mode-with-options-fails",
        pass: false,
        error: "Should have failed validation",
      });
    }
  } catch (err) {
    results.push({
      name: "numeric-mode-with-options-fails",
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 5: Too few options fails
  const tooFewOptions = {
    ...validCourse,
    items: [
      {
        id: 1,
        text: "The cat _ on the mat.",
        groupId: 1,
        clusterId: "verb-sit",
        variant: "1",
        mode: "options",
        options: ["sits", "sit"],
        correctIndex: 0,
      },
    ],
  };

  try {
    const result = CourseSchemaV2.safeParse(tooFewOptions);
    if (!result.success) {
      const hasModeError = result.error.issues.some(
        (issue) => issue.message.includes("options-mode requires options (3-4 items)")
      );
      results.push({
        name: "too-few-options-fails",
        pass: hasModeError,
        error: hasModeError ? undefined : "Expected options count error",
      });
    } else {
      results.push({
        name: "too-few-options-fails",
        pass: false,
        error: "Should have failed validation",
      });
    }
  } catch (err) {
    results.push({
      name: "too-few-options-fails",
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 6: Invalid correctIndex fails
  const invalidCorrectIndex = {
    ...validCourse,
    items: [
      {
        id: 1,
        text: "The cat _ on the mat.",
        groupId: 1,
        clusterId: "verb-sit",
        variant: "1",
        mode: "options",
        options: ["sits", "sit", "sitting"],
        correctIndex: 5,
      },
    ],
  };

  try {
    const result = CourseSchemaV2.safeParse(invalidCorrectIndex);
    if (!result.success) {
      const hasModeError = result.error.issues.some(
        (issue) => issue.message.includes("correctIndex")
      );
      results.push({
        name: "invalid-correct-index-fails",
        pass: hasModeError,
        error: hasModeError ? undefined : "Expected correctIndex error",
      });
    } else {
      results.push({
        name: "invalid-correct-index-fails",
        pass: false,
        error: "Should have failed validation",
      });
    }
  } catch (err) {
    results.push({
      name: "invalid-correct-index-fails",
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const allPassed = results.every((r) => r.pass);

  return {
    pass: allPassed,
    details: {
      total: results.length,
      passed: results.filter((r) => r.pass).length,
      failed: results.filter((r) => !r.pass).length,
      results,
    },
  };
}
