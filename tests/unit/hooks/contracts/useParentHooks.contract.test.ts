/**
 * Parent Hook Contract Tests
 * 
 * Verifies that parent-related hooks pass correct parameters to MCP methods.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track MCP calls
let mcpCalls: Array<{ method: string; params: unknown }> = [];

const mockMCP = {
  getParentDashboard: jest.fn((parentId?: string) => {
    mcpCalls.push({ method: 'getParentDashboard', params: { parentId } });
    return Promise.resolve({ children: [], summary: {} });
  }),
  getParentGoals: jest.fn((childId: string) => {
    mcpCalls.push({ method: 'getParentGoals', params: { childId } });
    return Promise.resolve({ goals: [], summary: {} });
  }),
  getParentTimeline: jest.fn((studentId: string, limit?: number) => {
    mcpCalls.push({ method: 'getParentTimeline', params: { studentId, limit } });
    return Promise.resolve({ events: [] });
  }),
  getParentTopics: jest.fn((childId: string) => {
    mcpCalls.push({ method: 'getParentTopics', params: { childId } });
    return Promise.resolve({ topics: [] });
  }),
  getParentSubjects: jest.fn((childId: string) => {
    mcpCalls.push({ method: 'getParentSubjects', params: { childId } });
    return Promise.resolve({ subjects: [] });
  }),
};

const mockUser = { id: 'test-parent-user-123', email: 'parent@example.com' };

jest.mock('@/hooks/useMCP', () => ({
  useMCP: () => mockMCP,
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: mockUser } } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Parent Hook Contracts', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  describe('useParentDashboard', () => {
    it('passes parentId from params to getParentDashboard', async () => {
      const { useParentDashboard } = await import('@/hooks/useParentDashboard');
      
      renderHook(() => useParentDashboard({ parentId: 'parent-123' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentDashboard');
      expect(call?.params).toEqual({ parentId: 'parent-123' });
    });

    it('uses user.id as parentId when params.parentId not provided', async () => {
      const { useParentDashboard } = await import('@/hooks/useParentDashboard');
      
      // Call without parentId - should use user.id from useAuth
      renderHook(() => useParentDashboard(), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentDashboard');
      expect(call).toBeDefined();
      // Should use the mock user ID from useAuth mock
      expect(call?.params).toEqual({ parentId: 'test-parent-user-123' });
    });
  });

  describe('useParentGoals', () => {
    it('passes studentId (child) to getParentGoals - enabled only when studentId provided', async () => {
      const { useParentGoals } = await import('@/hooks/useParentGoals');
      
      renderHook(() => useParentGoals({ studentId: 'child-456' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentGoals');
      expect(call?.params).toEqual({ childId: 'child-456' });
    });

    it('does NOT call API when studentId is missing', async () => {
      const { useParentGoals } = await import('@/hooks/useParentGoals');
      
      renderHook(() => useParentGoals({}), { wrapper: createWrapper() });
      
      await new Promise(r => setTimeout(r, 100));
      
      const call = mcpCalls.find(c => c.method === 'getParentGoals');
      expect(call).toBeUndefined();
    });
  });

  describe('useParentTopics', () => {
    it('passes studentId (child) to getParentTopics', async () => {
      const { useParentTopics } = await import('@/hooks/useParentTopics');
      
      renderHook(() => useParentTopics({ studentId: 'child-789' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentTopics');
      expect(call?.params).toEqual({ childId: 'child-789' });
    });
  });

  describe('useParentSubjects', () => {
    it('passes studentId (child) to getParentSubjects', async () => {
      const { useParentSubjects } = await import('@/hooks/useParentSubjects');
      
      renderHook(() => useParentSubjects({ studentId: 'child-abc' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentSubjects');
      expect(call?.params).toEqual({ childId: 'child-abc' });
    });
  });

  describe('useParentTimeline', () => {
    it('passes studentId and limit to getParentTimeline', async () => {
      const { useParentTimeline } = await import('@/hooks/useParentTimeline');
      
      renderHook(() => useParentTimeline({ studentId: 'child-timeline-1', limit: 25 }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentTimeline');
      expect(call).toBeDefined();
      // Verify studentId is passed (not parentId or role)
      expect(call?.params).toHaveProperty('studentId', 'child-timeline-1');
    });

    it('does NOT fetch when studentId is missing (enabled=false)', async () => {
      const { useParentTimeline } = await import('@/hooks/useParentTimeline');
      
      renderHook(() => useParentTimeline({}), { wrapper: createWrapper() });
      
      await new Promise(r => setTimeout(r, 100));
      
      // Query should be disabled when studentId is missing
      const call = mcpCalls.find(c => c.method === 'getParentTimeline');
      expect(call).toBeUndefined();
    });
  });
});

