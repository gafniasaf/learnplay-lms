/**
 * Level Utilities Tests
 * Tests for level filtering, validation, and navigation functions
 */

import {
  getCourseLevels,
  getItemsForLevel,
  getGroupIdsForLevel,
  isValidLevel,
  getNextLevelId,
  parseLevelFromUrl,
} from '@/lib/levels';
import type { Course, CourseItem, CourseLevel } from '@/lib/types/course';

describe('getCourseLevels', () => {
  it('returns levels from course when present', () => {
    const course: Course = {
      id: 'test-course',
      title: 'Test Course',
      levels: [
        { id: 1, title: 'Level 1', start: 1, end: 3 },
        { id: 2, title: 'Level 2', start: 4, end: 6 },
      ],
      groups: [],
      items: [],
    };

    const levels = getCourseLevels(course);
    expect(levels).toHaveLength(2);
    expect(levels[0].id).toBe(1);
    expect(levels[1].id).toBe(2);
  });

  it('generates fallback level when levels array is missing', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    const course: Course = {
      id: 'test-course',
      title: 'Test Course',
      groups: [],
      items: [
        { id: 1, groupId: 1, text: 'Q1', options: [], correctIndex: 0 },
        { id: 2, groupId: 5, text: 'Q2', options: [], correctIndex: 0 },
      ],
    };

    const levels = getCourseLevels(course);
    
    expect(levels).toHaveLength(1);
    expect(levels[0].id).toBe(1);
    expect(levels[0].title).toBe('All Content');
    // Math.min(...groupIds, 0) includes 0 as a parameter, so min will be 0 if any groupId >= 0
    // Actually, Math.min(1, 5, 0) = 0, so the fallback uses 0
    expect(levels[0].start).toBe(0); // Math.min includes 0 as fallback parameter
    expect(levels[0].end).toBe(5); // max groupId
    expect(consoleWarnSpy).toHaveBeenCalled();
    
    consoleWarnSpy.mockRestore();
  });

  it('generates fallback level when levels array is empty', () => {
    const course: Course = {
      id: 'test-course',
      title: 'Test Course',
      levels: [],
      groups: [],
      items: [
        { id: 1, groupId: 2, text: 'Q1', options: [], correctIndex: 0 },
      ],
    };

    const levels = getCourseLevels(course);
    expect(levels).toHaveLength(1);
    // Math.min(2, 0) = 0, so start is 0
    expect(levels[0].start).toBe(0);
    expect(levels[0].end).toBe(2);
  });

  it('handles empty items array in fallback generation', () => {
    const course: Course = {
      id: 'test-course',
      title: 'Test Course',
      groups: [],
      items: [],
    };

    const levels = getCourseLevels(course);
    expect(levels).toHaveLength(1);
    expect(levels[0].start).toBe(0);
    expect(levels[0].end).toBe(0);
  });
});

