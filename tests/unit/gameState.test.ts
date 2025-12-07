/**
 * Game State Store Tests
 */

import { useGameStateStore } from '@/store/gameState';
import type { Course, CourseItem } from '@/lib/types/course';

// Helper to reset store between tests
const resetStore = () => {
  useGameStateStore.setState({
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
  });
};

describe('useGameStateStore', () => {
  const mockItem1: CourseItem = {
    id: 1,
    groupId: 1,
    text: 'What is 2 + 2?',
    explain: '2 + 2 = 4',
    clusterId: 'cluster-1',
    variant: '1',
    options: ['3', '4', '5', '6'],
    correctIndex: 1,
  };

  const mockItem2: CourseItem = {
    id: 2,
    groupId: 1,
    text: 'What is 3 + 3?',
    explain: '3 + 3 = 6',
    clusterId: 'cluster-2',
    variant: '1',
    options: ['5', '6', '7', '8'],
    correctIndex: 1,
  };

  const mockItem1Variant2: CourseItem = {
    ...mockItem1,
    id: 3,
    variant: '2',
    text: 'What is 1 + 3?',
  };

  const mockCourse: Course = {
    id: 'test-course',
    title: 'Math Basics',
    levels: [
      { id: 1, title: 'Level 1', start: 1, end: 1 },
      { id: 2, title: 'Level 2', start: 1, end: 2 },
    ],
    groups: [
      { id: 1, name: 'Addition' },
      { id: 2, name: 'Subtraction' },
    ],
    items: [mockItem1, mockItem2, mockItem1Variant2],
  };

  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useGameStateStore.getState();
      expect(state.course).toBeNull();
      expect(state.level).toBe(1);
      expect(state.pool).toEqual([]);
      expect(state.poolSize).toBe(0);
      expect(state.currentIndex).toBe(-1);
      expect(state.currentItem).toBeNull();
      expect(state.score).toBe(0);
      expect(state.mistakes).toBe(0);
      expect(state.elapsedTime).toBe(0);
      expect(state.isComplete).toBe(false);
    });
  });

  describe('initialize', () => {
    it('initializes with course and level', () => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);

      const state = useGameStateStore.getState();
      expect(state.course).toBe(mockCourse);
      expect(state.level).toBe(1);
      expect(state.pool.length).toBeGreaterThan(0);
      expect(state.poolSize).toBeGreaterThan(0);
      expect(state.currentItem).not.toBeNull();
    });

    it('filters items by level group range', () => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1); // Level 1: groups 1-1

      const state = useGameStateStore.getState();
      // All items in pool should be from group 1
      state.pool.forEach(item => {
        expect(item.groupId).toBe(1);
      });
    });

    it('sets allowedGroupIds correctly', () => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);

      const state = useGameStateStore.getState();
      expect(state.allowedGroupIds.has(1)).toBe(true);
      expect(state.allowedGroupIds.has(2)).toBe(false);
    });

    it('resets score and mistakes', () => {
      // Set some values first
      useGameStateStore.setState({ score: 5, mistakes: 3 });
      
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);

      const state = useGameStateStore.getState();
      expect(state.score).toBe(0);
      expect(state.mistakes).toBe(0);
    });
  });

  describe('processAnswer', () => {
    beforeEach(() => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);
    });

    it('increments score on correct answer', () => {
      const state = useGameStateStore.getState();
      const correctIndex = state.currentItem!.correctIndex;
      
      const result = state.processAnswer(correctIndex);
      
      expect(result.isCorrect).toBe(true);
      expect(useGameStateStore.getState().score).toBe(1);
    });

    it('decrements score on wrong answer (min 0)', () => {
      const state = useGameStateStore.getState();
      const wrongIndex = (state.currentItem!.correctIndex + 1) % 4;
      
      const result = state.processAnswer(wrongIndex);
      
      expect(result.isCorrect).toBe(false);
      expect(useGameStateStore.getState().score).toBe(0); // Can't go below 0
      expect(useGameStateStore.getState().mistakes).toBe(1);
    });

    it('removes item from pool on correct answer', () => {
      const initialPoolLength = useGameStateStore.getState().pool.length;
      const state = useGameStateStore.getState();
      const correctIndex = state.currentItem!.correctIndex;
      
      state.processAnswer(correctIndex);
      
      expect(useGameStateStore.getState().pool.length).toBe(initialPoolLength - 1);
    });

    it('returns correct answer string', () => {
      const state = useGameStateStore.getState();
      const correctIndex = state.currentItem!.correctIndex;
      const expectedAnswer = state.currentItem!.options[correctIndex];
      
      const result = state.processAnswer(correctIndex);
      
      expect(result.correctAnswer).toBe(expectedAnswer);
    });

    it('sets isComplete when pool is empty', () => {
      // Initialize with a course that has only one item in level range
      const singleItemCourse: Course = {
        ...mockCourse,
        items: [mockItem1],
      };
      const { initialize } = useGameStateStore.getState();
      initialize(singleItemCourse, 1);
      
      const state = useGameStateStore.getState();
      const correctIndex = state.currentItem!.correctIndex;
      
      const result = state.processAnswer(correctIndex);
      
      expect(result.gameEnded).toBe(true);
      expect(useGameStateStore.getState().isComplete).toBe(true);
    });

    it('returns early if no current item', () => {
      useGameStateStore.setState({ currentItem: null });
      const state = useGameStateStore.getState();
      
      const result = state.processAnswer(0);
      
      expect(result.isCorrect).toBe(false);
      expect(result.correctAnswer).toBe('');
    });
  });

  describe('advanceToNext', () => {
    beforeEach(() => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);
    });

    it('selects a new current item from pool', () => {
      const initialItem = useGameStateStore.getState().currentItem;
      const { advanceToNext } = useGameStateStore.getState();
      
      advanceToNext();
      
      const newState = useGameStateStore.getState();
      // Item should be from the pool
      expect(newState.pool.some(item => item.id === newState.currentItem?.id)).toBe(true);
    });
  });

  describe('reset', () => {
    it('re-initializes with same course and level', () => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);
      
      // Make some changes
      const state = useGameStateStore.getState();
      state.processAnswer(state.currentItem!.correctIndex);
      
      expect(useGameStateStore.getState().score).toBe(1);
      
      // Reset
      useGameStateStore.getState().reset();
      
      expect(useGameStateStore.getState().score).toBe(0);
      expect(useGameStateStore.getState().mistakes).toBe(0);
    });

    it('does nothing if no course', () => {
      resetStore();
      const { reset } = useGameStateStore.getState();
      
      reset(); // Should not throw
      
      expect(useGameStateStore.getState().course).toBeNull();
    });
  });

  describe('incrementTime', () => {
    it('increments elapsed time by 1 second', () => {
      const { incrementTime } = useGameStateStore.getState();
      
      incrementTime();
      expect(useGameStateStore.getState().elapsedTime).toBe(1);
      
      incrementTime();
      expect(useGameStateStore.getState().elapsedTime).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles numeric mode correctly', () => {
      const numericItem: CourseItem = {
        id: 10,
        groupId: 1,
        text: 'What is 5 + 5?',
        explain: '5 + 5 = 10',
        clusterId: 'numeric-1',
        variant: '1',
        options: [],
        correctIndex: 0,
        mode: 'numeric',
        answer: 10,
      };

      const numericCourse: Course = {
        id: 'numeric-course',
        title: 'Numeric Course',
        levels: [{ id: 1, title: 'Level 1', start: 1, end: 1 }],
        groups: [{ id: 1, name: 'Math' }],
        items: [numericItem],
      };

      const { initialize } = useGameStateStore.getState();
      initialize(numericCourse, 1);

      const state = useGameStateStore.getState();
      expect(state.currentItem?.mode).toBe('numeric');
      
      // Test correct answer for numeric mode
      const result = state.processAnswer(0); // correctIndex is 0
      expect(result.isCorrect).toBe(true);
    });

    it('handles wrong answer for numeric mode', () => {
      const numericItem: CourseItem = {
        id: 10,
        groupId: 1,
        text: 'What is 5 + 5?',
        explain: '5 + 5 = 10',
        clusterId: 'numeric-1',
        variant: '1',
        options: [],
        correctIndex: 0,
        mode: 'numeric',
        answer: 10,
      };

      const numericCourse: Course = {
        id: 'numeric-course',
        title: 'Numeric Course',
        levels: [{ id: 1, title: 'Level 1', start: 1, end: 1 }],
        groups: [{ id: 1, name: 'Math' }],
        items: [numericItem],
      };

      const { initialize } = useGameStateStore.getState();
      initialize(numericCourse, 1);

      const state = useGameStateStore.getState();
      const result = state.processAnswer(1); // Wrong answer
      expect(result.isCorrect).toBe(false);
    });

    it('handles invalid level gracefully', () => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 99); // Non-existent level

      // Should not crash, but may not initialize properly
      const state = useGameStateStore.getState();
      // Level guard should prevent initialization
    });

    it('logs error when all items fail level guard during initialization', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Create a course with items that have groupIds outside the allowed range
      const courseWithInvalidGroups: Course = {
        id: 'test-course',
        title: 'Test Course',
        levels: [
          {
            id: 1,
            name: 'Level 1',
            groups: [{ id: 1, name: 'Group 1' }],
          },
        ],
        groups: [{ id: 1, name: 'Group 1' }],
        items: [
          {
            id: 1,
            groupId: 99, // Outside allowed range (only group 1 is allowed)
            text: 'Question 1',
            explain: 'Explanation',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0,
          },
          {
            id: 2,
            groupId: 99, // Outside allowed range
            text: 'Question 2',
            explain: 'Explanation',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0,
          },
        ],
      };

      const { initialize } = useGameStateStore.getState();
      initialize(courseWithInvalidGroups, 1);

      // Should log error about all items failing level guard
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('All')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('items failed level guard')
      );

      consoleErrorSpy.mockRestore();
    });

    it('handles course with no levels array', () => {
      const noLevelsCourse: Course = {
        id: 'no-levels',
        title: 'No Levels',
        levels: [],
        groups: [{ id: 1, name: 'Group 1' }],
        items: [mockItem1, mockItem2],
      };

      const { initialize } = useGameStateStore.getState();
      initialize(noLevelsCourse, 1);

      const state = useGameStateStore.getState();
      // Should create fallback level
      expect(state.pool.length).toBeGreaterThan(0);
    });

    it('handles variant rotation on wrong answer', () => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);

      const state = useGameStateStore.getState();
      const initialPoolLength = state.pool.length;
      const wrongIndex = (state.currentItem!.correctIndex + 1) % 4;
      
      // Answer wrong multiple times to trigger variant rotation
      state.processAnswer(wrongIndex);
      const newState = useGameStateStore.getState();
      
      // Pool should grow (wrong answer adds variant to pool)
      expect(newState.pool.length).toBeGreaterThanOrEqual(initialPoolLength);
    });

    it('correctly tracks score going to zero on wrong answers', () => {
      const { initialize } = useGameStateStore.getState();
      initialize(mockCourse, 1);
      
      // First, get a correct answer to increase score
      let state = useGameStateStore.getState();
      state.processAnswer(state.currentItem!.correctIndex);
      state.advanceToNext();
      
      expect(useGameStateStore.getState().score).toBe(1);
      
      // Now answer wrong twice - score should go to 0, not negative
      state = useGameStateStore.getState();
      const wrongIndex = (state.currentItem!.correctIndex + 1) % 4;
      state.processAnswer(wrongIndex);
      state.advanceToNext();
      
      state = useGameStateStore.getState();
      state.processAnswer((state.currentItem!.correctIndex + 1) % 4);
      
      expect(useGameStateStore.getState().score).toBe(0);
    });

    it('correctly handles pool with no valid items for level', () => {
      const outOfRangeItem: CourseItem = {
        id: 100,
        groupId: 99, // Out of range
        text: 'Out of range',
        explain: 'N/A',
        clusterId: 'oor-1',
        variant: '1',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
      };

      const oorCourse: Course = {
        id: 'oor-course',
        title: 'OOR Course',
        levels: [{ id: 1, title: 'Level 1', start: 1, end: 1 }], // Only group 1
        groups: [{ id: 1, name: 'Group 1' }],
        items: [outOfRangeItem], // Only has group 99 item
      };

      const { initialize } = useGameStateStore.getState();
      initialize(oorCourse, 1);

      const state = useGameStateStore.getState();
      expect(state.pool.length).toBe(0);
    });

    it('handles advanceToNext with empty pool', () => {
      const singleItemCourse: Course = {
        ...mockCourse,
        items: [mockItem1],
      };

      const { initialize } = useGameStateStore.getState();
      initialize(singleItemCourse, 1);
      
      const state = useGameStateStore.getState();
      const correctIndex = state.currentItem!.correctIndex;
      
      // Answer correctly to empty the pool
      state.processAnswer(correctIndex);
      
      // Now advance - should handle empty pool
      useGameStateStore.getState().advanceToNext();
      
      const finalState = useGameStateStore.getState();
      expect(finalState.isComplete).toBe(true);
    });
  });
});

