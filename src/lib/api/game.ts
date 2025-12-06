import { callEdgeFunction, shouldUseMockData } from "./common";
import { EDGE_FUNCTIONS } from "../types/api";
import { createLogger } from "../logger";
import type {
  StartSessionRequest,
  StartSessionResponse,
  EndRoundRequest,
  EndRoundResponse,
} from "../types/api";

/**
 * Round attempt data structure (for backward compatibility)
 */
export interface AttemptData {
  itemId: number;
  selectedIndex: number;
  isCorrect: boolean;
  timeSpent: number;
  clusterId?: string;
  variant?: string;
}

/**
 * Round start response (for backward compatibility)
 */
export interface RoundStartResponse {
  roundId: string;
  sessionId: string;
  startedAt: string;
}

/**
 * Round end response (for backward compatibility)
 */
export interface RoundEndResponse {
  roundId: string;
  score: number;
  accuracy: number;
  completedAt: string;
}

/**
 * Extended attempt data with optional end round info
 */
export interface LogAttemptPayload {
  roundId: string;
  itemId: number;
  itemKey: string; // Format: "itemId:clusterId:variant"
  selectedIndex: number;
  isCorrect: boolean;
  latencyMs: number;
  endRound?: {
    baseScore: number;
    mistakes: number;
    elapsedSeconds: number;
    distinctItems: number;
  };
}

/**
 * Log attempt response
 */
export interface LogAttemptResult {
  attemptId: string;
  roundId: string;
  final?: {
    finalScore: number;
    endedAt: string;
  };
}

const log = createLogger("api/game");

/**
 * API: Start a new session
 * @param userId - User identifier
 * @param courseId - Course identifier
 * @returns Session data
 */
export async function startSession(
  userId: string,
  courseId: string
): Promise<StartSessionResponse> {
  if (shouldUseMockData()) {
    log.info("Using mock data for startSession", {
      action: "startSession",
      userId,
      courseId,
    });
    // Mock: generate session data
    return {
      sessionId: `session-${Date.now()}`,
      userId,
      courseId,
      startedAt: new Date().toISOString(),
    };
  }

  log.info("Using Supabase for startSession", {
    action: "startSession",
    userId,
    courseId,
  });
  return callEdgeFunction<StartSessionRequest, StartSessionResponse>(
    EDGE_FUNCTIONS.START_SESSION,
    { userId, courseId }
  );
}

/**
 * API: Start a new round/session (calls game-start-round edge function)
 * @param courseId - Course being played
 * @param level - Level number
 * @param contentVersion - Optional content version
 * @param assignmentId - Optional assignment ID if playing from an assignment
 * @returns Round start data with IDs
 */
export async function startRound(
  courseId: string,
  level: number,
  contentVersion?: string,
  assignmentId?: string
): Promise<RoundStartResponse> {
  if (shouldUseMockData()) {
    log.info("Using mock data for startRound", {
      action: "startRound",
      courseId,
      level,
    });
    // Generate mock round data
    return {
      roundId: `round-${Date.now()}`,
      sessionId: `session-${Date.now()}`,
      startedAt: new Date().toISOString(),
    };
  }

  const payload = { courseId, level, contentVersion, assignmentId };
  log.debug("startRound payload", { action: "startRound", payload });

  const result = await callEdgeFunction<
    {
      courseId: string;
      level: number;
      contentVersion?: string;
      assignmentId?: string;
    },
    { sessionId: string; roundId: string; startedAt: string }
  >("game-start-round", payload);

  log.debug("startRound ok", { action: "startRound", result });

  return {
    roundId: result.roundId,
    sessionId: result.sessionId,
    startedAt: result.startedAt,
  };
}

/**
 * API: Log a single attempt/answer (calls game-log-attempt edge function)
 * Automatically queues attempts when offline
 * @param payload - Attempt data with optional end round info
 * @returns Attempt result with optional final score
 */
