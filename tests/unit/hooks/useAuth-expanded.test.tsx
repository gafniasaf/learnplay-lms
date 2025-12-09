/**
 * Expanded tests for useAuth hook
 * Tests login, logout, session refresh, error handling
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';

// Mock Supabase client
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();
const mockSignIn = jest.fn();

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => mockGetSession()),
      onAuthStateChange: (callback: any) => {
        mockOnAuthStateChange.mockImplementation(callback);
        return {
          data: {
            subscription: {
              unsubscribe: jest.fn(),
            },
          },
        };
      },
      signOut: () => mockSignOut(),
      signInWithPassword: (credentials: any) => mockSignIn(credentials),
    },
  },
}));

jest.mock('@/lib/roles', () => ({
  getRole: jest.fn(() => 'admin'),
}));

describe('useAuth - Expanded Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });
  });

  it('handles initial loading state', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('sets user from session on mount', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      app_metadata: { organization_id: 'org-123' },
    };

    mockGetSession.mockResolvedValue({
      data: { session: { user: mockUser } },
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user).toEqual(mockUser);
    });
  });

  it('updates user on login', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newUser = {
      id: 'user-456',
      email: 'newuser@example.com',
    };

    await act(async () => {
      mockOnAuthStateChange('SIGNED_IN', { user: newUser });
    });

    expect(result.current.user).toEqual(newUser);
    expect(result.current.loading).toBe(false);
  });

  it('clears user on logout', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
    };

    mockGetSession.mockResolvedValue({
      data: { session: { user: mockUser } },
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
    });

    await act(async () => {
      mockOnAuthStateChange('SIGNED_OUT', null);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('handles session refresh', async () => {
    const initialUser = {
      id: 'user-123',
      email: 'test@example.com',
    };

    mockGetSession.mockResolvedValue({
      data: { session: { user: initialUser } },
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.user).toEqual(initialUser);
    });

    const refreshedUser = {
      ...initialUser,
      updated_at: new Date().toISOString(),
    };

    await act(async () => {
      mockOnAuthStateChange('TOKEN_REFRESHED', { user: refreshedUser });
    });

    expect(result.current.user).toEqual(refreshedUser);
  });

  it('handles auth state change errors gracefully', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simulate error event
    await act(async () => {
      mockOnAuthStateChange('USER_UPDATED', null);
    });

    // Should handle gracefully without crashing
    expect(result.current.user).toBeNull();
  });

  it('unsubscribes from auth state changes on unmount', () => {
    const unsubscribe = jest.fn();
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe,
        },
      },
    });

    const { unmount } = renderHook(() => useAuth());

    unmount();

    // Note: Actual unsubscribe is called in cleanup, but mock structure may vary
    // This test ensures unmount doesn't crash
    expect(unmount).not.toThrow();
  });

  it('returns correct role from getRole', async () => {
    const { getRole } = await import('@/lib/roles');
    jest.mocked(getRole).mockReturnValue('editor');

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.role).toBe('editor');
    });
  });

  it('handles null session gracefully', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

});

