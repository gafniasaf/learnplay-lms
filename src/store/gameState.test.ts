import { useGameStateStore } from './gameState';
import type { Course } from '@/lib/types/course';

function buildCourse(): Course {
  return {
    id: 'c1',
    title: 'Course',
    groups: [
      { id: 1, name: 'G1' },
      { id: 2, name: 'G2' },
    ],
    levels: [
      { id: 1, title: 'L1', start: 1, end: 2 },
    ],
    items: [
      { id: 1, groupId: 1, text: 'A _', explain: 'e', clusterId: 'x', variant: '1', options: ['a','b'], correctIndex: 0 },
      { id: 2, groupId: 1, text: 'B _', explain: 'e', clusterId: 'x', variant: '2', options: ['a','b'], correctIndex: 0 },
      { id: 3, groupId: 2, text: 'C _', explain: 'e', clusterId: '', variant: '', options: ['a','b'], correctIndex: 1 },
    ],
  };
}

describe('useGameStateStore', () => {
  beforeEach(() => {
    // reset store between tests
    const { reset } = useGameStateStore.getState();
    // reset only works after initialize; ensure fresh store by setting directly
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
      initialize: useGameStateStore.getState().initialize,
      processAnswer: useGameStateStore.getState().processAnswer,
      advanceToNext: useGameStateStore.getState().advanceToNext,
      reset: useGameStateStore.getState().reset,
      incrementTime: useGameStateStore.getState().incrementTime,
    });
  });

  it('initializes pool and selects current item', () => {
    const course = buildCourse();
    useGameStateStore.getState().initialize(course, 1);
    const s = useGameStateStore.getState();
    expect(s.poolSize).toBe(3);
    expect(s.currentItem).not.toBeNull();
  });

  it('removes item on correct answer and increments score', () => {
    const course = buildCourse();
    useGameStateStore.getState().initialize(course, 1);
    const before = useGameStateStore.getState();
    const correctIdx = before.currentItem!.correctIndex;
    const res = useGameStateStore.getState().processAnswer(correctIdx);
    const after = useGameStateStore.getState();
    expect(res.isCorrect).toBe(true);
    expect(after.pool.length).toBe(before.pool.length - 1);
    expect(after.score).toBe(1);
  });

  it('enqueues variant on wrong answer and increments mistakes', () => {
    const course = buildCourse();
    useGameStateStore.getState().initialize(course, 1);
    const before = useGameStateStore.getState();
    const wrongIdx = before.currentItem!.correctIndex === 0 ? 1 : 0;
    const res = useGameStateStore.getState().processAnswer(wrongIdx);
    const after = useGameStateStore.getState();
    expect(res.isCorrect).toBe(false);
    expect(after.pool.length).toBe(before.pool.length + 1);
    expect(after.mistakes).toBe(1);
  });
});


