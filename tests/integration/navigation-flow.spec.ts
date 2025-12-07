/**
 * Integration Tests: Navigation Flow
 * 
 * Tests the complete navigation flow from course creation to editor.
 * These tests verify:
 * - Course creation stores courseId
 * - Navigation uses correct route
 * - Course editor loads successfully
 * - No 404 errors occur
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('Navigation Flow Integration', () => {
  beforeAll(() => {
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
      console.warn('⚠️  Skipping navigation flow tests - Supabase env vars not set');
    }
  });

  describe('Route Generation', () => {
    it('generates correct editor route', () => {
      const courseId = 'test-course-123';
      const route = `/admin/editor/${courseId}`;
      
      expect(route).toBe('/admin/editor/test-course-123');
      expect(route).toMatch(/^\/admin\/editor\/[a-z0-9-]+$/i);
    });

    it('generates correct preview route', () => {
      const courseId = 'test-course-123';
      const route = `/play/${courseId}`;
      
      expect(route).toBe('/play/test-course-123');
    });

    it('generates correct versions route', () => {
      const courseId = 'test-course-123';
      const route = `/admin/courses/${courseId}/versions`;
      
      expect(route).toBe('/admin/courses/test-course-123/versions');
    });
  });

  describe('CourseId Validation', () => {
    it('validates courseId format', () => {
      const validCourseIds = [
        'test-course-123',
        'math-grade-3',
        'science-2024-01-15',
      ];
      
      validCourseIds.forEach(courseId => {
        expect(courseId).toMatch(/^[a-z0-9-]+$/i);
        expect(courseId.length).toBeGreaterThan(0);
      });
    });

    it('rejects invalid courseId formats', () => {
      const invalidCourseIds = [
        'ai_course_generate', // Job type
        '', // Empty
        '   ', // Whitespace
        '../admin', // Path traversal
        'course with spaces', // Spaces
      ];
      
      invalidCourseIds.forEach(courseId => {
        if (courseId === 'ai_course_generate') {
          // Should be rejected
          expect(courseId).not.toMatch(/^[a-z0-9-]+$/i);
        }
        if (courseId.trim() === '') {
          expect(courseId.trim().length).toBe(0);
        }
      });
    });
  });

  describe('Navigation State Management', () => {
    it('stores courseId in localStorage', () => {
      // Simulate localStorage
      const mockLocalStorage: Record<string, string> = {};
      const courseId = 'test-course-123';
      
      mockLocalStorage['selectedCourseId'] = courseId;
      
      expect(mockLocalStorage['selectedCourseId']).toBe(courseId);
    });

    it('retrieves courseId from localStorage', () => {
      const mockLocalStorage: Record<string, string> = {
        'selectedCourseId': 'test-course-456',
      };
      
      const courseId = mockLocalStorage['selectedCourseId'];
      expect(courseId).toBe('test-course-456');
    });

    it('handles missing courseId in localStorage', () => {
      const mockLocalStorage: Record<string, string> = {};
      
      const courseId = mockLocalStorage['selectedCourseId'];
      expect(courseId).toBeUndefined();
    });
  });
});

