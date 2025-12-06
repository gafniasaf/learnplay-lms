/**
 * Offline Queue Test
 * Verifies that attempts are queued when offline and flushed when online
 */

import { enqueue, flush, getQueueSize, clearQueue } from "../offlineQueue";
import type { LogAttemptPayload } from "../api";

export async function runOfflineQueueTest(): Promise<{ pass: boolean; details?: any }> {
  // Clear queue before test
  clearQueue();

  const details: any = {
    initialQueueSize: 0,
    afterEnqueueSize: 0,
    afterFlushSize: 0,
    attemptsSent: 0,
  };

  try {
    // 1. Verify queue starts empty
    details.initialQueueSize = getQueueSize();
    if (details.initialQueueSize !== 0) {
      return {
        pass: false,
        details: { ...details, error: "Queue not empty at start" },
      };
    }

    // 2. Simulate offline: enqueue attempts
    const mockPayload1: LogAttemptPayload = {
      roundId: "test-round-1",
      itemId: 1,
      itemKey: '1:test:1',
      selectedIndex: 0,
      isCorrect: true,
      latencyMs: 1500,
    };

    const mockPayload2: LogAttemptPayload = {
      roundId: "test-round-1",
      itemId: 2,
      itemKey: '2:test:2',
      selectedIndex: 1,
      isCorrect: false,
      latencyMs: 2000,
    };

    enqueue(mockPayload1);
    enqueue(mockPayload2);

    details.afterEnqueueSize = getQueueSize();
    if (details.afterEnqueueSize !== 2) {
      return {
        pass: false,
        details: { ...details, error: `Expected 2 queued, got ${details.afterEnqueueSize}` },
      };
    }

    // 3. Simulate online: flush queue
    const sentAttempts: LogAttemptPayload[] = [];
    const mockLogAttemptFn = async (payload: LogAttemptPayload) => {
      sentAttempts.push(payload);
      return { roundId: payload.roundId, itemId: payload.itemId };
    };

    await flush(mockLogAttemptFn);

    details.attemptsSent = sentAttempts.length;
    details.afterFlushSize = getQueueSize();

    // 4. Verify all attempts were sent and queue is empty
    if (sentAttempts.length !== 2) {
      return {
        pass: false,
        details: { ...details, error: `Expected 2 sent, got ${sentAttempts.length}` },
      };
    }

    if (details.afterFlushSize !== 0) {
      return {
        pass: false,
        details: { ...details, error: `Queue not empty after flush: ${details.afterFlushSize}` },
      };
    }

    // 5. Verify payloads match
    if (
      sentAttempts[0].itemId !== mockPayload1.itemId ||
      sentAttempts[1].itemId !== mockPayload2.itemId
    ) {
      return {
        pass: false,
        details: { ...details, error: "Payload mismatch after flush" },
      };
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
  } finally {
    // Clean up
    clearQueue();
  }
}
