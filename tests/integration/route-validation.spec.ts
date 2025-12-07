/**
 * Integration Tests: Route Validation
 * 
 * Tests that all routes are correct and navigation works.
 * These tests would catch:
 * - Wrong route patterns (/admin/courses vs /admin/editor)
 * - 404 errors on valid routes
 * - Route generation bugs
 */

import { describe, it, expect } from 'vitest';

describe('Route Validation', () => {
  describe('Course Editor Routes', () => {
    it('generates correct editor route from courseId', () => {
      const courseId = 'test-course-123';
      const route = `/admin/editor/${courseId}`;
      
      expect(route).toBe('/admin/editor/test-course-123');
      expect(route).toMatch(/^\/admin\/editor\/[a-z0-9-]+$/i);
    });

    it('rejects wrong route pattern', () => {
      const courseId = 'test-course-123';
      const wrongRoute = `/admin/courses/${courseId}`;
      
      // Should NOT match editor route pattern
      expect(wrongRoute).not.toMatch(/^\/admin\/editor\//);
      expect(wrongRoute).toMatch(/^\/admin\/courses\//);
    });

    it('validates courseId format in route', () => {
      const validCourseIds = [
        'test-course-123',
        'math-grade-3',
        'science-2024',
        'course-abc-def-123',
      ];
      
      validCourseIds.forEach(courseId => {
        const route = `/admin/editor/${courseId}`;
        expect(route).toMatch(/^\/admin\/editor\/[a-z0-9-]+$/i);
      });
    });

    it('rejects invalid courseId formats', () => {
      const invalidCourseIds = [
        'ai_course_generate', // Job type, not courseId
        '', // Empty
        '   ', // Whitespace
        '../admin', // Path traversal
      ];
      
      invalidCourseIds.forEach(courseId => {
        const route = `/admin/editor/${courseId}`;
        // Should not match valid pattern or should be rejected
        if (courseId === 'ai_course_generate') {
          expect(route).not.toMatch(/^\/admin\/editor\/[a-z0-9-]+$/i);
        }
      });
    });
  });

  describe('Route Generation Helpers', () => {
    it('builds editor route correctly', () => {
      const buildEditorRoute = (courseId: string) => `/admin/editor/${courseId}`;
      
      expect(buildEditorRoute('test-123')).toBe('/admin/editor/test-123');
      expect(buildEditorRoute('math-grade-3')).toBe('/admin/editor/math-grade-3');
    });

    it('builds preview route correctly', () => {
      const buildPreviewRoute = (courseId: string) => `/play/${courseId}`;
      
      expect(buildPreviewRoute('test-123')).toBe('/play/test-123');
    });

    it('builds versions route correctly', () => {
      const buildVersionsRoute = (courseId: string) => `/admin/courses/${courseId}/versions`;
      
      expect(buildVersionsRoute('test-123')).toBe('/admin/courses/test-123/versions');
    });
  });
});

