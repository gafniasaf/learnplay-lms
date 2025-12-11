/**
 * useParentData Contract Tests
 * 
 * Verifies that the aggregate parent data hook passes correct parameters.
 * This hook combines multiple parent-related queries.
 * 
 * This test would have caught the bug where getParentDashboard was called
 * WITHOUT a parentId.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track MCP calls
let mcpCalls: Array<{ method: string; params: unknown }> = [];

const mockUser = { id: 'parent-user-123', email: 'parent@example.com' };

const mockMCP = {
  getParentDashboard: jest.fn((parentId?: string) => {
    mcpCalls.push({ method: 'getParentDashboard', params: { parentId } });
    return Promise.resolve({ children: [], summary: {} });
  }),
  getParentChildren: jest.fn(() => {
    mcpCalls.push({ method: 'getParentChildren', params: {} });
    return Promise.resolve({ children: [] });
  }),
  getParentGoals: jest.fn((childId: string) => {
    mcpCalls.push({ method: 'getParentGoals', params: { childId } });
    return Promise.resolve({ goals: [], summary: {} });
  }),
  getParentSubjects: jest.fn((childId: string) => {
    mcpCalls.push({ method: 'getParentSubjects', params: { childId } });
    return Promise.resolve({ subjects: [] });
  }),
  getParentTimeline: jest.fn((childId: string) => {
    mcpCalls.push({ method: 'getParentTimeline', params: { childId } });
    return Promise.resolve({ events: [] });
  }),
  getParentTopics: jest.fn((childId: string) => {
    mcpCalls.push({ method: 'getParentTopics', params: { childId } });
    return Promise.resolve({ topics: [] });
  }),
};

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

describe('useParentData Contract', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  describe('dashboard query', () => {
    it('passes parentId (user.id) to getParentDashboard - NOT empty', async () => {
      const { useParentData } = await import('@/hooks/useParentData');
      
      renderHook(() => useParentData(), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentDashboard');
      expect(call).toBeDefined();
      
      // THE KEY ASSERTION: parentId must be provided, not undefined/empty
      // This would have caught the original bug!
      expect(call?.params).toHaveProperty('parentId');
      expect((call?.params as { parentId?: string }).parentId).toBe('parent-user-123');
    });
  });

  describe('children query', () => {
    it('fetches parent children on mount', async () => {
      const { useParentData } = await import('@/hooks/useParentData');
      
      renderHook(() => useParentData(), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentChildren');
      expect(call).toBeDefined();
    });
  });

  describe('useChildData nested hooks', () => {
    it('passes childId to getParentGoals', async () => {
      const { useParentData } = await import('@/hooks/useParentData');
      
      const { result } = renderHook(() => {
        const parentData = useParentData();
        // Call the useChildData function to get child-specific data
        const childData = parentData.useChildData('child-xyz');
        return { parentData, childData };
      }, { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const goalsCall = mcpCalls.find(c => c.method === 'getParentGoals');
      expect(goalsCall).toBeDefined();
      expect(goalsCall?.params).toEqual({ childId: 'child-xyz' });
    });

    it('passes childId to getParentSubjects', async () => {
      const { useParentData } = await import('@/hooks/useParentData');
      
      renderHook(() => {
        const parentData = useParentData();
        return parentData.useChildData('child-abc');
      }, { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentSubjects');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ childId: 'child-abc' });
    });

    it('passes childId to getParentTimeline', async () => {
      const { useParentData } = await import('@/hooks/useParentData');
      
      renderHook(() => {
        const parentData = useParentData();
        return parentData.useChildData('child-timeline');
      }, { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentTimeline');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ childId: 'child-timeline' });
    });

    it('passes childId to getParentTopics', async () => {
      const { useParentData } = await import('@/hooks/useParentData');
      
      renderHook(() => {
        const parentData = useParentData();
        return parentData.useChildData('child-topics');
      }, { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentTopics');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ childId: 'child-topics' });
    });
  });
});

