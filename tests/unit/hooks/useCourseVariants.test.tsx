/**
 * Tests for useCourseVariants hook
 * Tests variant audit, repair, missing variants, auto-fix
 */

// Mock dependencies BEFORE imports
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));

import { renderHook, act } from '@testing-library/react';
import { useCourseVariants } from '@/pages/admin/editor/hooks/useCourseVariants';
import { useMCP } from '@/hooks/useMCP';

const mockMCP = {
  call: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (useMCP as jest.Mock).mockReturnValue(mockMCP);
});

describe('useCourseVariants', () => {
  describe('repairPreview', () => {
    it('returns repair diff preview', async () => {
      const mockDiff = [
        { op: 'add', path: '/items/0/variant', value: '1' },
        { op: 'replace', path: '/items/1/variant', value: '2' },
      ];

      mockMCP.call.mockResolvedValue({
        ok: true,
        preview: { diff: mockDiff },
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const diff = await result.current.repairPreview('course-123');
        expect(diff).toEqual(mockDiff);
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.editorRepairCourse', {
        courseId: 'course-123',
        apply: false,
      });
    });

    it('throws error when repair fails', async () => {
      mockMCP.call.mockResolvedValue({
        ok: false,
        error: 'Repair failed',
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        await expect(result.current.repairPreview('course-123')).rejects.toThrow(
          'Repair failed'
        );
      });
    });

    it('returns empty array when no diff', async () => {
      mockMCP.call.mockResolvedValue({
        ok: true,
        preview: {},
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const diff = await result.current.repairPreview('course-123');
        expect(diff).toEqual([]);
      });
    });
  });

  describe('variantsAudit', () => {
    it('returns audit diff and report', async () => {
      const mockDiff = [{ op: 'add', path: '/items/0/variant', value: '1' }];
      const mockReport = { coverage: 0.8, missing: 5 };

      mockMCP.call.mockResolvedValue({
        ok: true,
        preview: { diff: mockDiff },
        report: mockReport,
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const audit = await result.current.variantsAudit('course-123');
        expect(audit.diff).toEqual(mockDiff);
        expect(audit.report).toEqual(mockReport);
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.editorVariantsAudit', {
        courseId: 'course-123',
        apply: false,
      });
    });

    it('uses mergePlan.patch when preview.diff is missing', async () => {
      const mockPatch = [{ op: 'add', path: '/items/0/variant', value: '1' }];

      mockMCP.call.mockResolvedValue({
        ok: true,
        mergePlan: { patch: mockPatch },
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const audit = await result.current.variantsAudit('course-123');
        expect(audit.diff).toEqual(mockPatch);
      });
    });

    it('returns empty array when diff is not array', async () => {
      mockMCP.call.mockResolvedValue({
        ok: true,
        preview: { diff: 'not-an-array' },
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const audit = await result.current.variantsAudit('course-123');
        expect(audit.diff).toEqual([]);
      });
    });
  });

  describe('variantsMissing', () => {
    it('returns missing variants diff', async () => {
      const mockDiff = [
        { op: 'add', path: '/items/0/variant', value: '1' },
        { op: 'add', path: '/items/1/variant', value: '2' },
      ];

      mockMCP.call.mockResolvedValue({
        ok: true,
        preview: { diff: mockDiff },
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const diff = await result.current.variantsMissing('course-123');
        expect(diff).toEqual(mockDiff);
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.editorVariantsMissing', {
        courseId: 'course-123',
        apply: false,
      });
    });

    it('returns empty array when no missing variants', async () => {
      mockMCP.call.mockResolvedValue({
        ok: true,
        preview: { diff: [] },
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const diff = await result.current.variantsMissing('course-123');
        expect(diff).toEqual([]);
      });
    });
  });

  describe('autoFix', () => {
    it('applies auto-fix successfully', async () => {
      const mockResult = {
        ok: true,
        applied: 5,
        diff: [{ op: 'add', path: '/items/0/variant', value: '1' }],
      };

      mockMCP.call.mockResolvedValue(mockResult);

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        const fixResult = await result.current.autoFix('course-123');
        expect(fixResult).toEqual(mockResult);
      });

      expect(mockMCP.call).toHaveBeenCalledWith('lms.editorAutoFix', {
        courseId: 'course-123',
        apply: true,
      });
    });

    it('throws 403 error when permission denied', async () => {
      mockMCP.call.mockRejectedValue({
        status: 403,
        message: 'Forbidden',
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        await expect(result.current.autoFix('course-123')).rejects.toThrow('403');
      });
    });

    it('throws 403 error when message contains 403', async () => {
      mockMCP.call.mockRejectedValue({
        message: '403 Forbidden',
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        await expect(result.current.autoFix('course-123')).rejects.toThrow('403');
      });
    });

    it('throws generic error when auto-fix fails', async () => {
      mockMCP.call.mockResolvedValue({
        ok: false,
        error: 'Auto-fix failed',
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        await expect(result.current.autoFix('course-123')).rejects.toThrow('Auto-fix failed');
      });
    });

    it('throws generic error when apply fails', async () => {
      mockMCP.call.mockResolvedValue({
        ok: false,
      });

      const { result } = renderHook(() => useCourseVariants());

      await act(async () => {
        await expect(result.current.autoFix('course-123')).rejects.toThrow('Apply failed');
      });
    });
  });
});

