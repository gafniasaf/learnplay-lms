/**
 * Offline Queue for Game Attempts
 * Stores attempts in localStorage when offline and flushes when back online
 */

import type { LogAttemptPayload } from "./api";

const QUEUE_KEY = "offline-attempts-queue";
export const MAX_RETRIES = 5;
export const BASE_DELAY = 1000; // 1 second

interface QueuedAttempt {
  id: string;
  payload: LogAttemptPayload;
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
export function enqueue(payload: LogAttemptPayload): void {
  const queue = getQueue();
  const attempt: QueuedAttempt = {
    id: `attempt-${Date.now()}-${Math.random()}`,
    payload,
    timestamp: Date.now(),
    retries: 0,
  };
  
  queue.push(attempt);
  saveQueue(queue);
  
  console.info(`[OfflineQueue] Enqueued attempt (queue size: ${queue.length})`);
}

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
export async function flush(
  logAttemptFn: (payload: LogAttemptPayload) => Promise<any>
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
      await logAttemptFn(attempt.payload);
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
  logAttemptFn: (payload: LogAttemptPayload) => Promise<any>
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    console.info("[OfflineQueue] Connection restored, flushing queue...");
    flush(logAttemptFn);
  };

  window.addEventListener("online", handleOnline);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
