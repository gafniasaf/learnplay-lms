import { useState, useEffect, useCallback, useRef } from 'react';
import { useMCP } from './useMCP';
import { enqueueAttempt, flushAttempts, setupAutoFlush } from '@/lib/offlineQueue';

interface UseGameSessionOptions {
  courseId: string;
  level: number;
  assignmentId?: string;
  contentVersion?: string;
  autoStart?: boolean;
}

interface GameSessionState {
  sessionId: string | null;
  roundId: string | null;
  score: number;
  mistakes: number;
  accuracy: number;
  isActive: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useGameSession(options: UseGameSessionOptions) {
  const { courseId, level, assignmentId, contentVersion, autoStart = true } = options;
  const mcp = useMCP();
  const mcpRef = useRef(mcp);
  mcpRef.current = mcp;
  const [state, setState] = useState<GameSessionState>({
    sessionId: null,
    roundId: null,
    score: 0,
    mistakes: 0,
    accuracy: 0,
    isActive: false,
    isLoading: false,
    error: null,
  });

  const cleanupAutoFlushRef = useRef<(() => void) | null>(null);

  // Initialize session on mount if autoStart is true
  useEffect(() => {
    if (autoStart && courseId && level) {
      startRound();
    }

    // Setup auto-flush for offline queue
    cleanupAutoFlushRef.current = setupAutoFlush((roundId, itemId, isCorrect, latencyMs, finalize, selectedIndex, itemKey, idempotencyKey) => {
      return mcpRef.current.logGameAttempt(roundId, itemId, isCorrect, latencyMs, finalize, selectedIndex, itemKey, idempotencyKey);
    });

    // Flush queue on mount if online
    if (navigator.onLine) {
      flushAttempts((roundId, itemId, isCorrect, latencyMs, finalize, selectedIndex, itemKey, idempotencyKey) => {
        return mcpRef.current.logGameAttempt(roundId, itemId, isCorrect, latencyMs, finalize, selectedIndex, itemKey, idempotencyKey);
      });
    }

    return () => {
      if (cleanupAutoFlushRef.current) {
        cleanupAutoFlushRef.current();
      }
    };
  }, [courseId, level, assignmentId, contentVersion, autoStart]);

  const startRound = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await mcpRef.current.startGameRound(courseId, level, assignmentId, contentVersion);
      setState(prev => ({
        ...prev,
        sessionId: result.sessionId,
        roundId: result.roundId,
        isActive: true,
        isLoading: false,
        score: 0,
        mistakes: 0,
        accuracy: 0,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start game round';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      console.error('[useGameSession] Failed to start round:', error);
    }
  }, [courseId, level, assignmentId, contentVersion]);

  const submitAnswer = useCallback(async (
    itemId: number,
    isCorrect: boolean,
    latencyMs: number,
    selectedIndex?: number,
    itemKey?: string
  ) => {
    if (!state.roundId) {
      console.error('[useGameSession] Cannot submit answer: round not started');
      return;
    }

    const idempotencyKey = `${state.roundId}-${itemId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Update local state optimistically
    setState(prev => {
      const newScore = isCorrect ? prev.score + 1 : prev.score;
      const newMistakes = isCorrect ? prev.mistakes : prev.mistakes + 1;
      const totalAttempts = newScore + newMistakes;
      const newAccuracy = totalAttempts > 0 ? Math.round((newScore / totalAttempts) * 100) : 0;

      return {
        ...prev,
        score: newScore,
        mistakes: newMistakes,
        accuracy: newAccuracy,
      };
    });

    // Try to log attempt
    try {
      if (navigator.onLine) {
        await mcp.logGameAttempt(state.roundId, itemId, isCorrect, latencyMs, false, selectedIndex, itemKey, idempotencyKey);
      } else {
        // Queue for offline
        enqueueAttempt({
          roundId: state.roundId,
          itemId,
          isCorrect,
          latencyMs,
          finalize: false,
          selectedIndex,
          itemKey,
        });
      }
    } catch (error) {
      console.error('[useGameSession] Failed to log attempt:', error);
      // Queue for retry
      enqueueAttempt({
        roundId: state.roundId,
        itemId,
        isCorrect,
        latencyMs,
        finalize: false,
        selectedIndex,
        itemKey,
      });
    }
  }, [state.roundId, mcp]);

  const endRound = useCallback(async () => {
    if (!state.roundId) {
      console.error('[useGameSession] Cannot end round: round not started');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Finalize the round (this will calculate final score)
      const result = await mcp.logGameAttempt(state.roundId, 0, false, 0, true);

      setState(prev => ({
        ...prev,
        isActive: false,
        isLoading: false,
        score: result.final?.finalScore || prev.score,
        accuracy: result.final ? Math.round((result.final.finalScore / (prev.score + prev.mistakes)) * 100) : prev.accuracy,
      }));
    } catch (error) {
      console.error('[useGameSession] Failed to end round:', error);
      setState(prev => ({
        ...prev,
        isActive: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to end round',
      }));
    }
  }, [state.roundId, state.score, state.mistakes, mcp]);

  return {
    ...state,
    startRound,
    submitAnswer,
    endRound,
  };
}
