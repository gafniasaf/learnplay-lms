/**
 * Student Hook Contract Tests
 * 
 * Verifies that student-related hooks pass correct parameters to MCP methods.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track MCP calls
let mcpCalls: Array<{ method: string; params: unknown }> = [];

const mockMCP = {
  getStudentGoals: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getStudentGoals', params });
    return Promise.resolve({ goals: [] });
  }),
  getStudentTimeline: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getStudentTimeline', params });
    return Promise.resolve({ events: [] });
  }),
  getStudentAchievements: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getStudentAchievements', params });
    return Promise.resolve({ achievements: [] });
  }),
  getStudentAssignments: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getStudentAssignments', params });
    return Promise.resolve([]);
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

describe('Student Hook Contracts', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  describe('useStudentGoals', () => {
    it('passes studentId to getStudentGoals', async () => {
      const { useStudentGoals } = await import('@/hooks/useStudentGoals');
      
      renderHook(() => useStudentGoals({ studentId: 'student-123' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getStudentGoals');
      expect(call?.params).toMatchObject({ studentId: 'student-123' });
    });
  });

  describe('useStudentTimeline', () => {
    it('passes studentId to getStudentTimeline', async () => {
      const { useStudentTimeline } = await import('@/hooks/useStudentTimeline');
      
      renderHook(() => useStudentTimeline({ studentId: 'student-456' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getStudentTimeline');
      expect(call?.params).toMatchObject({ studentId: 'student-456' });
    });
  });

  describe('useStudentAchievements', () => {
    it('passes studentId to getStudentAchievements', async () => {
      const { useStudentAchievements } = await import('@/hooks/useStudentAchievements');
      
      renderHook(() => useStudentAchievements({ studentId: 'student-789' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getStudentAchievements');
      expect(call?.params).toMatchObject({ studentId: 'student-789' });
    });
  });
});

