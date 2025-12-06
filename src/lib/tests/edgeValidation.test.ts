/**
 * Edge Function Validation Test
 * Verifies that edge functions properly validate and reject invalid inputs
 * BEFORE authentication checks, returning 400 (not 401) for bad payloads
 */

export async function runEdgeValidationTest(): Promise<{ pass: boolean; details?: any }> {
  const details: any = {
    logAttemptTest: "not run",
    startRoundTest: "not run",
    getCourseTest: "not run",
  };

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (!supabaseUrl) {
      return {
        pass: false,
        details: { ...details, error: "VITE_SUPABASE_URL not configured" },
      };
    }

    // Test 1: game-log-attempt with invalid payload
    try {
      const logAttemptUrl = `${supabaseUrl}/functions/v1/game-log-attempt`;
      const response = await fetch(logAttemptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: "payload" }),
      });

      if (response.status === 400) {
        const errorBody = await response.json();
        details.logAttemptTest = "passed";
        details.logAttemptError = errorBody.error || errorBody.message;
      } else {
        details.logAttemptTest = `failed - expected 400, got ${response.status}`;
        return { pass: false, details };
      }
    } catch (err) {
      details.logAttemptTest = `error: ${err instanceof Error ? err.message : String(err)}`;
      return { pass: false, details };
    }

    // Test 2: game-start-round with invalid payload (should return 400 before auth)
    try {
      const startRoundUrl = `${supabaseUrl}/functions/v1/game-start-round`;
      const response = await fetch(startRoundUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: "data", level: "not a number" }),
      });

      if (response.status === 400) {
        const errorBody = await response.json();
        details.startRoundTest = "passed";
        details.startRoundError = errorBody.error || errorBody.message;
      } else {
        details.startRoundTest = `failed - expected 400, got ${response.status}`;
        return { pass: false, details };
      }
    } catch (err) {
      details.startRoundTest = `error: ${err instanceof Error ? err.message : String(err)}`;
      return { pass: false, details };
    }

    // Test 3: get-course with invalid courseId
    try {
      const getCourseUrl = `${supabaseUrl}/functions/v1/get-course?courseId=invalid<>course`;
      const response = await fetch(getCourseUrl, {
        method: "GET",
      });

      if (response.status === 400) {
        const errorBody = await response.json();
        details.getCourseTest = "passed";
        details.getCourseError = errorBody.error || errorBody.message;
      } else {
        details.getCourseTest = `failed - expected 400, got ${response.status}`;
        return { pass: false, details };
      }
    } catch (err) {
      details.getCourseTest = `error: ${err instanceof Error ? err.message : String(err)}`;
      return { pass: false, details };
    }

    return {
      pass: true,
      details,
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        ...details,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
