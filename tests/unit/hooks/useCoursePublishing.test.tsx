/**
 * Tests for useCoursePublishing hook
 * Tests publish, archive, delete logic
 */

// Mock dependencies BEFORE imports
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));
jest.mock('@/lib/api/publishCourse');
jest.mock('@/lib/utils/cacheInvalidation');

import { renderHook, act } from '@testing-library/react';
import { useCoursePublishing } from '@/pages/admin/editor/hooks/useCoursePublishing';
import { useMCP } from '@/hooks/useMCP';
import { publishCourse } from '@/lib/api/publishCourse';
import { invalidateCourseCache } from '@/lib/utils/cacheInvalidation';

const mockMCP = {
  call: jest.fn(),
};

const mockPublishCourse = publishCourse as jest.MockedFunction<typeof publishCourse>;
const mockInvalidateCache = invalidateCourseCache as jest.MockedFunction<typeof invalidateCourseCache>;

beforeEach(() => {
  jest.clearAllMocks();
  (useMCP as jest.Mock).mockReturnValue(mockMCP);
  mockInvalidateCache.mockResolvedValue(undefined);
});

describe('useCoursePublishing', () => {
  describe('publishWithPreflight', () => {
    it('publishes course after validation', async () => {
      mockMCP.call
        .mockResolvedValueOnce({ ok: true }) // validateCourseStructure
        .mockResolvedValueOnce({ ok: true, report: { coverage: 0.95 } }); // generateVariantsAudit
      mockPublishCourse.mockResolvedValue({ version: 2 });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        const publishResult = await result.current.publishWithPreflight(
          'course-123',
          'Fixed bugs',
          0.8
        );
        expect(publishResult.version).toBe(2);
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.validateCourseStructure', {
        courseId: 'course-123',
      });
      expect(mockMCP.call).toHaveBeenCalledWith('lms.generateVariantsAudit', {
        courseId: 'course-123',
      });
      expect(mockPublishCourse).toHaveBeenCalledWith('course-123', 'Fixed bugs');
      expect(mockInvalidateCache).toHaveBeenCalledWith('course-123');
    });

    it('throws error when validation fails', async () => {
      mockMCP.call.mockResolvedValueOnce({
        ok: false,
        issues: ['Issue 1', 'Issue 2'],
      });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        await expect(
          result.current.publishWithPreflight('course-123', 'Changelog', 0.8)
        ).rejects.toThrow('Validation failed: Issue 1, Issue 2');
      });
    });

    it('throws error when audit fails', async () => {
      mockMCP.call
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        await expect(
          result.current.publishWithPreflight('course-123', 'Changelog', 0.8)
        ).rejects.toThrow('Variants audit failed');
      });
    });

    it('throws error when coverage below threshold', async () => {
      mockMCP.call
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, report: { coverage: 0.7 } });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        await expect(
          result.current.publishWithPreflight('course-123', 'Changelog', 0.8)
        ).rejects.toThrow('Coverage 70% below threshold 80%');
      });
    });

    it('invalidates cache after publishing', async () => {
      mockMCP.call
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true, report: { coverage: 0.95 } });
      mockPublishCourse.mockResolvedValue({ version: 2 });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        await result.current.publishWithPreflight('course-123', 'Changelog', 0.8);
      });

      expect(mockInvalidateCache).toHaveBeenCalledWith('course-123');
    });
  });

  describe('archiveCourse', () => {
    it('archives course and invalidates cache', async () => {
      mockMCP.call.mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        await result.current.archiveCourse('course-123', 'No longer needed');
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.archiveCourse', {
        courseId: 'course-123',
        reason: 'No longer needed',
      });
      expect(mockInvalidateCache).toHaveBeenCalledWith('course-123');
    });

    it('archives without reason', async () => {
      mockMCP.call.mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        await result.current.archiveCourse('course-123');
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.archiveCourse', {
        courseId: 'course-123',
        reason: undefined,
      });
    });
  });

  describe('deleteCourse', () => {
    it('deletes course with confirmation and invalidates cache', async () => {
      mockMCP.call.mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useCoursePublishing());

      await act(async () => {
        await result.current.deleteCourse('course-123', 'DELETE');
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.deleteCourse', {
        courseId: 'course-123',
        confirm: 'DELETE',
      });
      expect(mockInvalidateCache).toHaveBeenCalledWith('course-123');
    });
  });
});

