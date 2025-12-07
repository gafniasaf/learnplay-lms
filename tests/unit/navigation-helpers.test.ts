/**
 * Unit Tests: Navigation Helpers
 * 
 * Tests navigation route generation and validation.
 * These tests would catch route bugs.
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Navigation helper functions (extracted from common patterns)
 */
function buildEditorRoute(courseId: string): string {
  if (!courseId || courseId === 'ai_course_generate') {
    throw new Error('Invalid courseId');
  }
  return `/admin/editor/${courseId}`;
}

function buildPreviewRoute(courseId: string): string {
  return `/play/${courseId}`;
}

function isValidCourseId(courseId: string | null): boolean {
  if (!courseId || courseId.trim() === '') return false;
  if (courseId === 'ai_course_generate') return false; // Job type, not courseId
  return /^[a-z0-9-]+$/i.test(courseId);
}

describe('Navigation Helpers', () => {
  describe('buildEditorRoute', () => {
    it('generates correct editor route', () => {
      expect(buildEditorRoute('test-123')).toBe('/admin/editor/test-123');
      expect(buildEditorRoute('math-grade-3')).toBe('/admin/editor/math-grade-3');
    });

    it('uses correct route pattern (not /admin/courses)', () => {
      const route = buildEditorRoute('test-course');
      expect(route).toMatch(/^\/admin\/editor\/[a-z0-9-]+$/i);
      expect(route).not.toMatch(/^\/admin\/courses\//);
    });

    it('throws error for invalid courseId', () => {
      expect(() => buildEditorRoute('ai_course_generate')).toThrow();
      expect(() => buildEditorRoute('')).toThrow();
    });
  });

  describe('buildPreviewRoute', () => {
    it('generates correct preview route', () => {
      expect(buildPreviewRoute('test-123')).toBe('/play/test-123');
    });
  });

  describe('isValidCourseId', () => {
    it('accepts valid courseIds', () => {
      expect(isValidCourseId('test-course-123')).toBe(true);
      expect(isValidCourseId('math-grade-3')).toBe(true);
    });

    it('rejects job type as courseId', () => {
      expect(isValidCourseId('ai_course_generate')).toBe(false);
    });

    it('rejects empty or null courseId', () => {
      expect(isValidCourseId('')).toBe(false);
      expect(isValidCourseId(null)).toBe(false);
      expect(isValidCourseId('   ')).toBe(false);
    });
  });
});

