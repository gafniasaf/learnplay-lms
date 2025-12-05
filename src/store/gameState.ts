/**
 * Game State Store for LearnPlay Platform
 * 
 * Zustand store for managing adaptive learning game state.
 * Copied from dawn-react-starter - clean, battle-tested, 47+ passing tests.
 */

import { create } from "zustand";
import type { Course, CourseItem } from "@/lib/types/course";
import { resolveOnWrong } from "@/lib/gameLogic";

interface GameState {
  // Core state
  course: Course | null;
  level: number;
  pool: CourseItem[];
  poolSize: number;
  currentIndex: number;
  currentItem: CourseItem | null;
  
  // Metrics
  score: number;
  mistakes: number;
  elapsedTime: number;
  isComplete: boolean;
  
  // Metadata
  visibleGroups: number[];
  allowedGroupIds: Set<number>;
  variantMap: Map<string, number>;
  
  // Actions
  initialize: (course: Course, level: number) => void;
  processAnswer: (selectedIndex: number) => {
    isCorrect: boolean;
    correctAnswer: string;
    filledSentence: string;
    gameEnded: boolean;
    poolLengthAfter: number;
  };
  advanceToNext: () => void;
  reset: () => void;
  incrementTime: () => void;
}

/**
 * Select a valid item from pool with retry logic
 */
function selectValidItemFromPool(
  pool: CourseItem[],
  allowedGroupIds: Set<number>,
  maxAttempts: number = 10
): { item: CourseItem | null; index: number } {
  if (pool.length === 0) return { item: null, index: -1 };

  // Try to find a valid item
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const candidate = pool[randomIndex];
    
    if (allowedGroupIds.has(candidate.groupId)) {
      return { item: candidate, index: randomIndex };
    }
    
    // If first attempt failed, log warning
    if (attempt === 0) {
      console.warn(`[GameState] Item ${candidate.id} has groupId ${candidate.groupId} which is outside level range ${Array.from(allowedGroupIds).join(',')}`);
    }
  }

  // Failed to find valid item after all attempts
  console.error(`[GameState] Failed to find valid item after ${maxAttempts} attempts. Pool has ${pool.length} items.`);
  return { item: null, index: -1 };
}

/**
 * Zustand store for game state management with synchronous pool updates
 */
