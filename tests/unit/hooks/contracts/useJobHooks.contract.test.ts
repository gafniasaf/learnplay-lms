/**
 * Job Hook Contract Tests
 * 
 * Verifies that job-related hooks pass correct parameters to MCP methods.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track MCP calls
let mcpCalls: Array<{ method: string; params: unknown }> = [];

const mockMCP = {
  listCourseJobs: jest.fn((params: unknown) => {
    mcpCalls.push({ method: 'listCourseJobs', params });
    return Promise.resolve({ ok: true, jobs: [], total: 0 });
  }),
  getJobStatus: jest.fn((jobId: string) => {
    mcpCalls.push({ method: 'getJobStatus', params: { jobId } });
    return Promise.resolve({ state: 'pending', step: null, progress: 0 });
  }),
};

jest.mock('@/hooks/useMCP', () => ({
  useMCP: () => mockMCP,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Job Hook Contracts', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  describe('useJobsList', () => {
    it('passes status and limit to listCourseJobs', async () => {
      const { useJobsList } = await import('@/hooks/useJobsList');
      
      renderHook(() => useJobsList({ status: 'running', limit: 10 }), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'listCourseJobs');
      expect(call?.params).toMatchObject({ status: 'running', limit: 10 });
    });

    it('uses default limit when not specified', async () => {
      const { useJobsList } = await import('@/hooks/useJobsList');
      
      renderHook(() => useJobsList({}), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'listCourseJobs');
      expect(call?.params).toMatchObject({ limit: 50 }); // default
    });
  });

  describe('useJobStatus', () => {
    it('passes jobId to getJobStatus', async () => {
      const { useJobStatus } = await import('@/hooks/useJobStatus');
      
      renderHook(() => useJobStatus('job-xyz-123'), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getJobStatus');
      expect(call?.params).toEqual({ jobId: 'job-xyz-123' });
    });

    it('does NOT call getJobStatus when jobId is null', async () => {
      const { useJobStatus } = await import('@/hooks/useJobStatus');
      
      renderHook(() => useJobStatus(null), { wrapper: createWrapper() });
      
      await new Promise(r => setTimeout(r, 100));
      
      const call = mcpCalls.find(c => c.method === 'getJobStatus');
      expect(call).toBeUndefined();
    });
  });
});

