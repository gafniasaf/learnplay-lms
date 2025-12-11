import { useState, useEffect } from "react";
import { useMCP } from "./useMCP";
import { useAuth } from "./useAuth";
import type { Dashboard, DashboardRole } from "@/lib/types/dashboard";

/**
 * Hook to fetch dashboard data with loading and error states
 * Per IgniteZero: Uses MCP-First architecture
 * @param role - User role to fetch dashboard for
 * @returns Dashboard data, loading state, and error
 */
export function useDashboard(role: DashboardRole) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mcp = useMCP();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait for auth to load before fetching
    if (authLoading) return;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Use MCP to fetch dashboard data
        // Map role to appropriate edge function with correct params
        if (role === 'student') {
          if (!user?.id) {
            throw new Error("User not authenticated");
          }
          const data = await mcp.callGet<Dashboard>('lms.student-dashboard', { studentId: user.id });
          setDashboard(data);
        } else if (role === 'teacher') {
          const data = await mcp.callGet<Dashboard>('lms.get-dashboard', { role });
          setDashboard(data);
        } else {
          // parent, school, admin
          const functionName = role === 'parent' ? 'parent-dashboard' : 'get-dashboard';
          const data = await mcp.callGet<Dashboard>(`lms.${functionName}`, { role });
          setDashboard(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load dashboard"));
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [role, mcp, user?.id, authLoading]);

  return { dashboard, loading: loading || authLoading, error };
}