export const useGameStateStore = create<GameState>((set, get) => ({
  // Initial state
  course: null,
  level: 1,
  pool: [],
  poolSize: 0,
  currentIndex: -1,
  currentItem: null,
  score: 0,
  mistakes: 0,
  elapsedTime: 0,
  isComplete: false,
  visibleGroups: [],
  allowedGroupIds: new Set(),
  variantMap: new Map(),

  /**
   * Initialize game state with course and level
   */
  initialize: (course: Course, level: number) => {
    // Use course.levels directly from JSON (with fallback if missing)
    const courseLevels = course.levels && course.levels.length > 0 
      ? course.levels 
      : [{
          id: 1,
          title: "All Content",
          start: 0,
          end: Math.max(...course.items.map(item => item.groupId), 0),
          description: "Complete course (fallback level)",
        }];

    const activeLevel = courseLevels.find((l) => l.id === level);
    if (!activeLevel) {
      console.warn(`[GameState] Level ${level} not found in course ${course.id}`);
      return;
    }

    // Build set of allowed group IDs (start..end inclusive)
    const allowedGroupIds = new Set<number>();
    for (let gid = activeLevel.start; gid <= activeLevel.end; gid++) {
      allowedGroupIds.add(gid);
    }

    // Filter items by group range
    const levelItems = course.items.filter((item) => 
      allowedGroupIds.has(item.groupId)
    );

    // Shuffle pool
    const shuffled = [...levelItems].sort(() => Math.random() - 0.5);
    
    // Compute visible groups (sorted unique group IDs in range)
    const groupsInRange = Array.from(allowedGroupIds).sort((a, b) => a - b);
    
    // Select valid item from pool
    const { item, index } = selectValidItemFromPool(shuffled, allowedGroupIds);
    if (!item && shuffled.length > 0) {
      console.error(`[GameState] Pool initialization: All ${shuffled.length} items failed level guard!`);
    }
    
    set({
      course,
      level,
      pool: shuffled,
      poolSize: shuffled.length,
      currentIndex: index,
      currentItem: item,
      score: 0,
      mistakes: 0,
      elapsedTime: 0,
      isComplete: false,
      visibleGroups: groupsInRange,
      allowedGroupIds,
      variantMap: new Map(),
    });
    
    console.info(`[GameState] Level ${level} initialized from course.json: groups ${activeLevel.start}-${activeLevel.end}, ${shuffled.length} items`);
  },

  /**
   * Process answer - updates pool synchronously but does NOT advance to next item
   */
  processAnswer: (selectedIndex: number) => {
    const state = get();
    const { currentItem, currentIndex, pool, poolSize, course, allowedGroupIds, level, variantMap } = state;

    if (!currentItem || !course || currentIndex === -1) {
      return { 
        isCorrect: false, 
        correctAnswer: "", 
        filledSentence: "", 
        gameEnded: false, 
        poolLengthAfter: pool.length 
      };
    }

    // Determine correctness based on mode
    let isCorrect: boolean;
    let correctAnswer: string;
    
    if (currentItem.mode === 'numeric') {
      isCorrect = selectedIndex === currentItem.correctIndex;
      correctAnswer = currentItem.answer?.toString() || "";
    } else {
      isCorrect = selectedIndex === currentItem.correctIndex;
      correctAnswer = currentItem.options?.[currentItem.correctIndex] || "";
    }

    // Build filled sentence
    const filledSentence = currentItem.text
      .replace(/_/g, correctAnswer)
      .replace(/\\[blank\\]/g, correctAnswer);

    if (isCorrect) {
      // CORRECT: Remove current item from pool synchronously via immutable splice
      const newPool = [
        ...pool.slice(0, currentIndex),
        ...pool.slice(currentIndex + 1)
      ];
      
      const poolLengthAfter = newPool.length;
      const gameEnded = poolLengthAfter === 0;
      
      // Adjust currentIndex to stay within bounds
      const adjustedIndex = Math.min(currentIndex, newPool.length - 1);
      
      // Update state synchronously - NO setTimeout, NO requestAnimationFrame
      set({
        pool: newPool,
        score: state.score + 1,
        currentIndex: adjustedIndex,
        // Keep poolSize as high-water mark (unchanged)
        isComplete: gameEnded,
      });
      
      return { isCorrect, correctAnswer, filledSentence, gameEnded, poolLengthAfter };
    } else {
      // WRONG: Increment mistakes, decrease score, and enqueue variant
      const newVariantMap = new Map(variantMap);
      
      // Use pure game logic to determine what item to enqueue
      const { itemToEnqueue, nextVariantNum } = resolveOnWrong(
        currentItem,
        pool,
        course,
        newVariantMap
      );

      // HARD GUARD: Validate enqueued item is in level range
      if (!allowedGroupIds.has(itemToEnqueue.groupId)) {
        console.error(
          `[GameState] ⚠️ LEVEL GUARD VIOLATION: Attempted to enqueue item ${itemToEnqueue.id} ` +
          `with groupId ${itemToEnqueue.groupId}, but level ${level} only allows groups ` +
          `${Array.from(allowedGroupIds).join(',')}`
        );
        return { 
          isCorrect, 
          correctAnswer, 
          filledSentence, 
          gameEnded: false, 
          poolLengthAfter: pool.length 
        };
      }

      // Update variant tracking if rotation occurred
      if (nextVariantNum && currentItem.clusterId) {
        newVariantMap.set(currentItem.clusterId, nextVariantNum);
      }

      // ADD item to pool (DON'T remove current item)
      const newPool = [...pool, itemToEnqueue];
      const newPoolSize = Math.max(poolSize, newPool.length);
      const poolLengthAfter = newPool.length;
      
      set({
        pool: newPool,
        poolSize: newPoolSize,
        score: Math.max(0, state.score - 1),
        mistakes: state.mistakes + 1,
        variantMap: newVariantMap,
      });
      
      return { isCorrect, correctAnswer, filledSentence, gameEnded: false, poolLengthAfter };
    }
  },

  /**
   * Advance to next item - called by UI after feedback animations
   */
  advanceToNext: () => {
    const state = get();
    const { pool, allowedGroupIds } = state;
    
    // Adjust currentIndex to stay within bounds
    const maxIndex = pool.length - 1;
    const adjustedIndex = Math.min(state.currentIndex, maxIndex);
    
    // Select valid item from current pool
    const { item, index } = selectValidItemFromPool(pool, allowedGroupIds);
    if (!item && pool.length > 0) {
      console.error(`[GameState] advanceToNext: All ${pool.length} pool items failed level guard!`);
    }
    
    set({
      currentIndex: index,
      currentItem: item,
    });
  },

  /**
   * Reset game state
   */
  reset: () => {
    const state = get();
    const { course, level } = state;
    
    if (!course) return;
    
    // Re-initialize with same course and level
    get().initialize(course, level);
  },

  /**
   * Increment elapsed time (called by timer)
   */
  incrementTime: () => {
    set((state) => ({ elapsedTime: state.elapsedTime + 1 }));
  },
}));



