/**
 * Game Session Hook
 * 
 * Connects the game state store to MCP data layer.
 * Handles course loading, session tracking, and result persistence.
 */

import { useCallback, useEffect, useState } from 'react';
import { useGameStateStore } from '@/store/gameState';
import { useMCP } from '@/hooks/useMCP';
import type { Course } from '@/lib/types/course';

interface UseGameSessionOptions {
  courseId: string;
  level?: number;
  autoStart?: boolean;
}

interface GameSessionState {
  isLoading: boolean;
  error: string | null;
  course: Course | null;
  sessionId: string | null;
}

export function useGameSession({ courseId, level = 1, autoStart = true }: UseGameSessionOptions) {
  const mcp = useMCP();
  const gameStore = useGameStateStore();
  
  const [state, setState] = useState<GameSessionState>({
    isLoading: true,
    error: null,
    course: null,
    sessionId: null,
  });

  // Load course from MCP
  const loadCourse = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Fetch course content from MCP
      const result = await mcp.getRecord('course-blueprint', courseId) as { record?: Course } | null;
      
      if (!result?.record) {
        throw new Error(`Course ${courseId} not found`);
      }
      
      const course = result.record;
      
      // Create a new session event
      const sessionResult = await mcp.saveRecord('session-event', {
        course_id: courseId,
        level,
        started_at: new Date().toISOString(),
        status: 'active',
      }) as { id?: string } | null;
      
      setState({
        isLoading: false,
        error: null,
        course,
        sessionId: sessionResult?.id || `local-${Date.now()}`,
      });
      
      // Initialize game store with course
      if (autoStart) {
        gameStore.initialize(course, level);
      }
      
      return course;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load course';
      setState(prev => ({ ...prev, isLoading: false, error }));
      console.error('[useGameSession] Load error:', error);
      return null;
    }
  }, [courseId, level, autoStart, mcp, gameStore]);

  // Start game with loaded course
  const startGame = useCallback((overrideLevel?: number) => {
    const { course } = state;
    if (!course) {
      console.warn('[useGameSession] Cannot start game: course not loaded');
      return;
    }
    gameStore.initialize(course, overrideLevel ?? level);
  }, [state, level, gameStore]);

  // Save session results to MCP
  const saveResults = useCallback(async () => {
    const { sessionId } = state;
    const { score, mistakes, elapsedTime, poolSize, isComplete } = gameStore;
    
    if (!sessionId) {
      console.warn('[useGameSession] Cannot save results: no session ID');
      return;
    }
    
    try {
      // Update session event with results
      await mcp.saveRecord('session-event', {
        id: sessionId,
        completed_at: new Date().toISOString(),
        status: isComplete ? 'completed' : 'abandoned',
        score,
        mistakes,
        elapsed_seconds: elapsedTime,
        total_items: poolSize,
        accuracy: poolSize > 0 ? Math.round((score / poolSize) * 100) : 0,
      });
      
      console.info('[useGameSession] Results saved:', { sessionId, score, mistakes });
    } catch (err) {
      console.error('[useGameSession] Failed to save results:', err);
    }
  }, [state, gameStore, mcp]);

  // Log individual attempts (for analytics)
  const logAttempt = useCallback(async (
    itemId: number,
    selectedIndex: number,
    isCorrect: boolean
  ) => {
    const { sessionId } = state;
    if (!sessionId) return;
    
    try {
      await mcp.saveRecord('session-event', {
        parent_session_id: sessionId,
        type: 'attempt',
        item_id: itemId,
        selected_index: selectedIndex,
        is_correct: isCorrect,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      // Don't fail on attempt logging - it's non-critical
      console.warn('[useGameSession] Failed to log attempt:', err);
    }
  }, [state, mcp]);

  // Auto-load course on mount
  useEffect(() => {
    if (courseId) {
      loadCourse();
    }
  }, [courseId]); // Don't include loadCourse to avoid re-fetching

  // Compute derived state
  const {
    currentItem,
    score,
    mistakes,
    elapsedTime,
    isComplete,
    pool,
    poolSize,
  } = gameStore;

  const progress = poolSize > 0 
    ? Math.round(((poolSize - pool.length) / poolSize) * 100) 
    : 0;

  return {
    // State
    isLoading: state.isLoading,
    error: state.error,
    course: state.course,
    sessionId: state.sessionId,
    
    // Game state (from store)
    currentItem,
    score,
    mistakes,
    elapsedTime,
    isComplete,
    progress,
    remainingItems: pool.length,
    totalItems: poolSize,
    
    // Actions
    loadCourse,
    startGame,
    saveResults,
    logAttempt,
    
    // Store actions (passthrough)
    processAnswer: gameStore.processAnswer,
    advanceToNext: gameStore.advanceToNext,
    reset: gameStore.reset,
    incrementTime: gameStore.incrementTime,
  };
}



