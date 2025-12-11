/**
 * Class Management Hook Contract Tests
 * 
 * Verifies that class management hooks pass correct parameters to MCP methods.
 * These include:
 * - createClass
 * - addMember / removeMember
 * - generateCode
 * - joinClass
 * - createChildCode / linkChild (parent-child linking)
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track MCP calls
let mcpCalls: Array<{ method: string; params: unknown }> = [];

const mockMCP = {
  listClasses: jest.fn(() => {
    mcpCalls.push({ method: 'listClasses', params: {} });
    return Promise.resolve({ classes: [] });
  }),
  createClass: jest.fn((name: string, description?: string) => {
    mcpCalls.push({ method: 'createClass', params: { name, description } });
    return Promise.resolve({ ok: true, classId: 'new-class-1' });
  }),
  addClassMember: jest.fn((classId: string, studentEmail: string) => {
    mcpCalls.push({ method: 'addClassMember', params: { classId, studentEmail } });
    return Promise.resolve({ ok: true });
  }),
  removeClassMember: jest.fn((classId: string, studentId: string) => {
    mcpCalls.push({ method: 'removeClassMember', params: { classId, studentId } });
    return Promise.resolve({ ok: true });
  }),
  generateClassCode: jest.fn((classId: string, refreshCode?: boolean) => {
    mcpCalls.push({ method: 'generateClassCode', params: { classId, refreshCode } });
    return Promise.resolve({ code: 'ABC123' });
  }),
  joinClass: jest.fn((code: string) => {
    mcpCalls.push({ method: 'joinClass', params: { code } });
    return Promise.resolve({ ok: true });
  }),
  createChildCode: jest.fn((studentId: string) => {
    mcpCalls.push({ method: 'createChildCode', params: { studentId } });
    return Promise.resolve({ code: 'CHILD123' });
  }),
  linkChild: jest.fn((code: string) => {
    mcpCalls.push({ method: 'linkChild', params: { code } });
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

describe('Class Management Hook Contracts', () => {
  beforeEach(() => {
    mcpCalls = [];
    jest.clearAllMocks();
  });

  describe('useClassManagement - listClasses', () => {
    it('fetches classes on mount', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
      
      const call = mcpCalls.find(c => c.method === 'listClasses');
      expect(call).toBeDefined();
    });
  });

  describe('useClassManagement - createClass', () => {
    it('passes name and description to createClass', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      const { result } = renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await act(async () => {
        await result.current.createClass.mutateAsync({ 
          name: 'Math 101', 
          description: 'Intro to algebra' 
        });
      });
      
      const call = mcpCalls.find(c => c.method === 'createClass');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ name: 'Math 101', description: 'Intro to algebra' });
    });
  });

  describe('useClassManagement - addMember', () => {
    it('passes classId and studentEmail to addClassMember', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      const { result } = renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await act(async () => {
        await result.current.addMember.mutateAsync({ 
          classId: 'class-1', 
          studentEmail: 'student@example.com' 
        });
      });
      
      const call = mcpCalls.find(c => c.method === 'addClassMember');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ classId: 'class-1', studentEmail: 'student@example.com' });
    });
  });

  describe('useClassManagement - removeMember', () => {
    it('passes classId and studentId to removeClassMember', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      const { result } = renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await act(async () => {
        await result.current.removeMember.mutateAsync({ 
          classId: 'class-1', 
          studentId: 'student-123' 
        });
      });
      
      const call = mcpCalls.find(c => c.method === 'removeClassMember');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ classId: 'class-1', studentId: 'student-123' });
    });
  });

  describe('useClassManagement - generateCode', () => {
    it('passes classId and refreshCode flag to generateClassCode', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      const { result } = renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await act(async () => {
        await result.current.generateCode.mutateAsync({ classId: 'class-2', refreshCode: true });
      });
      
      const call = mcpCalls.find(c => c.method === 'generateClassCode');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ classId: 'class-2', refreshCode: true });
    });
  });

  describe('useClassManagement - joinClass', () => {
    it('passes join code to joinClass', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      const { result } = renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await act(async () => {
        await result.current.joinClass.mutateAsync('ABC123');
      });
      
      const call = mcpCalls.find(c => c.method === 'joinClass');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ code: 'ABC123' });
    });
  });

  describe('useClassManagement - createChildCode', () => {
    it('passes studentId to createChildCode', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      const { result } = renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await act(async () => {
        await result.current.createChildCode.mutateAsync('student-child-1');
      });
      
      const call = mcpCalls.find(c => c.method === 'createChildCode');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ studentId: 'student-child-1' });
    });
  });

  describe('useClassManagement - linkChild', () => {
    it('passes linking code to linkChild', async () => {
      const { useClassManagement } = await import('@/hooks/useClassManagement');
      
      const { result } = renderHook(() => useClassManagement(), { wrapper: createWrapper() });
      
      await act(async () => {
        await result.current.linkChild.mutateAsync('LINK-CODE-123');
      });
      
      const call = mcpCalls.find(c => c.method === 'linkChild');
      expect(call).toBeDefined();
      expect(call?.params).toEqual({ code: 'LINK-CODE-123' });
    });
  });
});