export async function logAttemptLive(
  payload: LogAttemptPayload
): Promise<LogAttemptResult> {
  if (shouldUseMockData()) {
    log.info("Using mock data for logAttempt", {
      action: "logAttemptLive",
      payload,
    });
    // Mock: just return success
    return {
      attemptId: `attempt-${Date.now()}`,
      roundId: payload.roundId,
      final: payload.endRound
        ? {
            finalScore: payload.endRound.baseScore,
            endedAt: new Date().toISOString(),
          }
        : undefined,
    };
  }

  // Check if offline
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    log.warn("Offline - enqueueing attempt", {
      action: "logAttemptLive",
      reason: "offline",
    });
    const { enqueue } = await import("../offlineQueue");
    enqueue(payload);

    // Return mock response for offline
    return {
      attemptId: `offline-${Date.now()}`,
      roundId: payload.roundId,
      final: payload.endRound
        ? {
            finalScore: payload.endRound.baseScore,
            endedAt: new Date().toISOString(),
          }
        : undefined,
    };
  }

  log.debug("logAttempt", { action: "logAttemptLive", payload });

  try {
    // Transform payload: if endRound is present, set finalize flag
    const backendPayload = {
      ...payload,
      finalize: !!payload.endRound,
    };

    const result = await callEdgeFunction<
      typeof backendPayload,
      {
        attempt?: { id: string };
        attemptId?: string;
        roundId: string;
        final?: { finalScore?: number; score?: number; endedAt: string };
      }
    >("game-log-attempt", backendPayload);

    log.debug("logAttempt ok", { action: "logAttemptLive", result });

    // Transform new response shape to expected LogAttemptResult
    return {
      attemptId: result.attempt?.id || result.attemptId,
      roundId: result.roundId,
      final: result.final ? {
        finalScore: result.final.finalScore || result.final.score,
        endedAt: result.final.endedAt,
      } : undefined,
    };
  } catch (err) {
    // Check if it's a network error
    const isNetworkError =
      err instanceof TypeError &&
      (err.message.includes("fetch") || err.message.includes("network"));

    if (isNetworkError) {
      log.warn("Network error - enqueueing attempt", {
        action: "logAttemptLive",
        error: err instanceof Error ? err.message : String(err),
      });
      const { enqueue } = await import("../offlineQueue");
      enqueue(payload);

      // Return mock response for network error
      return {
        attemptId: `queued-${Date.now()}`,
        roundId: payload.roundId,
        final: payload.endRound
          ? {
              finalScore: payload.endRound.baseScore,
              endedAt: new Date().toISOString(),
            }
          : undefined,
      };
    }

    // Re-throw non-network errors
    throw err;
  }
}

/**
 * API: Log a single attempt/answer (backward compatible)
 * @param roundId - Current round identifier
 * @param attempt - Attempt data
 * @returns Success status
 */
export async function logAttempt(
  roundId: string,
  attempt: AttemptData
): Promise<{ success: boolean }> {
  // Generate itemKey from provided data or use default
  const itemKey =
    attempt.clusterId && attempt.variant
      ? `${attempt.itemId}:${attempt.clusterId}:${attempt.variant}`
      : `${attempt.itemId}:legacy:1`;

  await logAttemptLive({
    roundId,
    itemId: attempt.itemId,
    itemKey,
    selectedIndex: attempt.selectedIndex,
    isCorrect: attempt.isCorrect,
    latencyMs: attempt.timeSpent,
  });

  return { success: true };
}

/**
 * API: End the current round and save results
 * @param roundId - Round identifier
 * @param score - Final score
 * @param mistakes - Number of mistakes
 * @param elapsedTime - Total time in seconds
 * @returns Round completion data
 */
export async function endRound(
  roundId: string,
  score: number,
  mistakes: number,
  elapsedTime: number
): Promise<RoundEndResponse> {
  if (shouldUseMockData()) {
    log.info("Using mock data for endRound", {
      action: "endRound",
      roundId,
      score,
      mistakes,
      elapsedTime,
    });
    // Mock: return completion data
    const accuracy =
      score + mistakes > 0 ? Math.round((score / (score + mistakes)) * 100) : 0;
    return {
      roundId,
      score,
      accuracy,
      completedAt: new Date().toISOString(),
    };
  }

  log.info("Using Supabase for endRound", {
    action: "endRound",
    roundId,
    score,
    mistakes,
    elapsedTime,
  });
  return callEdgeFunction<EndRoundRequest, EndRoundResponse>(
    EDGE_FUNCTIONS.END_ROUND,
    {
      roundId,
      score,
      mistakes,
      elapsedTime,
    }
  );
}

