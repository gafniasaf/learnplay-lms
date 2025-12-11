import { enqueueAttempt, getQueueSize, clearQueue, flushAttempts, setupAutoFlush, getBackoffDelay, BASE_DELAY } from './offlineQueue';
import type { LogAttemptPayload } from './api';

function mockPayload(): LogAttemptPayload {
  return {
    roundId: 'r1',
    itemId: 1,
    itemKey: '1:cluster:1',
    selectedIndex: 0,
    isCorrect: true,
    latencyMs: 10,
  };
}

describe('offlineQueue', () => {
  beforeEach(() => {
    // jsdom provides localStorage and navigator
    clearQueue();
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true });
  });

  it('enqueues and counts attempts', () => {
    enqueueAttempt(mockPayload());
    enqueueAttempt(mockPayload());
    expect(getQueueSize()).toBe(2);
  });

  it('flushes successfully when online', async () => {
    enqueueAttempt(mockPayload());
    const spy = jest.fn().mockResolvedValue({ ok: true });
    await flushAttempts(spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries failed attempts and clears queue on subsequent success', async () => {
    jest.useFakeTimers();
    enqueueAttempt(mockPayload());
    // First call rejects, second resolves
    const spy = jest
      .fn()
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce({ ok: true });

    // First flush: failure -> re-queued with retries=1
    await flushAttempts(spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getQueueSize()).toBe(1);

    // Second flush: should wait backoff then succeed (uses exponential backoff helper)
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true });
    const p = flushAttempts(spy);
    jest.advanceTimersByTime(getBackoffDelay(1));
    await p;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(getQueueSize()).toBe(0);
    jest.useRealTimers();
  });

  it('auto-flushes when online event fires', async () => {
    enqueueAttempt(mockPayload());
    const spy = jest.fn().mockResolvedValue({ ok: true });
    const cleanup = setupAutoFlush(spy);
    window.dispatchEvent(new Event('online'));
    // Allow microtask queue to process
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();
    cleanup();
  });

  it('returns 0 when getQueue throws (read error path)', () => {
    const original = localStorage.getItem.bind(localStorage);
    Object.defineProperty(localStorage, 'getItem', {
      value: () => { throw new Error('read'); },
      writable: true,
    });
    expect(getQueueSize()).toBe(0);
    // restore
    Object.defineProperty(localStorage, 'getItem', { value: original, writable: true });
  });

  it('handles saveQueue error path without throwing', () => {
    const origSet = localStorage.setItem.bind(localStorage);
    const origGet = localStorage.getItem.bind(localStorage);
    // ensure queue can be read
    Object.defineProperty(localStorage, 'getItem', { value: () => '[]', writable: true });
    Object.defineProperty(localStorage, 'setItem', {
      value: () => { throw new Error('write'); },
      writable: true,
    });
    expect(() => enqueueAttempt(mockPayload())).not.toThrow();
    Object.defineProperty(localStorage, 'setItem', { value: origSet, writable: true });
    Object.defineProperty(localStorage, 'getItem', { value: origGet, writable: true });
  });

  it('flush returns early when queue empty', async () => {
    clearQueue();
    const spy = jest.fn();
    await flushAttempts(spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips flush when offline', async () => {
    const original = { ...global.navigator } as any;
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true });
    enqueueAttempt(mockPayload());
    const spy = jest.fn();
    await flushAttempts(spy);
    expect(spy).not.toHaveBeenCalled();
    Object.defineProperty(global, 'navigator', { value: original, writable: true });
  });

  it('drops attempts that exceeded max retries without calling sender', async () => {
    // Pre-populate queue with an attempt at MAX_RETRIES
    const attempt = {
      id: 'attempt-1',
      payload: mockPayload(),
      timestamp: Date.now(),
      retries: Number.MAX_SAFE_INTEGER, // exceeds MAX_RETRIES
    } as any;
    localStorage.setItem('offline-attempts-queue', JSON.stringify([attempt]));

    const spy = jest.fn();
    await flushAttempts(spy);
    // Should not try to send attempts that exceeded retries
    expect(spy).not.toHaveBeenCalled();
    expect(getQueueSize()).toBe(0);
  });

  it('guards when window is undefined (no-op paths)', async () => {
    const originalWindow = (global as any).window;
    (global as any).window = undefined;
    await expect(flushAttempts(jest.fn())).resolves.toBeUndefined();
    clearQueue();
    // restore
    (global as any).window = originalWindow;
  });
});


