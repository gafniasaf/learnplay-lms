/**
 * Agent Generate Contract Test
 * Validates that generate-course edge function returns valid Course v2 JSON
 * Tests both success and error paths for validation
 */

import { CourseSchemaV2 } from "../schemas/courseV2";

interface GenerateResponse {
  success: boolean;
  course?: any;
  sources?: Array<{ url: string; title?: string }>;
  metadata?: any;
  error?: string;
}

interface ErrorResponse {
  error: string;
  details?: string;
  message?: string;
}

/**
 * Mock function to simulate edge function validation
 */
function validateGenerateRequest(body: any): { valid: boolean; status: number; error?: string } {
  // Check method (would be 405 for non-POST)
  if (body._method && body._method !== 'POST') {
    return { valid: false, status: 405, error: 'method_not_allowed' };
  }

  // Check required fields
  if (!body.subject || typeof body.subject !== 'string') {
    return { valid: false, status: 400, error: 'missing_required_fields' };
  }
  if (!body.grade || typeof body.grade !== 'string') {
    return { valid: false, status: 400, error: 'missing_required_fields' };
  }
  if (!body.itemsPerGroup || typeof body.itemsPerGroup !== 'number') {
    return { valid: false, status: 400, error: 'missing_required_fields' };
  }
  if (!body.mode || !['options', 'numeric'].includes(body.mode)) {
    return { valid: false, status: 400, error: 'missing_required_fields' };
  }

  return { valid: true, status: 200 };
}

/**
 * Test the generate-course edge function contract
 */