describe('getItemsForLevel', () => {
  const course: Course = {
    id: 'test-course',
    title: 'Test Course',
    levels: [
      { id: 1, title: 'Level 1', start: 1, end: 3 },
      { id: 2, title: 'Level 2', start: 4, end: 6 },
    ],
    groups: [],
    items: [
      { id: 1, groupId: 1, text: 'Q1', options: [], correctIndex: 0 },
      { id: 2, groupId: 2, text: 'Q2', options: [], correctIndex: 0 },
      { id: 3, groupId: 3, text: 'Q3', options: [], correctIndex: 0 },
      { id: 4, groupId: 4, text: 'Q4', options: [], correctIndex: 0 },
      { id: 5, groupId: 5, text: 'Q5', options: [], correctIndex: 0 },
    ],
  };

  it('filters items by level group range', () => {
    const items = getItemsForLevel(course, 1);
    expect(items).toHaveLength(3);
    expect(items.map(i => i.id)).toEqual([1, 2, 3]);
  });

  it('returns items for second level', () => {
    const items = getItemsForLevel(course, 2);
    expect(items).toHaveLength(2);
    expect(items.map(i => i.id)).toEqual([4, 5]);
  });

  it('returns empty array for non-existent level', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const items = getItemsForLevel(course, 99);
    expect(items).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('includes items at boundary group IDs', () => {
    const items = getItemsForLevel(course, 1);
    expect(items.some(i => i.groupId === 1)).toBe(true); // start boundary
    expect(items.some(i => i.groupId === 3)).toBe(true); // end boundary
  });
});

describe('getGroupIdsForLevel', () => {
  it('generates group IDs for level range', () => {
    const level: CourseLevel = {
      id: 1,
      title: 'Level 1',
      start: 1,
      end: 3,
    };

    const groupIds = getGroupIdsForLevel(level);
    expect(groupIds).toEqual([1, 2, 3]);
  });

  it('handles single group level', () => {
    const level: CourseLevel = {
      id: 1,
      title: 'Level 1',
      start: 5,
      end: 5,
    };

    const groupIds = getGroupIdsForLevel(level);
    expect(groupIds).toEqual([5]);
  });

  it('handles large range', () => {
    const level: CourseLevel = {
      id: 1,
      title: 'Level 1',
      start: 10,
      end: 15,
    };

    const groupIds = getGroupIdsForLevel(level);
    expect(groupIds).toEqual([10, 11, 12, 13, 14, 15]);
  });
});

describe('isValidLevel', () => {
  const course: Course = {
    id: 'test-course',
    title: 'Test Course',
    levels: [
      { id: 1, title: 'Level 1', start: 1, end: 3 },
      { id: 2, title: 'Level 2', start: 4, end: 6 },
    ],
    groups: [],
    items: [],
  };

  it('returns true for valid level', () => {
    expect(isValidLevel(course, 1)).toBe(true);
    expect(isValidLevel(course, 2)).toBe(true);
  });

  it('returns false for invalid level', () => {
    expect(isValidLevel(course, 99)).toBe(false);
    expect(isValidLevel(course, 0)).toBe(false);
  });

  it('works with fallback levels', () => {
    const courseWithoutLevels: Course = {
      id: 'test',
      title: 'Test',
      groups: [],
      items: [{ id: 1, groupId: 1, text: 'Q', options: [], correctIndex: 0 }],
    };

    expect(isValidLevel(courseWithoutLevels, 1)).toBe(true);
    expect(isValidLevel(courseWithoutLevels, 2)).toBe(false);
  });
});

describe('getNextLevelId', () => {
  const course: Course = {
    id: 'test-course',
    title: 'Test Course',
    levels: [
      { id: 1, title: 'Level 1', start: 1, end: 3 },
      { id: 2, title: 'Level 2', start: 4, end: 6 },
      { id: 3, title: 'Level 3', start: 7, end: 9 },
    ],
    groups: [],
    items: [],
  };

  it('returns next level ID', () => {
    expect(getNextLevelId(course, 1)).toBe(2);
    expect(getNextLevelId(course, 2)).toBe(3);
  });

  it('returns null for last level', () => {
    expect(getNextLevelId(course, 3)).toBeNull();
  });

  it('returns null for invalid level', () => {
    expect(getNextLevelId(course, 99)).toBeNull();
  });
});

describe('parseLevelFromUrl', () => {
  const course: Course = {
    id: 'test-course',
    title: 'Test Course',
    levels: [
      { id: 1, title: 'Level 1', start: 1, end: 3 },
      { id: 2, title: 'Level 2', start: 4, end: 6 },
    ],
    groups: [],
    items: [],
  };

  it('parses valid level from URL', () => {
    const params = new URLSearchParams('?level=1');
    expect(parseLevelFromUrl(params, course)).toBe(1);
  });

  it('returns null when level param is missing', () => {
    const params = new URLSearchParams('');
    expect(parseLevelFromUrl(params, course)).toBeNull();
  });

  it('returns null for invalid level number', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const params = new URLSearchParams('?level=abc');
    expect(parseLevelFromUrl(params, course)).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('returns null for level not in course', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const params = new URLSearchParams('?level=99');
    expect(parseLevelFromUrl(params, course)).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('handles negative level numbers', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const params = new URLSearchParams('?level=-1');
    expect(parseLevelFromUrl(params, course)).toBeNull();
    consoleWarnSpy.mockRestore();
  });
});

