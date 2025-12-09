/**
 * Offline Queue for Game Attempts
 * Stores attempts in localStorage when offline and flushes when back online
 * Per IgniteZero: MCP-First, resilient queue with idempotency
 */

const QUEUE_KEY = "offline-attempts-queue";
export const MAX_RETRIES = 5;
export const BASE_DELAY = 1000; // 1 second

interface QueuedAttempt {
  id: string;
  roundId: string;
  itemId: number;
  isCorrect: boolean;
  latencyMs: number;
  finalize: boolean;
  selectedIndex?: number;
  itemKey?: string;
  idempotencyKey: string;
  timestamp: number;
  retries: number;
}

/**
 * Get queued attempts from localStorage
 */
function getQueue(): QueuedAttempt[] {
  if (typeof window === "undefined") return [];
  
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error("[OfflineQueue] Failed to read queue:", err);
    return [];
  }
}

/**
 * Save queue to localStorage
 */
function saveQueue(queue: QueuedAttempt[]): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("[OfflineQueue] Failed to save queue:", err);
  }
}

/**
 * Add an attempt to the offline queue
 */
export function enqueueAttempt(params: {
  roundId: string;
  itemId: number;
  isCorrect: boolean;
  latencyMs: number;
  finalize?: boolean;
  selectedIndex?: number;
  itemKey?: string;
}): void {
  const queue = getQueue();
  const idempotencyKey = `${params.roundId}-${params.itemId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  const attempt: QueuedAttempt = {
    id: `attempt-${Date.now()}-${Math.random()}`,
    roundId: params.roundId,
    itemId: params.itemId,
    isCorrect: params.isCorrect,
    latencyMs: params.latencyMs,
    finalize: params.finalize || false,
    selectedIndex: params.selectedIndex,
    itemKey: params.itemKey,
    idempotencyKey,
    timestamp: Date.now(),
    retries: 0,
  };
  
  queue.push(attempt);
  saveQueue(queue);
  
  console.info(`[OfflineQueue] Enqueued attempt (queue size: ${queue.length})`);
}

// Alias for backward compatibility
export const enqueue = enqueueAttempt;

// Alias for flush
export const flush = flushAttempts;

/**
 * Get the number of queued attempts
 */
export function getQueueSize(): number {
  return getQueue().length;
}

/**
 * Clear the entire queue
 */
export function clearQueue(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(QUEUE_KEY);
  console.info("[OfflineQueue] Queue cleared");
}

/**
 * Calculate exponential backoff delay
 */
export function getBackoffDelay(retries: number): number {
  return BASE_DELAY * Math.pow(2, retries);
}

/**
 * Flush queued attempts to the server
 * Uses exponential backoff for retries
 */
export async function flushAttempts(
  logGameAttemptFn: (
    roundId: string,
    itemId: number,
    isCorrect: boolean,
    latencyMs: number,
    finalize?: boolean,
    selectedIndex?: number,
    itemKey?: string,
    idempotencyKey?: string
  ) => Promise<{ attemptId: string; roundId: string; final?: { finalScore: number; endedAt: string } }>
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) {
    console.info("[OfflineQueue] Still offline, skipping flush");
    return;
  }

  const queue = getQueue();
  
  if (queue.length === 0) {
    console.info("[OfflineQueue] Queue is empty, nothing to flush");
    return;
  }

  console.info(`[OfflineQueue] Flushing ${queue.length} attempts...`);

  const failed: QueuedAttempt[] = [];
  let successCount = 0;

  for (const attempt of queue) {
    try {
      // Check if max retries exceeded
      if (attempt.retries >= MAX_RETRIES) {
        console.warn(`[OfflineQueue] Max retries exceeded for attempt ${attempt.id}, dropping`);
        continue;
      }

      // Apply backoff delay
      if (attempt.retries > 0) {
        const delay = getBackoffDelay(attempt.retries);
        console.info(`[OfflineQueue] Waiting ${delay}ms before retry ${attempt.retries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Try to send the attempt
      await logGameAttemptFn(
        attempt.roundId,
        attempt.itemId,
        attempt.isCorrect,
        attempt.latencyMs,
        attempt.finalize,
        attempt.selectedIndex,
        attempt.itemKey,
        attempt.idempotencyKey
      );
      successCount++;
      console.info(`[OfflineQueue] Successfully sent attempt ${attempt.id}`);
    } catch (err) {
      console.error(`[OfflineQueue] Failed to send attempt ${attempt.id}:`, err);
      
      // Re-queue with incremented retry count
      failed.push({
        ...attempt,
        retries: attempt.retries + 1,
      });
    }
  }

  // Save failed attempts back to queue
  saveQueue(failed);

  console.info(
    `[OfflineQueue] Flush complete: ${successCount} sent, ${failed.length} failed`
  );
}

/**
 * Set up online event listener to auto-flush
 */
export function setupAutoFlush(
  logGameAttemptFn: (
    roundId: string,
    itemId: number,
    isCorrect: boolean,
    latencyMs: number,
    finalize?: boolean,
    selectedIndex?: number,
    itemKey?: string,
    idempotencyKey?: string
  ) => Promise<{ attemptId: string; roundId: string; final?: { finalScore: number; endedAt: string } }>
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    console.info("[OfflineQueue] Connection restored, flushing queue...");
    flushAttempts(logGameAttemptFn);
  };

  window.addEventListener("online", handleOnline);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
