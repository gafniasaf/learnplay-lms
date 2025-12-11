import React, { ReactNode } from 'react';
import { renderHook, RenderHookResult, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { AuthenticatedUser } from './auth';

/**
 * React Hook testing utilities for integration tests
 * 
 * Provides utilities to test React hooks in real context with actual Supabase client.
 */

/**
 * Create a test wrapper that provides React Query and Supabase context
 */
export function createTestWrapper(
  auth: AuthenticatedUser | null = null
): ({ children }: { children: ReactNode }) => JSX.Element {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  
  // Create Supabase client with auth if provided
  const supabase = auth
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${auth.accessToken}`,
          },
        },
      })
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Mock the Supabase client in the integration context
  // This requires the hook to use the client from context or props
  return ({ children }: { children: ReactNode }) => {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(TestSupabaseProvider, { supabase }, children)
    );
  };
}

/**
 * Test Supabase Provider component
 * 
 * Provides Supabase client via React context for hooks to use.
 * This is a simplified version - actual implementation depends on how
 * hooks access Supabase (via context, props, or direct import).
 */
interface TestSupabaseProviderProps {
  supabase: SupabaseClient;
  children: ReactNode;
}

function TestSupabaseProvider({ supabase, children }: TestSupabaseProviderProps) {
  // Store supabase in a way hooks can access it
  // This is a placeholder - actual implementation depends on hook architecture
  React.useEffect(() => {
    // If hooks use a global or context-based Supabase client,
    // we'd need to inject it here. For now, this is a placeholder.
    (window as any).__TEST_SUPABASE__ = supabase;
  }, [supabase]);
  
  return React.createElement(React.Fragment, null, children);
}

/**
 * Render a hook with test wrapper
 */
export function renderHookWithWrapper<TResult, TProps = void>(
  hook: (props: TProps) => TResult,
  options: {
    auth?: AuthenticatedUser | null;
    initialProps?: TProps;
  } = {}
): RenderHookResult<TResult, TProps> {
  const wrapper = createTestWrapper(options.auth || null);
  
  return renderHook(hook, {
    wrapper,
    initialProps: options.initialProps,
  });
}

/**
 * Wait for hook to complete async operation
 */
export async function waitForHook<T>(
  result: { current: T },
  predicate: (value: T) => boolean,
  options: { timeout?: number } = {}
): Promise<void> {
  await waitFor(
    () => {
      expect(predicate(result.current)).toBe(true);
    },
    { timeout: options.timeout || 10000 }
  );
}

/**
 * Mock useAuth hook for testing
 * 
 * This allows tests to provide a mock user without full authentication flow.
 */
export function mockUseAuth(user: AuthenticatedUser['user'] | null) {
  // This would need to be implemented based on how useAuth is structured
  // For now, it's a placeholder showing the intended API
  return {
    user,
    loading: false,
    role: user?.role || 'student',
  };
}

