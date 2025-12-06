import { useState, useEffect, useCallback } from "react";
import type { Course } from "@/lib/types/course";
import { useGameStateStore } from "@/store/gameState";

interface GameState {
  level: number;
  pool: any[];
  poolSize: number;
  currentItem: any;
  score: number;
  mistakes: number;
  elapsedTime: number;
  progress: number;
  isComplete: boolean;
  visibleGroups: number[];
}

interface GameActions {
  processAnswer: (selectedIndex: number) => { 
    isCorrect: boolean; 
    correctAnswer: string;
    filledSentence: string;
    gameEnded: boolean;
    poolLengthAfter: number;
  };
  advanceToNext: () => void;
  reset: () => void;
}

/**
 * Custom hook for managing game state - now uses Zustand store
 */
export const useGameState = (course: Course | null, initialLevel: number = 1): [GameState, GameActions] => {
  const store = useGameStateStore();
  const [initialized, setInitialized] = useState(false);

  // Initialize store when course loads
  useEffect(() => {
    if (!course) return;
    
    store.initialize(course, initialLevel);
    setInitialized(true);
  }, [course, initialLevel]);

  // Timer - increment elapsed time every second
  useEffect(() => {
    if (!store.currentItem || store.isComplete) return;

    const timer = setInterval(() => {
      store.incrementTime();
    }, 1000);

    return () => clearInterval(timer);
  }, [store.currentItem, store.isComplete]);

  // Calculate progress
  const progress = store.poolSize > 0 ? 1 - store.pool.length / store.poolSize : 0;

  const state: GameState = {
    level: store.level,
    pool: store.pool,
    poolSize: store.poolSize,
    currentItem: store.currentItem,
    score: store.score,
    mistakes: store.mistakes,
    elapsedTime: store.elapsedTime,
    progress,
    isComplete: store.isComplete,
    visibleGroups: store.visibleGroups,
  };

  const actions: GameActions = {
    processAnswer: store.processAnswer,
    advanceToNext: store.advanceToNext,
    reset: store.reset,
  };

  return [state, actions];
};
