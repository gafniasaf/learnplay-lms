// supabase/functions/_shared/skeleton.test.ts

import { buildSkeleton } from './skeleton.ts';
import type { SkeletonParams, SkeletonCourse } from './skeleton.ts';

describe('buildSkeleton', () => {
  describe('Math courses', () => {
    it('should create skeleton for addition course', () => {
      const params: SkeletonParams = {
        subject: 'addition',
        grade: '1st Grade',
        itemsPerGroup: 10,
        levelsCount: 3,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.id).toBe('addition');
      expect(skeleton.subject).toBe('addition');
      expect(skeleton.gradeBand).toBe('1st Grade');
      expect(skeleton.contentVersion).toMatch(/^skeleton-/);
      expect(skeleton.groups).toHaveLength(1);
      expect(skeleton.groups[0].name).toBe('Addition');
      expect(skeleton.items).toHaveLength(10);
      expect(skeleton.levels).toHaveLength(3);
    });

    it('should create skeleton for multiplication and division course', () => {
      const params: SkeletonParams = {
        subject: 'multiplication and division',
        grade: '3rd Grade',
        itemsPerGroup: 12,
        mode: 'numeric',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.groups).toHaveLength(2);
      expect(skeleton.groups[0].name).toBe('Multiplication');
      expect(skeleton.groups[1].name).toBe('Division');
      expect(skeleton.items).toHaveLength(24); // 12 per group
      expect(skeleton.items.every(item => item.mode === 'numeric')).toBe(true);
    });

    it('should include math metadata for options mode', () => {
      const params: SkeletonParams = {
        subject: 'addition',
        grade: '1st Grade',
        itemsPerGroup: 5,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      skeleton.items.forEach(item => {
        expect(item._meta).toBeDefined();
        expect(item._meta?.op).toBe('add');
        expect(item._meta?.a).toBeGreaterThan(0);
        expect(item._meta?.b).toBeGreaterThan(0);
        expect(item._meta?.expected).toBe((item._meta?.a || 0) + (item._meta?.b || 0));
      });
    });

    it('should generate correct math metadata for subtraction', () => {
      const params: SkeletonParams = {
        subject: 'subtraction practice',
        grade: '2nd Grade',
        itemsPerGroup: 5,
        mode: 'numeric',
      };

      const skeleton = buildSkeleton(params);

      skeleton.items.forEach(item => {
        expect(item._meta?.op).toBe('sub');
        const { a = 0, b = 0, expected = 0 } = item._meta || {};
        expect(a).toBeGreaterThanOrEqual(b);
        expect(expected).toBe(a - b);
      });
    });

    it('should handle mixed operations math', () => {
      const params: SkeletonParams = {
        subject: 'addition and subtraction',
        grade: 'All Grades',
        itemsPerGroup: 8,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.groups).toHaveLength(2);
      expect(skeleton.items).toHaveLength(16);
    });
  });

  describe('Non-math courses', () => {
    it('should create skeleton for science course', () => {
      const params: SkeletonParams = {
        subject: 'human anatomy',
        grade: '5th Grade',
        itemsPerGroup: 12,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.groups.length).toBeGreaterThanOrEqual(2);
      expect(skeleton.groups.length).toBeLessThanOrEqual(3);
      expect(skeleton.items).toHaveLength(skeleton.groups.length * 12);
      expect(skeleton.items[0]._meta).toBeUndefined();
    });

    it('should create skeleton for language course', () => {
      const params: SkeletonParams = {
        subject: 'english grammar',
        grade: '4th Grade',
        itemsPerGroup: 10,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.groups.length).toBeGreaterThanOrEqual(2);
      expect(skeleton.items[0].text).toBe('__FILL__');
      expect(skeleton.items[0].mode).toBe('options');
    });
  });

  describe('Levels generation', () => {
    it('should create specified number of levels', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 20,
        levelsCount: 5,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.levels).toHaveLength(5);
      expect(skeleton.levels[0].id).toBe(1);
      expect(skeleton.levels[4].id).toBe(5);
    });

    it('should create default 3 levels when not specified', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 15,
        mode: 'numeric',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.levels).toHaveLength(3);
    });

    it('should cap levels at 6', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 30,
        levelsCount: 10,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.levels).toHaveLength(6);
    });

    it('should have correct level ranges', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 10,
        levelsCount: 2,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);
      const totalItems = skeleton.items.length;

      expect(skeleton.levels[0].start).toBe(0);
      expect(skeleton.levels[1].end).toBe(totalItems - 1);
    });
  });

  describe('Study texts', () => {
    it('should create study texts for math course', () => {
      const params: SkeletonParams = {
        subject: 'multiplication',
        grade: '3rd Grade',
        itemsPerGroup: 10,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.studyTexts).toBeDefined();
      expect(skeleton.studyTexts.length).toBeGreaterThan(0);
      expect(skeleton.studyTexts[0].content).toBe('__FILL__');
    });

    it('should have placeholders for LLM filling', () => {
      const params: SkeletonParams = {
        subject: 'science',
        grade: '5th Grade',
        itemsPerGroup: 10,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.studyTexts.length).toBeGreaterThan(0);
      skeleton.studyTexts.forEach(st => {
        expect(st.id).toBeDefined();
        expect(st.title).toBeDefined();
        expect(st.order).toBeGreaterThan(0);
      });
    });
  });

  describe('Deterministic behavior', () => {
    it('should generate identical skeletons for same params', () => {
      const params: SkeletonParams = {
        subject: 'addition',
        grade: '1st Grade',
        itemsPerGroup: 12,
        levelsCount: 3,
        mode: 'options',
      };

      const skeleton1 = buildSkeleton(params);
      const skeleton2 = buildSkeleton(params);

      expect(skeleton1.items.length).toBe(skeleton2.items.length);
      expect(skeleton1.groups.length).toBe(skeleton2.groups.length);
      
      skeleton1.items.forEach((item, idx) => {
        const item2 = skeleton2.items[idx];
        expect(item._meta).toEqual(item2._meta);
        expect(item.groupId).toBe(item2.groupId);
        expect(item.clusterId).toBe(item2.clusterId);
      });
    });

    it('should generate different skeletons for different params', () => {
      const params1: SkeletonParams = {
        subject: 'addition',
        grade: '1st Grade',
        itemsPerGroup: 12,
        mode: 'options',
      };

      const params2: SkeletonParams = {
        subject: 'multiplication',
        grade: '3rd Grade',
        itemsPerGroup: 12,
        mode: 'options',
      };

      const skeleton1 = buildSkeleton(params1);
      const skeleton2 = buildSkeleton(params2);

      expect(skeleton1.items[0]._meta?.op).not.toBe(skeleton2.items[0]._meta?.op);
    });
  });

  describe('Item structure', () => {
    it('should have proper item IDs', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 10,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      skeleton.items.forEach((item, idx) => {
        expect(item.id).toBe(idx);
      });
    });

    it('should assign items to correct groups', () => {
      const params: SkeletonParams = {
        subject: 'addition and subtraction',
        grade: null,
        itemsPerGroup: 8,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      const group0Items = skeleton.items.filter(item => item.groupId === 0);
      const group1Items = skeleton.items.filter(item => item.groupId === 1);

      expect(group0Items).toHaveLength(8);
      expect(group1Items).toHaveLength(8);
    });

    it('should have cluster IDs', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 9,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      skeleton.items.forEach(item => {
        expect(item.clusterId).toMatch(/^.*-cluster-\d+$/);
      });
    });

    it('should cycle variants 1-3', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 12,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      const variants = skeleton.items.map(item => item.variant);
      expect(variants).toContain('1');
      expect(variants).toContain('2');
      expect(variants).toContain('3');
    });
  });

  describe('Edge cases', () => {
    it('should handle null grade', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 10,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.gradeBand).toBe('All Grades');
    });

    it('should handle minimal items', () => {
      const params: SkeletonParams = {
        subject: 'test',
        grade: null,
        itemsPerGroup: 1,
        mode: 'numeric',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.items).toHaveLength(skeleton.groups.length);
    });

    it('should sanitize course ID', () => {
      const params: SkeletonParams = {
        subject: 'Test Subject With Spaces!',
        grade: null,
        itemsPerGroup: 5,
        mode: 'options',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.id).toBe('test-subject-with-spaces-');
    });

    it('should handle generic math subject', () => {
      const params: SkeletonParams = {
        subject: 'math',
        grade: null,
        itemsPerGroup: 10,
        mode: 'numeric',
      };

      const skeleton = buildSkeleton(params);

      expect(skeleton.groups.length).toBeGreaterThan(0);
      expect(skeleton.items[0]._meta).toBeDefined();
    });
  });
});
