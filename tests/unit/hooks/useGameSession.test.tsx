/**
 * Tests for useGameSession hook
 * Tests session state, round management, and answer submission
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

const mockMCP = {
  startGameRound: jest.fn(),
  logGameAttempt: jest.fn(),
  call: jest.fn(),
  getRecord: jest.fn(),
  saveRecord: jest.fn(),
  enqueueJob: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (useMCP as jest.Mock).mockReturnValue(mockMCP);
});

describe('useGameSession', () => {
  it('starts round automatically when autoStart is true', async () => {
    mockMCP.startGameRound.mockResolvedValue({
      sessionId: 'session-123',
      roundId: 'round-123',
    });

    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: true })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockMCP.startGameRound).toHaveBeenCalledWith('course-123', 1, undefined, undefined);
    expect(result.current.sessionId).toBe('session-123');
    expect(result.current.roundId).toBe('round-123');
    expect(result.current.isActive).toBe(true);
  });

  it('does not start round when autoStart is false', async () => {
    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: false })
    );

    // Give it time to potentially start
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockMCP.startGameRound).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
  });

  it('handles startGameRound errors gracefully', async () => {
    mockMCP.startGameRound.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: true })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isActive).toBe(false);
    expect(result.current.sessionId).toBeNull();
  });

  it('provides submitAnswer function', async () => {
    mockMCP.startGameRound.mockResolvedValue({
      sessionId: 'session-123',
      roundId: 'round-123',
    });
    mockMCP.logGameAttempt.mockResolvedValue({ attemptId: 'attempt-1', roundId: 'round-123' });

    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: true })
    );

    await waitFor(() => {
      expect(result.current.roundId).toBe('round-123');
    });

    await act(async () => {
      await result.current.submitAnswer(1, true, 500, 0, 'item-key');
    });

    expect(mockMCP.logGameAttempt).toHaveBeenCalledWith(
      'round-123', 1, true, 500, false, 0, 'item-key', expect.any(String)
    );
  });

  it('updates score and mistakes on answer submission', async () => {
    mockMCP.startGameRound.mockResolvedValue({
      sessionId: 'session-123',
      roundId: 'round-123',
    });
    mockMCP.logGameAttempt.mockResolvedValue({ attemptId: 'attempt-1', roundId: 'round-123' });

    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: true })
    );

    await waitFor(() => {
      expect(result.current.roundId).toBe('round-123');
    });

    // Submit correct answer
    await act(async () => {
      await result.current.submitAnswer(1, true, 500);
    });
    expect(result.current.score).toBe(1);
    expect(result.current.mistakes).toBe(0);

    // Submit incorrect answer
    await act(async () => {
      await result.current.submitAnswer(2, false, 600);
    });
    expect(result.current.score).toBe(1);
    expect(result.current.mistakes).toBe(1);
  });

  it('calculates accuracy correctly', async () => {
    mockMCP.startGameRound.mockResolvedValue({
      sessionId: 'session-123',
      roundId: 'round-123',
    });
    mockMCP.logGameAttempt.mockResolvedValue({ attemptId: 'attempt-1', roundId: 'round-123' });

    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: true })
    );

    await waitFor(() => {
      expect(result.current.roundId).toBe('round-123');
    });

    // Submit 3 correct, 1 incorrect = 75% accuracy
    await act(async () => {
      await result.current.submitAnswer(1, true, 500);
      await result.current.submitAnswer(2, true, 500);
      await result.current.submitAnswer(3, true, 500);
      await result.current.submitAnswer(4, false, 500);
    });

    expect(result.current.accuracy).toBe(75);
  });

  it('does not submit answer when round not started', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: false })
    );

    await act(async () => {
      await result.current.submitAnswer(1, true, 500);
    });

    expect(mockMCP.logGameAttempt).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useGameSession] Cannot submit answer: round not started'
    );

    consoleErrorSpy.mockRestore();
  });

  it('provides endRound function that finalizes the session', async () => {
    mockMCP.startGameRound.mockResolvedValue({
      sessionId: 'session-123',
      roundId: 'round-123',
    });
    mockMCP.logGameAttempt.mockResolvedValue({ 
      attemptId: 'attempt-1', 
      roundId: 'round-123',
      final: { score: 10, accuracy: 100 }
    });

    const { result } = renderHook(() =>
      useGameSession({ courseId: 'course-123', level: 1, autoStart: true })
    );

    await waitFor(() => {
      expect(result.current.roundId).toBe('round-123');
    });

    await act(async () => {
      await result.current.endRound();
    });

    expect(result.current.isActive).toBe(false);
  });

  it('passes assignmentId and contentVersion to startGameRound', async () => {
    mockMCP.startGameRound.mockResolvedValue({
      sessionId: 'session-123',
      roundId: 'round-123',
    });

    renderHook(() =>
      useGameSession({ 
        courseId: 'course-123', 
        level: 2, 
        assignmentId: 'assignment-456',
        contentVersion: 'v2',
        autoStart: true 
      })
    );

    await waitFor(() => {
      expect(mockMCP.startGameRound).toHaveBeenCalledWith(
        'course-123', 2, 'assignment-456', 'v2'
      );
    });
  });
});
