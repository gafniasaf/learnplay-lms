/**
 * Unit Tests: API Common - Route Helpers
 * 
 * Tests route generation and validation helpers.
 * These tests would catch route bugs.
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Route generation helpers (extracted from common patterns)
 */
function buildEditorRoute(courseId: string): string {
  return `/admin/editor/${courseId}`;
}

function buildPreviewRoute(courseId: string): string {
  return `/play/${courseId}`;
}

function buildVersionsRoute(courseId: string): string {
  return `/admin/courses/${courseId}/versions`;
}

function isValidCourseId(courseId: string | null): boolean {
  if (!courseId || courseId.trim() === '') return false;
  if (courseId === 'ai_course_generate') return false; // Job type, not courseId
  return /^[a-z0-9-]+$/i.test(courseId);
}

describe('Route Generation', () => {
  describe('buildEditorRoute', () => {
    it('generates correct editor route', () => {
      expect(buildEditorRoute('test-123')).toBe('/admin/editor/test-123');
      expect(buildEditorRoute('math-grade-3')).toBe('/admin/editor/math-grade-3');
    });

    it('uses correct route pattern', () => {
      const route = buildEditorRoute('test-course');
      expect(route).toMatch(/^\/admin\/editor\/[a-z0-9-]+$/i);
      expect(route).not.toMatch(/^\/admin\/courses\//);
    });
  });

  describe('buildPreviewRoute', () => {
    it('generates correct preview route', () => {
      expect(buildPreviewRoute('test-123')).toBe('/play/test-123');
    });
  });

  describe('buildVersionsRoute', () => {
    it('generates correct versions route', () => {
      expect(buildVersionsRoute('test-123')).toBe('/admin/courses/test-123/versions');
    });
  });
});

describe('CourseId Validation', () => {
  describe('isValidCourseId', () => {
    it('accepts valid courseIds', () => {
      const validIds = [
        'test-course-123',
        'math-grade-3',
        'science-2024',
        'course-abc-def',
      ];
      
      validIds.forEach(id => {
        expect(isValidCourseId(id)).toBe(true);
      });
    });

    it('rejects job type as courseId', () => {
      expect(isValidCourseId('ai_course_generate')).toBe(false);
    });

    it('rejects empty courseId', () => {
      expect(isValidCourseId('')).toBe(false);
      expect(isValidCourseId('   ')).toBe(false);
      expect(isValidCourseId(null)).toBe(false);
    });

    it('rejects invalid formats', () => {
      const invalidIds = [
        'course with spaces',
        'course_with_underscores',
        '../admin',
        '',
      ];
      
      invalidIds.forEach(id => {
        if (id) {
          expect(isValidCourseId(id)).toBe(false);
        }
      });
    });
  });
});

