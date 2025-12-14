/**
 * Tests for useGameSession hook
 * Tests game round management, answer submission, and scoring
 */

// Mock dependencies BEFORE imports
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));

jest.mock('@/lib/offlineQueue', () => ({
  enqueueAttempt: jest.fn(),
  flushAttempts: jest.fn(),
  setupAutoFlush: jest.fn(() => jest.fn()),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameSession } from '@/hooks/useGameSession';
import { useMCP } from '@/hooks/useMCP';
import { enqueueAttempt, flushAttempts, setupAutoFlush } from '@/lib/offlineQueue';

const createMockMCP = () => ({
  startGameRound: jest.fn(),
  logGameAttempt: jest.fn(),
  getRecord: jest.fn(),
  saveRecord: jest.fn(),
});

let mockMCP: ReturnType<typeof createMockMCP>;

beforeEach(() => {
  jest.clearAllMocks();
  mockMCP = createMockMCP();
  (useMCP as jest.Mock).mockReturnValue(mockMCP);
  
  // Mock navigator.onLine
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    writable: true,
    configurable: true,
  });
});

describe('useGameSession', () => {
  const defaultOptions = {
    courseId: 'course-123',
    level: 1,
    assignmentId: 'assignment-456',
    contentVersion: 'v1',
  };

  describe('initialization', () => {
    it('initializes with default state when autoStart is false', () => {
      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      expect(result.current.sessionId).toBeNull();
      expect(result.current.roundId).toBeNull();
      expect(result.current.score).toBe(0);
      expect(result.current.mistakes).toBe(0);
      expect(result.current.accuracy).toBe(0);
      expect(result.current.isActive).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets up auto-flush on mount', () => {
      renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      expect(setupAutoFlush).toHaveBeenCalledWith(expect.any(Function));
    });

    it('flushes attempts on mount when online', () => {
      renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      expect(flushAttempts).toHaveBeenCalledWith(expect.any(Function));
    });

    it('does not flush attempts when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      expect(flushAttempts).not.toHaveBeenCalled();
    });
  });

  describe('startRound', () => {
    it('starts round automatically when autoStart is true', async () => {
      mockMCP.startGameRound.mockResolvedValue({
        sessionId: 'session-123',
        roundId: 'round-456',
      });

      renderHook(() => useGameSession({ ...defaultOptions, autoStart: true }));

      await waitFor(() => {
        expect(mockMCP.startGameRound).toHaveBeenCalledWith(
          'course-123',
          1,
          'assignment-456',
          'v1'
        );
      });
    });

    it('does not auto-start when autoStart is false', async () => {
      renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      // Wait a bit to ensure no call is made
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(mockMCP.startGameRound).not.toHaveBeenCalled();
    });

    it('updates state on successful round start', async () => {
      mockMCP.startGameRound.mockResolvedValue({
        sessionId: 'session-123',
        roundId: 'round-456',
      });

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.sessionId).toBe('session-123');
        expect(result.current.roundId).toBe('round-456');
        expect(result.current.isActive).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('sets error on failed round start', async () => {
      mockMCP.startGameRound.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('handles non-Error exceptions', async () => {
      mockMCP.startGameRound.mockRejectedValue('String error');

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to start game round');
      });
    });

    it('can manually start round', async () => {
      mockMCP.startGameRound.mockResolvedValue({
        sessionId: 'session-123',
        roundId: 'round-456',
      });

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      await act(async () => {
        await result.current.startRound();
      });

      expect(result.current.sessionId).toBe('session-123');
      expect(result.current.roundId).toBe('round-456');
      expect(result.current.isActive).toBe(true);
    });
  });

  describe('submitAnswer', () => {
    beforeEach(async () => {
      mockMCP.startGameRound.mockResolvedValue({
        sessionId: 'session-123',
        roundId: 'round-456',
      });
    });

    it('updates score on correct answer', async () => {
      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.submitAnswer(1, true, 500);
      });

      expect(result.current.score).toBe(1);
      expect(result.current.mistakes).toBe(0);
      expect(result.current.accuracy).toBe(100);
    });

    it('updates mistakes on incorrect answer', async () => {
      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.submitAnswer(1, false, 500);
      });

      expect(result.current.score).toBe(0);
      expect(result.current.mistakes).toBe(1);
      expect(result.current.accuracy).toBe(0);
    });

    it('calculates accuracy correctly', async () => {
      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      // 3 correct, 1 wrong = 75% accuracy
      await act(async () => {
        await result.current.submitAnswer(1, true, 500);
        await result.current.submitAnswer(2, true, 500);
        await result.current.submitAnswer(3, false, 500);
        await result.current.submitAnswer(4, true, 500);
      });

      expect(result.current.score).toBe(3);
      expect(result.current.mistakes).toBe(1);
      expect(result.current.accuracy).toBe(75);
    });

    it('logs attempt via MCP when online', async () => {
      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.submitAnswer(1, true, 500, 0, 'item-key');
      });

      expect(mockMCP.logGameAttempt).toHaveBeenCalledWith(
        'round-456',
        1,
        true,
        500,
        false,
        0,
        'item-key',
        expect.any(String)
      );
    });

    it('queues attempt when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.submitAnswer(1, true, 500, 0, 'item-key');
      });

      expect(enqueueAttempt).toHaveBeenCalledWith({
        roundId: 'round-456',
        itemId: 1,
        isCorrect: true,
        latencyMs: 500,
        finalize: false,
        selectedIndex: 0,
        itemKey: 'item-key',
      });
    });

    it('queues attempt on MCP error', async () => {
      mockMCP.logGameAttempt.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.submitAnswer(1, true, 500);
      });

      expect(enqueueAttempt).toHaveBeenCalled();
    });

    it('does nothing when round not started', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      await act(async () => {
        await result.current.submitAnswer(1, true, 500);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useGameSession] Cannot submit answer: round not started'
      );
      expect(mockMCP.logGameAttempt).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('endRound', () => {
    beforeEach(async () => {
      mockMCP.startGameRound.mockResolvedValue({
        sessionId: 'session-123',
        roundId: 'round-456',
      });
    });

    it('finalizes round and updates state', async () => {
      mockMCP.logGameAttempt.mockResolvedValue({
        final: { finalScore: 8 },
      });

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.endRound();
      });

      expect(mockMCP.logGameAttempt).toHaveBeenCalledWith(
        'round-456',
        0,
        false,
        0,
        true
      );
      expect(result.current.isActive).toBe(false);
      expect(result.current.score).toBe(8);
    });

    it('handles error when ending round', async () => {
      mockMCP.logGameAttempt.mockRejectedValue(new Error('Finalize failed'));

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.endRound();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.error).toBe('Finalize failed');
    });

    it('handles non-Error exceptions when ending round', async () => {
      mockMCP.logGameAttempt.mockRejectedValue('String error');

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: true })
      );

      await waitFor(() => {
        expect(result.current.roundId).toBe('round-456');
      });

      await act(async () => {
        await result.current.endRound();
      });

      expect(result.current.error).toBe('Failed to end round');
    });

    it('does nothing when round not started', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      await act(async () => {
        await result.current.endRound();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useGameSession] Cannot end round: round not started'
      );
      expect(mockMCP.logGameAttempt).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('cleans up auto-flush on unmount', () => {
      const cleanupFn = jest.fn();
      (setupAutoFlush as jest.Mock).mockReturnValue(cleanupFn);

      const { unmount } = renderHook(() =>
        useGameSession({ ...defaultOptions, autoStart: false })
      );

      unmount();

      expect(cleanupFn).toHaveBeenCalled();
    });
  });
});