// ============= Event Logging =============

/**
 * Event batch queue for efficient event logging
 */
interface EventLogEntry {
  sessionId: string;
  idempotencyKey: string;
  eventType: string;
  eventData?: Record<string, unknown>;
}

class EventBatchQueue {
  private queue: EventLogEntry[] = [];
  private flushTimer: number | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private readonly STORAGE_KEY = "event-queue";

  constructor() {
    // Load queued events from localStorage on init
    this.loadFromStorage();

    // Flush on page unload
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.flushSync());
      window.addEventListener("online", () => this.flush());
    }
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        log.debug("Loaded events from storage", {
          action: "eventQueue.loadFromStorage",
          count: this.queue.length,
        });
      }
    } catch (err) {
      log.error(
        "Failed to load from storage",
        err instanceof Error ? err : new Error(String(err)),
        { action: "eventQueue.loadFromStorage" }
      );
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      log.error(
        "Failed to save to storage",
        err instanceof Error ? err : new Error(String(err)),
        { action: "eventQueue.saveToStorage" }
      );
    }
  }

  /**
   * Add event to queue
   */
  enqueue(event: EventLogEntry) {
    this.queue.push(event);
    this.saveToStorage();

    // Auto-flush if batch size reached
    if (this.queue.length >= this.BATCH_SIZE) {
      this.flush();
    } else {
      // Schedule flush
      this.scheduleFlush();
    }
  }

  /**
   * Schedule automatic flush
   */
  private scheduleFlush() {
    if (this.flushTimer) {
      return; // Already scheduled
    }

    this.flushTimer = window.setTimeout(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Flush queued events to backend
   */
  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    // Check if offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      log.debug("Offline, keeping events in queue", {
        action: "eventQueue.flush",
      });
      return;
    }

    const eventsToSend = this.queue.splice(0, this.BATCH_SIZE);
    this.saveToStorage();

    try {
      log.info("Flushing events", {
        action: "eventQueue.flush",
        count: eventsToSend.length,
      });

      const { getAccessToken } = await import("../supabase");
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const token = await getAccessToken();

      if (!supabaseUrl || !token) {
        log.warn("No Supabase URL or token, re-queueing events", {
          action: "eventQueue.flush",
        });
        this.queue.unshift(...eventsToSend);
        this.saveToStorage();
        return;
      }

      const url = `${supabaseUrl}/functions/v1/log-event`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events: eventsToSend }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();
      log.info("Flushed events", {
        action: "eventQueue.flush",
        inserted: result.inserted,
        duplicates: result.duplicates,
      });
    } catch (err) {
      log.error(
        "Failed to flush events, re-queueing",
        err instanceof Error ? err : new Error(String(err)),
        { action: "eventQueue.flush" }
      );
      // Re-queue failed events
      this.queue.unshift(...eventsToSend);
      this.saveToStorage();
    }
  }

  /**
   * Synchronous flush (for beforeunload)
   */
  flushSync() {
    if (this.queue.length === 0) {
      return;
    }

    // Save to storage for next session
    this.saveToStorage();
    log.debug("Saved events for next session", {
      action: "eventQueue.flushSync",
      count: this.queue.length,
    });
  }
}

// Singleton queue instance
const eventQueue = new EventBatchQueue();

/**
 * Log an analytics event
 * @param sessionId - Session UUID
 * @param eventType - Event type identifier
 * @param eventData - Optional event data
 */
export function logEvent(
  sessionId: string,
  eventType: string,
  eventData?: Record<string, unknown>
) {
  if (shouldUseMockData()) {
    log.debug("Mock mode - skipping event log", {
      action: "logEvent",
      sessionId,
      eventType,
      eventData,
    });
    return;
  }

  const idempotencyKey = `${sessionId}-${eventType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  eventQueue.enqueue({
    sessionId,
    idempotencyKey,
    eventType,
    eventData,
  });
}

/**
 * Manually flush event queue
 */
export async function flushEvents() {
  await eventQueue.flush();
}
