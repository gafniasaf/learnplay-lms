/**
 * useDashboard Contract Test
 * 
 * This test would have caught the bug where useDashboard passed
 * { role: 'student' } instead of { studentId: user.id }
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track MCP calls
let mcpCalls: Array<{ method: string; params: Record<string, unknown> }> = [];

const mockMCP = {
  callGet: jest.fn((method: string, params: Record<string, unknown>) => {
    mcpCalls.push({ method, params });
    return Promise.resolve({});
  }),
};

jest.mock('@/hooks/useMCP', () => ({
  useMCP: () => mockMCP,
}));

const mockUser = { id: 'test-user-123', email: 'test@example.com' };
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false, role: 'student' }),
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

describe('useDashboard Contract', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  it('passes studentId (NOT role) for student dashboard', async () => {
    const { useDashboard } = await import('@/hooks/useDashboard');
    
    renderHook(() => useDashboard('student'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
    
    const studentCall = mcpCalls.find(c => c.method.includes('student-dashboard'));
    
    // THE BUG: This assertion would have FAILED before the fix
    expect(studentCall?.params).toHaveProperty('studentId');
    expect(studentCall?.params).not.toHaveProperty('role');
  });

  it('passes role for non-student dashboards', async () => {
    const { useDashboard } = await import('@/hooks/useDashboard');
    
    renderHook(() => useDashboard('teacher'), { wrapper: createWrapper() });
    
    await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
    
    // Teacher dashboard CAN pass role
    const call = mcpCalls[0];
    expect(call.params).toHaveProperty('role');
  });
});