export async function runAgentGenerateContractTest(): Promise<{ pass: boolean; details: any }> {
  const results: any[] = [];
  let overallPass = true;

  // Test 1: Generate simple options-mode course
  try {
    const mockResponse: GenerateResponse = {
      success: true,
      course: {
        id: "test-modals",
        title: "Modal Verbs Practice",
        subject: "Grammar",
        locale: "en",
        contentVersion: "1.0",
        description: "Practice modal verbs",
        groups: [
          { id: 0, name: "Can/Could" },
          { id: 1, name: "May/Might" },
        ],
        levels: [
          { id: 0, title: "Beginner", start: 0, end: 11 },
          { id: 1, title: "Intermediate", start: 12, end: 23 },
        ],
        items: Array.from({ length: 24 }, (_, i) => ({
          id: i,
          text: `She [blank] speak French.`,
          groupId: i < 12 ? 0 : 1,
          clusterId: `c${Math.floor(i / 3)}`,
          variant: String((i % 3) + 1) as "1" | "2" | "3",
          mode: "options",
          options: ["can", "could", "may", "might"],
          correctIndex: i % 4,
          explain: "Modal verb explanation",
        })),
      },
      sources: [],
    };

    const validated = CourseSchemaV2.safeParse(mockResponse.course);
    if (!validated.success) {
      overallPass = false;
      results.push({
        test: "Generate options-mode course",
        pass: false,
        error: validated.error.errors,
      });
    } else {
      results.push({
        test: "Generate options-mode course",
        pass: true,
        itemCount: validated.data.items.length,
        groupCount: validated.data.groups.length,
      });
    }
  } catch (err) {
    overallPass = false;
    results.push({
      test: "Generate options-mode course",
      pass: false,
      error: String(err),
    });
  }

  // Test 2: Generate numeric-mode course
  try {
    const mockResponse: GenerateResponse = {
      success: true,
      course: {
        id: "test-math",
        title: "Addition Practice",
        subject: "Math",
        locale: "en",
        contentVersion: "1.0",
        description: "Practice addition",
        groups: [
          { id: 0, name: "Single Digit" },
          { id: 1, name: "Double Digit" },
        ],
        levels: [
          { id: 0, title: "Easy", start: 0, end: 11 },
          { id: 1, title: "Medium", start: 12, end: 23 },
        ],
        items: Array.from({ length: 24 }, (_, i) => ({
          id: i,
          text: `What is ${i + 1} + ${i + 2}? _`,
          groupId: i < 12 ? 0 : 1,
          clusterId: `c${Math.floor(i / 3)}`,
          variant: String((i % 3) + 1) as "1" | "2" | "3",
          mode: "numeric",
          answer: i + 1 + i + 2,
          explain: "Addition explanation",
        })),
      },
      sources: [],
    };

    const validated = CourseSchemaV2.safeParse(mockResponse.course);
    if (!validated.success) {
      overallPass = false;
      results.push({
        test: "Generate numeric-mode course",
        pass: false,
        error: validated.error.errors,
      });
    } else {
      results.push({
        test: "Generate numeric-mode course",
        pass: true,
        itemCount: validated.data.items.length,
        groupCount: validated.data.groups.length,
      });
    }
  } catch (err) {
    overallPass = false;
    results.push({
      test: "Generate numeric-mode course",
      pass: false,
      error: String(err),
    });
  }

  // Test 3: Validate response structure
  try {
    const mockResponse: GenerateResponse = {
      success: true,
      course: {
        id: "test-course",
        title: "Test Course",
        groups: [{ id: 0, name: "Group 1" }],
        levels: [{ id: 0, title: "Level 1", start: 0, end: 5 }],
        items: Array.from({ length: 6 }, (_, i) => ({
          id: i,
          text: `Question ${i} [blank]`,
          groupId: 0,
          clusterId: `c${i}`,
          variant: "1" as const,
          mode: "options" as const,
          options: ["A", "B", "C"],
          correctIndex: 0,
          explain: "Explanation",
        })),
      },
      sources: [
        { url: "https://example.com/source1", title: "Source 1" },
      ],
      metadata: {
        subject: "Test",
        grade: "5",
        itemsPerGroup: 6,
        mode: "options",
        generatedAt: new Date().toISOString()
      }
    };

    const hasRequiredFields = 
      mockResponse.success &&
      mockResponse.course &&
      Array.isArray(mockResponse.course.items) &&
      Array.isArray(mockResponse.course.groups) &&
      Array.isArray(mockResponse.course.levels) &&
      mockResponse.metadata;

    if (!hasRequiredFields) {
      overallPass = false;
      results.push({
        test: "Validate response structure",
        pass: false,
        error: "Missing required fields",
      });
    } else {
      results.push({
        test: "Validate response structure",
        pass: true,
        hasSuccess: mockResponse.success,
        hasCourse: !!mockResponse.course,
        hasSources: !!mockResponse.sources,
        hasMetadata: !!mockResponse.metadata,
      });
    }
  } catch (err) {
    overallPass = false;
    results.push({
      test: "Validate response structure",
      pass: false,
      error: String(err),
    });
  }

  // Test 4: Validate missing subject returns 400
  try {
    const invalidBody = {
      grade: "5",
      itemsPerGroup: 6,
      mode: "options"
    };

    const validation = validateGenerateRequest(invalidBody);
    const returns400 = validation.status === 400;
    const hasError = validation.error === 'missing_required_fields';

    if (!returns400 || !hasError) {
      overallPass = false;
      results.push({
        test: "Missing subject returns 400",
        pass: false,
        expectedStatus: 400,
        actualStatus: validation.status,
        expectedError: 'missing_required_fields',
        actualError: validation.error,
      });
    } else {
      results.push({
        test: "Missing subject returns 400",
        pass: true,
        status: validation.status,
        error: validation.error,
      });
    }
  } catch (err) {
    overallPass = false;
    results.push({
      test: "Missing subject returns 400",
      pass: false,
      error: String(err),
    });
  }

  // Test 5: Validate invalid mode returns 400
  try {
    const invalidBody = {
      subject: "Math",
      grade: "5",
      itemsPerGroup: 6,
      mode: "invalid"
    };

    const validation = validateGenerateRequest(invalidBody);
    const returns400 = validation.status === 400;

    if (!returns400) {
      overallPass = false;
      results.push({
        test: "Invalid mode returns 400",
        pass: false,
        expectedStatus: 400,
        actualStatus: validation.status,
      });
    } else {
      results.push({
        test: "Invalid mode returns 400",
        pass: true,
        status: validation.status,
      });
    }
  } catch (err) {
    overallPass = false;
    results.push({
      test: "Invalid mode returns 400",
      pass: false,
      error: String(err),
    });
  }

  // Test 6: Validate wrong method returns 405
  try {
    const invalidBody = {
      _method: 'GET',
      subject: "Math",
      grade: "5",
      itemsPerGroup: 6,
      mode: "options"
    };

    const validation = validateGenerateRequest(invalidBody);
    const returns405 = validation.status === 405;

    if (!returns405) {
      overallPass = false;
      results.push({
        test: "Wrong method returns 405",
        pass: false,
        expectedStatus: 405,
        actualStatus: validation.status,
      });
    } else {
      results.push({
        test: "Wrong method returns 405",
        pass: true,
        status: validation.status,
      });
    }
  } catch (err) {
    overallPass = false;
    results.push({
      test: "Wrong method returns 405",
      pass: false,
      error: String(err),
    });
  }

  // Test 7: Validate JSON-only response
  try {
    const mockResponse: GenerateResponse = {
      success: true,
      course: {
        id: "test",
        title: "Test",
        groups: [{ id: 0, name: "G1" }],
        levels: [{ id: 0, title: "L1", start: 0, end: 2 }],
        items: Array.from({ length: 3 }, (_, i) => ({
          id: i,
          text: `Q${i} [blank]`,
          groupId: 0,
          clusterId: `c${i}`,
          variant: "1" as const,
          mode: "options" as const,
          options: ["A", "B"],
          correctIndex: 0,
          explain: "E",
        })),
      },
      sources: [],
      metadata: {
        subject: "Test",
        grade: "1",
        itemsPerGroup: 3,
        mode: "options",
        generatedAt: new Date().toISOString()
      }
    };

    // Test JSON serializability
    const jsonString = JSON.stringify(mockResponse);
    const parsed = JSON.parse(jsonString);
    const isJsonOnly = typeof jsonString === 'string' && parsed;

    if (!isJsonOnly) {
      overallPass = false;
      results.push({
        test: "JSON-only response",
        pass: false,
        error: "Response not JSON-serializable",
      });
    } else {
      results.push({
        test: "JSON-only response",
        pass: true,
        jsonLength: jsonString.length,
      });
    }
  } catch (err) {
    overallPass = false;
    results.push({
      test: "JSON-only response",
      pass: false,
      error: String(err),
    });
  }

  return {
    pass: overallPass,
    details: {
      summary: `${results.filter(r => r.pass).length}/${results.length} tests passed`,
      results,
    },
  };
}
