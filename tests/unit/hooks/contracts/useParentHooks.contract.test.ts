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
  getParentTimeline: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'getParentTimeline', params });
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

describe('Parent Hook Contracts', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  describe('useParentDashboard', () => {
    it('passes parentId to getParentDashboard', async () => {
      const { useParentDashboard } = await import('@/hooks/useParentDashboard');
      
      renderHook(() => useParentDashboard({ parentId: 'parent-123' }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getParentDashboard');
      expect(call?.params).toEqual({ parentId: 'parent-123' });
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
});

