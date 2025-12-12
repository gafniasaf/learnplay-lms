/**
 * AuthGuard - Waits for authentication state to be resolved before rendering children
 * 
 * This prevents the race condition where components try to call Edge Functions
 * before the auth token is available, causing 401 errors.
 * 
 * Usage:
 *   <AuthGuard>
 *     <YourProtectedComponent />
 *   </AuthGuard>
 * 
 * For routes that should work without auth, use allowGuest:
 *   <AuthGuard allowGuest>
 *     <PublicComponent />
 *   </AuthGuard>
 */

import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useLocation } from "react-router-dom";

interface AuthGuardProps {
  children: ReactNode;
  /** If true, allows unauthenticated users to see the content */
  allowGuest?: boolean;
  /** If true, redirects authenticated users away (for login pages) */
  redirectAuthenticated?: string;
  /** Custom loading component */
  loadingComponent?: ReactNode;
}

export function AuthGuard({ 
  children, 
  allowGuest = false,
  redirectAuthenticated,
  loadingComponent
}: AuthGuardProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return loadingComponent || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect authenticated users away from login pages
  if (redirectAuthenticated && user) {
    return <Navigate to={redirectAuthenticated} replace />;
  }

  // If user is not authenticated and guest access is not allowed, redirect to login
  if (!user && !allowGuest) {
    // Save the intended destination
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // User is authenticated (or guest access is allowed) - render children
  return <>{children}</>;
}

/**
 * Hook to check if we should skip API calls (auth not ready or user not logged in)
 */
export function useAuthReady(): { isReady: boolean; isAuthenticated: boolean } {
  const { user, loading } = useAuth();
  
  return {
    isReady: !loading,
    isAuthenticated: !loading && !!user,
  };
}

