/**
 * Unit Tests: useMCP auth/error handling
 */

import { renderHook, act } from '@testing-library/react';
import { useMCP } from '@/hooks/useMCP';

// Mock callEdgeFunction to throw 401 with missing org
jest.mock('@/lib/api/common', () => ({
  callEdgeFunction: jest.fn(async () => {
    const error: any = new Error('User account not configured: missing organization_id');
    error.status = 401;
    throw error;
  }),
  callEdgeFunctionGet: jest.fn(),
}));

// Mock ensureSession/getAccessToken used inside hook indirectly
jest.mock('@/lib/supabase', () => ({
  getAccessToken: jest.fn(async () => 'token'),
  ensureSession: jest.fn(async () => 'token'),
}));

describe('useMCP auth handling', () => {
  it('surfaces missing organization_id error', async () => {
    const { result } = renderHook(() => useMCP());

    await expect(
      act(async () => {
        await result.current.enqueueJob('ai_course_generate', { course_id: 'test' });
      })
    ).rejects.toThrow(/organization/i);
  });
});

