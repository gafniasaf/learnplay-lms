/**
 * Unified Error Shape + CORS Test
 * Verifies that all functions return standardized error responses
 * with proper CORS headers and validate before authentication
 */

export async function runFunctionsErrorCorsTest(): Promise<{ pass: boolean; details?: any }> {
  const testFunctions = [
    'add-class-member',
    'apply-course-patch',
    'assign-assignees',
    'author-course',
    'create-assignment',
    'create-child-code',
    'create-class',
    'debug-catalog',
    'debug-storage',
    'export-analytics',
    'export-gradebook',
    'game-end-round',
    'game-log-attempt',
    'game-start-round',
    'generate-class-code',
    'generate-course',
    'get-analytics',
    'get-assignment-progress',
    'get-class-progress',
    'get-class-roster',
    'get-course',
    'get-dashboard',
    'invite-student',
    'join-class',
    'link-child',
    'list-assignments-student',
    'list-assignments',
    'list-classes',
    'list-conversations',
    'list-courses',
    'list-messages',
    'list-org-students',
    'list-students-for-course',
    'log-event',
    'remove-class-member',
    'review-course',
    'send-message',
    'update-catalog',
  ];

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    return {
      pass: false,
      details: { error: "VITE_SUPABASE_URL not configured" },
    };
  }

  const results: Record<string, any> = {};
  let allPassed = true;

  for (const functionName of testFunctions) {
    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    const functionResults: any = {
      errorShape: "not tested",
      cors: "not tested",
      contentType: "not tested",
      validationBeforeAuth: "not tested",
    };

    try {
      // POST with invalid body to trigger validation error
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: "payload" }),
      });

      // Check 1: Should return 400 (validation error, not 401 auth error)
      if (response.status === 400) {
        functionResults.validationBeforeAuth = "✓ passed (400, validates before auth)";
      } else if (response.status === 401) {
        functionResults.validationBeforeAuth = "✗ failed (401 - auth checked before validation)";
        allPassed = false;
      } else {
        functionResults.validationBeforeAuth = `⚠ unexpected status (${response.status})`;
      }

      // Check 2: Error shape validation
      try {
        const errorBody = await response.json();

        // Check for standardized error shape: {error:{code,message}, requestId}
        const hasError = errorBody.error && typeof errorBody.error === 'object';
        const hasCode = hasError && typeof errorBody.error.code === 'string';
        const hasMessage = hasError && typeof errorBody.error.message === 'string';
        const hasRequestId = typeof errorBody.requestId === 'string';

        if (hasError && hasCode && hasMessage && hasRequestId) {
          functionResults.errorShape = `✓ passed (code: ${errorBody.error.code})`;
        } else {
          const missing: string[] = [];
          if (!hasError) missing.push("error object");
          if (!hasCode) missing.push("error.code");
          if (!hasMessage) missing.push("error.message");
          if (!hasRequestId) missing.push("requestId");

          functionResults.errorShape = `✗ failed (missing: ${missing.join(", ")})`;
          functionResults.errorBody = errorBody;
          allPassed = false;
        }
      } catch (_parseError) {
        functionResults.errorShape = "✗ failed (invalid JSON response)";
        allPassed = false;
      }

      // Check 3: CORS headers
      const corsHeader = response.headers.get("Access-Control-Allow-Origin");
      if (corsHeader) {
        functionResults.cors = `✓ passed (${corsHeader})`;
      } else {
        functionResults.cors = "✗ failed (missing Access-Control-Allow-Origin)";
        allPassed = false;
      }

      // Check 4: Content-Type header
      const contentType = response.headers.get("Content-Type");
      if (contentType && contentType.includes("application/json")) {
        functionResults.contentType = `✓ passed (${contentType})`;
      } else {
        functionResults.contentType = `⚠ unexpected (${contentType || "missing"})`;
      }

      results[functionName] = functionResults;
    } catch (err) {
      results[functionName] = {
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
      allPassed = false;
    }
  }

  return {
    pass: allPassed,
    details: {
      summary: `Tested ${testFunctions.length} functions for error shape and CORS`,
      results,
    },
  };
}
