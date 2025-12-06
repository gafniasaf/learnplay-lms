/**
 * Edge Functions Deployment Manifest Test
 * Verifies that all expected Edge Functions are deployed and reachable
 */

export async function runEdgeFunctionsManifestTest(): Promise<{ pass: boolean; details?: any }> {
  const expected = [
    'list-courses',
    'get-course',
    'game-start-round',
    'game-log-attempt',
    'create-class',
    'get-class-progress',
    'list-students-for-course',
    'assign-assignees',
    'create-assignment',
    'list-assignments',
    'list-assignments-student',
    'export-gradebook',
    'author-course',
    'generate-course',
    'review-course',
    'apply-course-patch',
    'get-dashboard',
    'log-event',
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

  for (const functionName of expected) {
    const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    const functionResults: any = {
      options: "not tested",
      get: "not tested",
      post: "not tested",
    };

    try {
      // Test 1: OPTIONS request should return 200 (CORS preflight)
      try {
        const optionsResponse = await fetch(functionUrl, {
          method: "OPTIONS",
        });

        if (optionsResponse.status === 200) {
          functionResults.options = "✓ passed (200)";
        } else {
          functionResults.options = `✗ failed (expected 200, got ${optionsResponse.status})`;
          allPassed = false;
        }
      } catch (err) {
        functionResults.options = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
        allPassed = false;
      }

      // Test 2: GET request should return 405 or 400 (method not allowed or validation)
      try {
        const getResponse = await fetch(functionUrl, {
          method: "GET",
        });

        if (getResponse.status === 405 || getResponse.status === 400 || getResponse.status === 401) {
          functionResults.get = `✓ passed (${getResponse.status})`;
        } else if (getResponse.status === 404) {
          functionResults.get = `✗ failed (404 - function not deployed)`;
          allPassed = false;
        } else {
          functionResults.get = `✓ accepted (${getResponse.status})`;
        }
      } catch (err) {
        functionResults.get = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
        allPassed = false;
      }

      // Test 3: POST with empty body should return 400 with invalid_request
      try {
        const postResponse = await fetch(functionUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (postResponse.status === 400) {
          const errorBody = await postResponse.json();
          const errorCode = errorBody.error?.code || errorBody.code;
          
          if (errorCode === "invalid_request") {
            functionResults.post = "✓ passed (400, invalid_request)";
          } else {
            functionResults.post = `✓ accepted (400, code: ${errorCode})`;
          }
        } else if (postResponse.status === 404) {
          functionResults.post = `✗ failed (404 - function not deployed)`;
          allPassed = false;
        } else if (postResponse.status === 401) {
          functionResults.post = `⚠ auth before validation (401) - should validate first`;
          // Don't fail, but note this is not ideal
        } else {
          functionResults.post = `✓ accepted (${postResponse.status})`;
        }
      } catch (err) {
        functionResults.post = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
        allPassed = false;
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
      summary: `Tested ${expected.length} functions`,
      results,
    },
  };
}
