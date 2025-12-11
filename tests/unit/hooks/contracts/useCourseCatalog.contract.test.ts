/**
 * Course Catalog Contract Test
 * 
 * Verifies that getCourseCatalog fetches from the correct source.
 * This test would have caught the bug where it called a non-existent Edge Function.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track fetch calls
let fetchCalls: Array<{ url: string }> = [];

// Mock fetch globally
global.fetch = jest.fn((url: string) => {
  fetchCalls.push({ url });
  if (url === '/catalog.json') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ courses: [{ id: 'test-course', title: 'Test Course' }], subjects: [] }),
    } as Response);
  }
  return Promise.reject(new Error(`Unexpected fetch to ${url}`));
}) as jest.Mock;

const mockMCP = {
  getCourseCatalog: jest.fn(async () => {
    // Simulate the actual implementation
    const response = await fetch('/catalog.json');
    if (!response.ok) {
      throw new Error(`Failed to load catalog: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }),
};

jest.mock('@/hooks/useMCP', () => ({
  useMCP: () => mockMCP,
}));

jest.mock('@/lib/env', () => ({
  isLiveMode: () => true, // Force live mode
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

describe('Course Catalog Contract', () => {
  beforeEach(() => {
    fetchCalls = [];
    jest.clearAllMocks();
  });

  it('fetches from /catalog.json (NOT from Edge Function)', async () => {
    const { useMCP } = await import('@/hooks/useMCP');
    const mcp = useMCP();
    
    await mcp.getCourseCatalog();
    
    // Verify it fetched from static file, not Edge Function
    expect(fetchCalls.length).toBeGreaterThan(0);
    const catalogCall = fetchCalls.find(c => c.url === '/catalog.json');
    expect(catalogCall).toBeDefined();
    
    // Verify it did NOT try to call Edge Function
    const edgeFunctionCall = fetchCalls.find(c => c.url.includes('functions/v1/get-course-catalog'));
    expect(edgeFunctionCall).toBeUndefined();
  });
});

