import { getCourseLevels, getItemsForLevel, getGroupIdsForLevel, isValidLevel, getNextLevelId, parseLevelFromUrl } from './levels';
import type { Course } from '@/lib/types/course';

const baseCourse: Course = {
  id: 'c',
  title: 'Course',
  groups: [
    { id: 1, name: 'G1' },
    { id: 2, name: 'G2' },
    { id: 3, name: 'G3' },
  ],
  levels: [
    { id: 1, title: 'L1', start: 1, end: 2 },
    { id: 2, title: 'L2', start: 3, end: 3 },
  ],
  items: [
    { id: 1, groupId: 1, text: 'A _', explain: 'e', clusterId: '', variant: '', options: ['a','b'], correctIndex: 0 },
    { id: 2, groupId: 2, text: 'B _', explain: 'e', clusterId: '', variant: '', options: ['a','b'], correctIndex: 0 },
    { id: 3, groupId: 3, text: 'C _', explain: 'e', clusterId: '', variant: '', options: ['a','b'], correctIndex: 0 },
  ],
};

describe('levels utils', () => {
  it('returns course levels', () => {
    expect(getCourseLevels(baseCourse).length).toBe(2);
  });

  it('filters items by level range', () => {
    const items = getItemsForLevel(baseCourse, 1);
    expect(items.map(i => i.id)).toEqual([1,2]);
  });

  it('group ids for level are inclusive and sorted', () => {
    expect(getGroupIdsForLevel(baseCourse.levels[0])).toEqual([1,2]);
  });

  it('validates and parses level from URL', () => {
    const params = new URLSearchParams('level=2');
    expect(isValidLevel(baseCourse, 2)).toBe(true);
    expect(parseLevelFromUrl(params, baseCourse)).toBe(2);
  });

  it('gets next level id', () => {
    expect(getNextLevelId(baseCourse, 1)).toBe(2);
    expect(getNextLevelId(baseCourse, 2)).toBeNull();
  });

  it('generates fallback levels when missing', () => {
    const course: Course = {
      ...baseCourse,
      levels: [],
    };
    const levels = getCourseLevels(course);
    expect(levels.length).toBe(1);
    // Fallback uses min/max from items, which are 1..3
    expect(levels[0].start).toBeLessThanOrEqual(1);
    expect(levels[0].end).toBeGreaterThanOrEqual(3);
  });

  it('returns empty items and null on invalid level parsing', () => {
    const empty = getItemsForLevel(baseCourse, 999);
    expect(empty).toEqual([]);
    const badNum = parseLevelFromUrl(new URLSearchParams('level=abc'), baseCourse);
    expect(badNum).toBeNull();
    const notFound = parseLevelFromUrl(new URLSearchParams('level=99'), baseCourse);
    expect(notFound).toBeNull();
  });
});


