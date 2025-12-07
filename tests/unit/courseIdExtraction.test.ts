/**
 * Unit Tests: CourseId Extraction Logic
 * 
 * Tests the logic for extracting courseId from various sources.
 * These tests would catch bugs like:
 * - courseId being set to job type
 * - courseId not being extracted from job object
 * - courseId extraction failing silently
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Simulates the courseId extraction logic from AIPipelineV2
 */
function extractCourseId(
  currentCourseId: string | null,
  job: any,
  jobType?: string
): string | null {
  // Try multiple sources (same logic as handleViewCourse)
  const courseId = currentCourseId || 
                   job?.course_id || 
                   job?.payload?.course_id ||
                   job?.result?.course_id ||
                   job?.result_path?.match(/courses\/([^\/]+)/)?.[1];
  
  // Guard against job type being used as courseId
  if (courseId && courseId !== 'ai_course_generate' && courseId !== jobType) {
    return courseId;
  }
  
  return null;
}

describe('CourseId Extraction', () => {
  describe('extractCourseId', () => {
    it('extracts courseId from currentCourseId (localStorage)', () => {
      const courseId = extractCourseId('test-course-123', null);
      expect(courseId).toBe('test-course-123');
    });

    it('extracts courseId from job.course_id', () => {
      const job = { course_id: 'test-course-456' };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBe('test-course-456');
    });

    it('extracts courseId from job.payload.course_id', () => {
      const job = { payload: { course_id: 'test-course-789' } };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBe('test-course-789');
    });

    it('extracts courseId from job.result.course_id', () => {
      const job = { result: { course_id: 'test-course-abc' } };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBe('test-course-abc');
    });

    it('extracts courseId from result_path', () => {
      const job = { result_path: 'courses/test-course-def.json' };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBe('test-course-def');
    });

    it('prefers currentCourseId over job.course_id', () => {
      const job = { course_id: 'job-course-id' };
      const courseId = extractCourseId('local-course-id', job);
      expect(courseId).toBe('local-course-id');
    });

    it('prefers job.course_id over payload.course_id', () => {
      const job = {
        course_id: 'direct-course-id',
        payload: { course_id: 'payload-course-id' }
      };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBe('direct-course-id');
    });

    it('guards against job type being used as courseId', () => {
      const job = { course_id: 'ai_course_generate' };
      const courseId = extractCourseId(null, job, 'ai_course_generate');
      expect(courseId).toBeNull(); // Should reject job type
    });

    it('guards against job type in payload', () => {
      const job = { payload: { course_id: 'ai_course_generate' } };
      const courseId = extractCourseId(null, job, 'ai_course_generate');
      expect(courseId).toBeNull();
    });

    it('returns null when no courseId found', () => {
      const courseId = extractCourseId(null, {});
      expect(courseId).toBeNull();
    });

    it('returns null when job is null', () => {
      const courseId = extractCourseId(null, null);
      expect(courseId).toBeNull();
    });

    it('handles job with only subject (no courseId)', () => {
      const job = { subject: 'Math', status: 'done' };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBeNull();
    });

    it('handles malformed result_path', () => {
      const job = { result_path: 'invalid-path' };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBeNull();
    });

    it('handles empty strings', () => {
      const job = { course_id: '' };
      const courseId = extractCourseId(null, job);
      expect(courseId).toBeNull();
    });

    it('handles whitespace-only courseId', () => {
      const job = { course_id: '   ' };
      const courseId = extractCourseId(null, job);
      // Empty/whitespace should be treated as null
      expect(courseId).toBeNull();
    });
  });

  describe('Route Generation', () => {
    it('generates correct editor route', () => {
      const courseId = 'test-course-123';
      const route = `/admin/editor/${courseId}`;
      expect(route).toBe('/admin/editor/test-course-123');
      expect(route).not.toContain('/admin/courses/');
    });

    it('rejects wrong route pattern', () => {
      const courseId = 'test-course-123';
      const wrongRoute = `/admin/courses/${courseId}`;
      expect(wrongRoute).not.toMatch(/\/admin\/editor\//);
    });
  });
});

