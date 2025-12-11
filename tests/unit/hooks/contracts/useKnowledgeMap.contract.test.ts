/**
 * Knowledge Map Hook Contract Tests
 * 
 * Verifies that Knowledge Map hooks pass correct parameters to MCP methods.
 * These hooks are used for:
 * - Student skills/mastery tracking
 * - Domain growth (parent view)
 * - Class KO summaries (teacher view)
 * - Auto-assign settings
 * - Recommended courses
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track MCP calls
let mcpCalls: Array<{ method: string; params: unknown }> = [];

const mockMCP = {
  getStudentSkills: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getStudentSkills', params });
    return Promise.resolve({ skills: [], totalCount: 0 });
  }),
  getDomainGrowth: jest.fn((studentId: string) => {
    mcpCalls.push({ method: 'getDomainGrowth', params: { studentId } });
    return Promise.resolve([]);
  }),
  getClassKOSummary: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getClassKOSummary', params });
    return Promise.resolve([]);
  }),
  getStudentAssignments: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getStudentAssignments', params });
    return Promise.resolve([]);
  }),
  getAutoAssignSettings: jest.fn((studentId: string) => {
    mcpCalls.push({ method: 'getAutoAssignSettings', params: { studentId } });
    return Promise.resolve(null);
  }),
  getRecommendedCourses: jest.fn((koId: string, studentId?: string, limit?: number) => {
    mcpCalls.push({ method: 'getRecommendedCourses', params: { koId, studentId, limit } });
    return Promise.resolve([]);
  }),
  updateAutoAssignSettings: jest.fn((studentId: string, settings: Record<string, unknown>) => {
    mcpCalls.push({ method: 'updateAutoAssignSettings', params: { studentId, ...settings } });
    return Promise.resolve({ ok: true });
  }),
  createAssignment: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'createAssignment', params });
    return Promise.resolve({ ok: true });
  }),
  updateMastery: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'updateMastery', params });
    return Promise.resolve({ ok: true });
  }),
};

jest.mock('@/hooks/useMCP', () => ({
  useMCP: () => mockMCP,
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Knowledge Map Hook Contracts', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  describe('useStudentSkills', () => {
    it('passes studentId and optional filters to getStudentSkills', async () => {
      const { useStudentSkills } = await import('@/hooks/useKnowledgeMap');
      
      renderHook(
        () => useStudentSkills({ studentId: 'student-skills-1', domain: 'math' }),
        { wrapper: createWrapper() }
      );
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getStudentSkills');
      expect(call).toBeDefined();
      expect(call?.params).toMatchObject({ studentId: 'student-skills-1', domain: 'math' });
    });
  });

  describe('useDomainGrowth', () => {
    it('passes studentId to getDomainGrowth (parent view)', async () => {
      const { useDomainGrowth } = await import('@/hooks/useKnowledgeMap');
      
      renderHook(() => useDomainGrowth('student-growth-1'), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getDomainGrowth');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ studentId: 'student-growth-1' });
    });
  });

  describe('useClassKOSummary', () => {
    it('passes teacherId and sort params to getClassKOSummary', async () => {
      const { useClassKOSummary } = await import('@/hooks/useKnowledgeMap');
      
      renderHook(
        () => useClassKOSummary({ teacherId: 'teacher-1', sortBy: 'struggling', sortOrder: 'desc' }),
        { wrapper: createWrapper() }
      );
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getClassKOSummary');
      expect(call).toBeDefined();
      expect(call?.params).toMatchObject({
        teacherId: 'teacher-1',
        sortBy: 'struggling',
        sortOrder: 'desc',
      });
    });
  });

  describe('useStudentAssignments', () => {
    it('passes studentId and status filter to getStudentAssignments', async () => {
      const { useStudentAssignments } = await import('@/hooks/useKnowledgeMap');
      
      renderHook(
        () => useStudentAssignments({ studentId: 'student-assign-1', status: 'active' }),
        { wrapper: createWrapper() }
      );
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getStudentAssignments');
      expect(call).toBeDefined();
      expect(call?.params).toMatchObject({ studentId: 'student-assign-1', status: 'active' });
    });
  });

  describe('useAutoAssignSettings', () => {
    it('passes studentId to getAutoAssignSettings', async () => {
      const { useAutoAssignSettings } = await import('@/hooks/useKnowledgeMap');
      
      renderHook(() => useAutoAssignSettings('student-auto-1'), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getAutoAssignSettings');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ studentId: 'student-auto-1' });
    });
  });

  describe('useRecommendedCourses', () => {
    it('passes koId, studentId, and limit to getRecommendedCourses', async () => {
      const { useRecommendedCourses } = await import('@/hooks/useKnowledgeMap');
      
      renderHook(
        () => useRecommendedCourses({ koId: 'ko-math-add', studentId: 'student-rec-1', limit: 5 }),
        { wrapper: createWrapper() }
      );
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getRecommendedCourses');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ koId: 'ko-math-add', studentId: 'student-rec-1', limit: 5 });
    });

    it('does NOT fetch when koId is missing (enabled=false)', async () => {
      const { useRecommendedCourses } = await import('@/hooks/useKnowledgeMap');
      
      // @ts-expect-error - testing missing required param
      renderHook(() => useRecommendedCourses({ studentId: 'student-1' }), { wrapper: createWrapper() });
      
      await new Promise(r => setTimeout(r, 100));
      
      const call = mcpCalls.find(c => c.method === 'getRecommendedCourses');
      expect(call).toBeUndefined();
    });
  });
});

