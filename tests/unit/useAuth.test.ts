/**
 * Unit Tests: useAuth hook
 *
 * Verifies:
 * - bootstrap sets user from getSession
 * - onAuthStateChange updates user and loading
 * - loading flips to false after bootstrap
 */

import { renderHook, act } from '@testing-library/react';

const mockSession = {
  user: { id: 'user-123', email: 'test@example.com' },
} as any;

// Mock supabase client
const onAuthChangeMock = jest.fn();

jest.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({
          data: { session: mockSession },
        })),
        onAuthStateChange: jest.fn((cb: any) => {
          onAuthChangeMock.mockImplementation(cb);
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
    },
  };
});

// Mock roles to avoid import.meta env issues
jest.mock('@/lib/roles', () => ({
  getRole: () => 'admin',
}));

describe('useAuth', () => {
  it('sets user from getSession and clears loading', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    // Wait for effects to run
    await act(async () => {});

    expect(result.current.user?.id).toBe('user-123');
    expect(result.current.loading).toBe(false);
  });

  it('updates user on auth state change (logout)', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    const { result } = renderHook(() => useAuth());

    // Wait for bootstrap
    await act(async () => {});

    // Simulate logout
    await act(async () => {
      onAuthChangeMock(null, null);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

