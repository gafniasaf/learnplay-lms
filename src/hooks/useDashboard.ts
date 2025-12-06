import { useState, useEffect } from "react";
import { getDashboard } from "@/lib/api";
import type { Dashboard, DashboardRole } from "@/lib/types/dashboard";

/**
 * Hook to fetch dashboard data with loading and error states
 * @param role - User role to fetch dashboard for
 * @returns Dashboard data, loading state, and error
 */
export function useDashboard(role: DashboardRole) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getDashboard(role);
        setDashboard(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load dashboard"));
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [role]);

  return { dashboard, loading, error };
}
