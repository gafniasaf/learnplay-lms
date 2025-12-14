/**
 * Tests for courseAdapter
 * Tests course data transformation, version migration, normalization
 */

import { parseMedJson } from '@/lib/adapters/courseAdapter';
import type { Course } from '@/lib/types/course';

describe('courseAdapter', () => {
  describe('parseMedJson', () => {
    it('parses basic course structure', () => {
      const raw = {
        id: 'test-course',
        title: 'Test Course',
        description: 'A test course',
        levels: [
          { id: 1, start: 1, end: 10, title: 'Level 1' },
        ],
        groups: [
          { id: 1, name: 'Group 1' },
        ],
        items: [
          {
            id: 1,
            groupId: 1,
            text: 'Question?',
            explain: 'Explanation',
            options: ['A', 'B', 'C'],
            correctIndex: 0,
          },
        ],
      };

      const course = parseMedJson(raw);

      expect(course.id).toBe('test-course');
      expect(course.title).toBe('Test Course');
      expect(course.description).toBe('A test course');
      expect(course.levels).toHaveLength(1);
      expect(course.groups).toHaveLength(1);
      expect(course.items).toHaveLength(1);
    });

    it('generates default title when missing', () => {
      const raw = {
        id: 'modals',
        levels: [],
        groups: [],
        items: [],
      };

      const course = parseMedJson(raw);
      expect(course.title).toBe('English Modals');
    });

    it('generates default description when missing', () => {
      const raw = {
        id: 'test-course',
        title: 'Test Course',
        levels: [],
        groups: [],
        items: [],
      };

      const course = parseMedJson(raw);
      expect(course.description).toContain('Learn');
    });

    it('normalizes placeholders from underscore to [blank]', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [],
        items: [
          {
            id: 1,
            groupId: 1,
            text: 'Fill _ blank',
            explain: 'Explanation',
            options: ['A', 'B'],
            correctIndex: 0,
          },
        ],
      };

      const course = parseMedJson(raw);
      expect(course.items[0].text).toContain('[blank]');
      expect(course.items[0].text).not.toContain(' _ ');
    });

    it('generates wrong explanations when missing', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [],
        items: [
          {
            id: 1,
            groupId: 1,
            text: 'Question?',
            explain: 'Correct explanation',
            options: ['Correct', 'Wrong 1', 'Wrong 2'],
            correctIndex: 0,
          },
        ],
      };

      const course = parseMedJson(raw);
      expect(course.items[0].wrongExplanations).toBeDefined();
      expect(course.items[0].wrongExplanations?.length).toBe(3);
      expect(course.items[0].wrongExplanations?.[0]).toBe('Correct explanation');
      expect(course.items[0].wrongExplanations?.[1]).toContain('Wrong 1');
    });

    it('assigns default colors to groups', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [
          { id: 1, name: 'Group 1' },
          { id: 2, name: 'Group 2' },
        ],
        items: [],
      };

      const course = parseMedJson(raw);
      expect(course.groups[0].color).toBe('blue');
      expect(course.groups[1].color).toBe('green');
    });

    it('preserves existing group colors', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [
          { id: 1, name: 'Group 1', color: 'red' },
        ],
        items: [],
      };

      const course = parseMedJson(raw);
      expect(course.groups[0].color).toBe('red');
    });

    it('handles numeric mode items', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [],
        items: [
          {
            id: 1,
            groupId: 1,
            text: 'What is 2+2?',
            explain: 'Four',
            mode: 'numeric',
            answer: 4,
            options: [],
            correctIndex: 0,
          },
        ],
      };

      const course = parseMedJson(raw);
      expect(course.items[0].mode).toBe('numeric');
      expect(course.items[0].answer).toBe(4);
    });

    it('handles items with clusterId', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [],
        items: [
          {
            id: 1,
            groupId: 1,
            text: 'Question?',
            explain: 'Explanation',
            clusterId: 'cluster-123',
            options: ['A', 'B'],
            correctIndex: 0,
          },
        ],
      };

      const course = parseMedJson(raw);
      expect(course.items[0].clusterId).toBe('cluster-123');
    });

    it('handles items with variant', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [],
        items: [
          {
            id: 1,
            groupId: 1,
            text: 'Question?',
            explain: 'Explanation',
            variant: '2',
            options: ['A', 'B'],
            correctIndex: 0,
          },
        ],
      };

      const course = parseMedJson(raw);
      expect(course.items[0].variant).toBe('2');
    });

    it('handles items with hints', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [],
        items: [
          {
            id: 1,
            groupId: 1,
            text: 'Question?',
            explain: 'Explanation',
            hint: 'This is a hint',
            options: ['A', 'B'],
            correctIndex: 0,
          },
        ],
      };

      const course = parseMedJson(raw);
      expect(course.items[0].hint).toBe('This is a hint');
    });

    it('uses courseId parameter when id missing', () => {
      const raw = {
        title: 'Test',
        levels: [],
        groups: [],
        items: [],
      };

      const course = parseMedJson(raw, 'provided-id');
      expect(course.id).toBe('provided-id');
    });

    it('handles empty arrays', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [],
        groups: [],
        items: [],
      };

      const course = parseMedJson(raw);
      expect(course.levels).toEqual([]);
      expect(course.groups).toEqual([]);
      expect(course.items).toEqual([]);
    });

    it('handles multiple levels', () => {
      const raw = {
        id: 'test',
        title: 'Test',
        levels: [
          { id: 1, start: 1, end: 10, title: 'Level 1' },
          { id: 2, start: 11, end: 20, title: 'Level 2' },
        ],
        groups: [],
        items: [],
      };

      const course = parseMedJson(raw);
      expect(course.levels).toHaveLength(2);
      expect(course.levels[0].title).toBe('Level 1');
      expect(course.levels[1].title).toBe('Level 2');
    });
  });
});


