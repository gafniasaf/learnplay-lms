/**
 * Edge Function Smoke Tests
 * Tests game edge functions and event logging in LIVE mode only
 */

import { getApiMode, startRound, logAttemptLive, logEvent, flushEvents } from "@/lib/api";
import type { LogAttemptPayload } from "@/lib/api";

/**
 * Run edge function smoke tests
 * Only executes in LIVE mode, skips in MOCK mode
 */
export async function runEdgeSmokeTests(): Promise<{
  pass: boolean;
  details: any;
}> {
  const mode = getApiMode();

  // Skip in mock mode
  if (mode === "mock") {
    return {
      pass: true,
      details: {
        mode,
        status: "skipped",
        reason: "Edge smoke tests only run in LIVE mode",
      },
    };
  }

  try {
    // Test 1: Start round
    console.log("[EdgeSmoke] Starting round...");
    const startResult = await startRound("modals", 1, "1.0.0");

    const hasRoundId = !!startResult.roundId;
    const hasSessionId = !!startResult.sessionId;
    const hasStartedAt = !!startResult.startedAt;

    if (!hasRoundId || !hasSessionId || !hasStartedAt) {
      return {
        pass: false,
        details: {
          mode,
          step: "start-round",
          error: "Missing required fields in response",
          response: startResult,
          expectedFields: ["roundId", "sessionId", "startedAt"],
          receivedFields: Object.keys(startResult),
        },
      };
    }

    // Test 2: Log first attempt (no end)
    console.log("[EdgeSmoke] Logging first attempt...");
    const attempt1Payload: LogAttemptPayload = {
      roundId: startResult.roundId,
      itemId: 1,
      itemKey: '1:test:1',
      selectedIndex: 0,
      isCorrect: true,
      latencyMs: 1500,
    };

    const attempt1Result = await logAttemptLive(attempt1Payload);

    const hasAttemptId1 = !!attempt1Result.attemptId;
    const hasRoundIdMatch1 = attempt1Result.roundId === startResult.roundId;

    if (!hasAttemptId1 || !hasRoundIdMatch1) {
      return {
        pass: false,
        details: {
          mode,
          step: "log-attempt-1",
          error: "Invalid response for first attempt",
          response: attempt1Result,
          expectedRoundId: startResult.roundId,
          receivedRoundId: attempt1Result.roundId,
        },
      };
    }

    // Test 3: Log second attempt with endRound
    console.log("[EdgeSmoke] Logging second attempt with endRound...");
    const attempt2Payload: LogAttemptPayload = {
      roundId: startResult.roundId,
      itemId: 2,
      itemKey: '2:test:2',
      selectedIndex: 1,
      isCorrect: true,
      latencyMs: 2000,
      endRound: {
        baseScore: 2,
        mistakes: 0,
        elapsedSeconds: 15,
        distinctItems: 2,
      },
    };

    const attempt2Result = await logAttemptLive(attempt2Payload);

    const hasAttemptId2 = !!attempt2Result.attemptId;
    const hasRoundIdMatch2 = attempt2Result.roundId === startResult.roundId;
    const hasFinalScore = !!attempt2Result.final?.finalScore;
    const hasEndedAt = !!attempt2Result.final?.endedAt;

    if (!hasAttemptId2 || !hasRoundIdMatch2) {
      return {
        pass: false,
        details: {
          mode,
          step: "log-attempt-2",
          error: "Invalid response for second attempt",
          response: attempt2Result,
        },
      };
    }

    if (!hasFinalScore || !hasEndedAt) {
      return {
        pass: false,
        details: {
          mode,
          step: "log-attempt-2-final",
          error: "Missing final score data in endRound response",
          response: attempt2Result,
          expectedFields: ["final.finalScore", "final.endedAt"],
        },
      };
    }

    // All tests passed
    return {
      pass: true,
      details: {
        mode,
        status: "success",
        steps: {
          startRound: {
            roundId: startResult.roundId,
            sessionId: startResult.sessionId,
            startedAt: startResult.startedAt,
          },
          logAttempt1: {
            attemptId: attempt1Result.attemptId,
            roundId: attempt1Result.roundId,
            hasFinal: !!attempt1Result.final,
          },
          logAttempt2: {
            attemptId: attempt2Result.attemptId,
            roundId: attempt2Result.roundId,
            finalScore: attempt2Result.final?.finalScore,
            endedAt: attempt2Result.final?.endedAt,
          },
        },
        summary: {
          totalCalls: 3,
          allResponsesValid: true,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        mode,
        error: `Edge function call failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        errorDetails: error instanceof Error ? error.stack : undefined,
      },
    };
  }
}

/**
 * Run event logging smoke test
 */
export async function runEventLoggingTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  const mode = getApiMode();

  // Skip in mock mode
  if (mode === "mock") {
    return {
      pass: true,
      details: {
        mode,
        status: "skipped",
        reason: "Event logging tests only run in LIVE mode",
      },
    };
  }

  try {
    const sessionId = crypto.randomUUID();
    const timestamp = Date.now();

    // Log a few test events
    logEvent(sessionId, "test_event_1", { timestamp, test: true });
    logEvent(sessionId, "test_event_2", { timestamp: timestamp + 1, test: true });
    logEvent(sessionId, "test_event_3", { timestamp: timestamp + 2, test: true });

    // Manually flush
    await flushEvents();

    return {
      pass: true,
      details: {
        mode,
        status: "success",
        sessionId,
        eventsLogged: 3,
        message: "Events queued and flushed successfully",
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        mode,
        error: `Event logging failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
}
