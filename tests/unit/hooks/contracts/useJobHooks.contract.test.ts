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
  getRecord: jest.fn((table: string, id: string) => {
    mcpCalls.push({ method: 'getRecord', params: { table, id } });
    return Promise.resolve({ record: { jobs_last_hour: 0, hourly_limit: 10, jobs_last_day: 0, daily_limit: 50 } });
  }),
  getCourseJob: jest.fn((jobId: string, includeEvents?: boolean) => {
    mcpCalls.push({ method: 'getCourseJob', params: { jobId, includeEvents } });
    return Promise.resolve({ ok: true, job: { id: jobId, status: 'pending' }, events: [] });
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

  describe('useJobQuota', () => {
    it('calls getRecord with UserJobQuota table and current id', async () => {
      // Mock live mode for this test
      jest.mock('@/lib/env', () => ({
        isLiveMode: () => true,
      }));
      
      const { useJobQuota } = await import('@/hooks/useJobQuota');
      
      renderHook(() => useJobQuota(), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getRecord');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ table: 'UserJobQuota', id: 'current' });
    });
  });

  describe('useJobContext', () => {
    it('passes jobId and includeEvents=true to getCourseJob', async () => {
      const { useJobContext } = await import('@/hooks/useJobContext');
      
      renderHook(() => useJobContext('job-context-123'), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getCourseJob');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ jobId: 'job-context-123', includeEvents: true });
    });

    it('does NOT call getCourseJob when jobId is null', async () => {
      const { useJobContext } = await import('@/hooks/useJobContext');
      
      renderHook(() => useJobContext(null), { wrapper: createWrapper() });
      
      await new Promise(r => setTimeout(r, 100));
      
      const call = mcpCalls.find(c => c.method === 'getCourseJob');
      expect(call).toBeUndefined();
    });
  });

  describe('usePipelineJob', () => {
    it('passes jobId and includeEvents=true to getCourseJob', async () => {
      const { usePipelineJob } = await import('@/hooks/usePipelineJob');
      
      renderHook(() => usePipelineJob('job-pipeline-456'), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'getCourseJob');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ jobId: 'job-pipeline-456', includeEvents: true });
    });

    it('does NOT call getCourseJob when disabled', async () => {
      const { usePipelineJob } = await import('@/hooks/usePipelineJob');
      
      renderHook(() => usePipelineJob('job-123', { enabled: false }), { wrapper: createWrapper() });
      
      await new Promise(r => setTimeout(r, 100));
      
      const call = mcpCalls.find(c => c.method === 'getCourseJob');
      expect(call).toBeUndefined();
    });
  });
});

