/**
 * Game Parity Live Test
 * Validates the core game flow: start-round → log-attempt → end-round
 */

import { supabase } from "@/integrations/supabase/client";

export async function runGameParityLiveTest(): Promise<{ pass: boolean; details?: any }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    return {
      pass: false,
      details: { error: "VITE_SUPABASE_URL not configured" },
    };
  }

  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    return {
      pass: false,
      details: { error: "No active session - authentication required" },
    };
  }

  const details: any = {
    startRound: "not tested",
    logCorrectAttempt: "not tested",
    logWrongAttempt: "not tested",
    endRound: "not tested",
    endRoundIdempotent: "not tested",
  };

  let allPassed = true;
  let roundId: string | null = null;
  let sessionId: string | null = null;

  const authHeaders = {
    "Authorization": `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };

  // Test 1: Start a round
  try {
    const startRoundUrl = `${supabaseUrl}/functions/v1/game-start-round`;
    const startPayload = {
      courseId: "multiplication",
      contentVersion: "2.1.0",
      level: 1,
    };

    const response = await fetch(startRoundUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(startPayload),
    });

    if (response.status === 200) {
      const data = await response.json();
      
      if (data.roundId && data.sessionId) {
        roundId = data.roundId;
        sessionId = data.sessionId;
        details.startRound = `✓ passed (200, roundId: ${roundId.substring(0, 8)}..., sessionId: ${sessionId.substring(0, 8)}...)`;
      } else {
        details.startRound = "✗ failed (missing roundId or sessionId)";
        allPassed = false;
      }
    } else {
      details.startRound = `✗ failed (expected 200, got ${response.status})`;
      allPassed = false;
    }
  } catch (err) {
    details.startRound = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
    allPassed = false;
  }

  // Test 2: Log a correct attempt
  if (roundId) {
    try {
      const logAttemptUrl = `${supabaseUrl}/functions/v1/game-log-attempt`;
      const correctPayload = {
        roundId,
        itemId: 0,
        itemKey: "0:mult_2x3:1",
        selectedIndex: 0,
        isCorrect: true,
        latencyMs: 1500,
      };

      const response = await fetch(logAttemptUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(correctPayload),
      });

      if (response.status === 200) {
        const data = await response.json();
        
        if (data.attempt?.id && data.roundId) {
          details.logCorrectAttempt = "✓ passed (200, attempt recorded)";
        } else {
          details.logCorrectAttempt = "⚠ passed (200, but unexpected response shape)";
        }
      } else {
        details.logCorrectAttempt = `✗ failed (expected 200, got ${response.status})`;
        allPassed = false;
      }
    } catch (err) {
      details.logCorrectAttempt = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
      allPassed = false;
    }
  } else {
    details.logCorrectAttempt = "⚠ skipped (no roundId from start-round)";
  }

  // Test 3: Log a wrong attempt with finalize=true
  if (roundId) {
    try {
      const logAttemptUrl = `${supabaseUrl}/functions/v1/game-log-attempt`;
      const wrongPayload = {
        roundId,
        itemId: 1,
        itemKey: "1:mult_3x4:2",
        selectedIndex: 2,
        isCorrect: false,
        latencyMs: 2500,
        finalize: true, // Request finalization
      };

      const response = await fetch(logAttemptUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(wrongPayload),
      });

      if (response.status === 200) {
        const data = await response.json();
        
        if (data.attempt?.id && data.roundId && data.final?.finalScore !== undefined && data.final?.endedAt) {
          details.logWrongAttempt = `✓ passed (200, finalized with score ${data.final.finalScore})`;
        } else {
          details.logWrongAttempt = {
            status: "✗ failed",
            error: "Missing final score data in finalize response",
            response: data,
            expectedFields: ["attempt.id", "final.finalScore", "final.endedAt"],
          };
          allPassed = false;
        }
      } else {
        details.logWrongAttempt = `✗ failed (expected 200, got ${response.status})`;
        allPassed = false;
      }
    } catch (err) {
      details.logWrongAttempt = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
      allPassed = false;
    }
  } else {
    details.logWrongAttempt = "⚠ skipped (no roundId from start-round)";
  }

  // Test 4: End the round
  if (roundId) {
    try {
      const endRoundUrl = `${supabaseUrl}/functions/v1/game-end-round`;
      const endPayload = {
        roundId,
      };

      const response = await fetch(endRoundUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(endPayload),
      });

      if (response.status === 200) {
        const data = await response.json();
        
        if (data.roundId && data.final?.finalScore !== undefined && data.final?.endedAt) {
          details.endRound = "✓ passed (200, round ended)";
        } else {
          details.endRound = "⚠ passed (200, but unexpected response shape)";
        }
      } else {
        details.endRound = `✗ failed (expected 200, got ${response.status})`;
        allPassed = false;
      }
    } catch (err) {
      details.endRound = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
      allPassed = false;
    }
  } else {
    details.endRound = "⚠ skipped (no roundId from start-round)";
  }

  // Test 5: End the round again (idempotent test)
  if (roundId) {
    try {
      const endRoundUrl = `${supabaseUrl}/functions/v1/game-end-round`;
      const endPayload = {
        roundId,
      };

      const response = await fetch(endRoundUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(endPayload),
      });

      if (response.status === 200) {
        details.endRoundIdempotent = "✓ passed (200, idempotent - safe to call multiple times)";
      } else if (response.status === 400) {
        const errorBody = await response.json();
        details.endRoundIdempotent = `⚠ warning (400 - ${errorBody.error?.message})`;
      } else {
        details.endRoundIdempotent = `⚠ unexpected status (${response.status})`;
      }
    } catch (err) {
      details.endRoundIdempotent = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
      allPassed = false;
    }
  } else {
    details.endRoundIdempotent = "⚠ skipped (no roundId from start-round)";
  }

  return {
    pass: allPassed,
    details,
  };
}
