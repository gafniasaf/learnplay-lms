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
          // Ensure studentId is a string for callGet
          const response = await mcp.callGet<{
            assignments: Array<{
              id: string;
              title: string;
              course_id?: string;
              due_at?: string;
              status?: string;
              progress_pct?: number;
              score?: number;
              completed_at?: string;
            }>;
            performance: {
              recentScore: number;
              streakDays: number;
              xp: number;
            };
            recommendedCourses: Array<{
              courseId: string;
              reason: string;
              createdAt: string;
            }>;
          }>('lms.student-dashboard', { studentId: String(user.id) });

          // Transform Edge Function response to Dashboard format
          const dashboard: Dashboard = {
            role: 'student',
            userId: user.id,
            displayName: user.email?.split('@')[0] || 'Student',
            stats: {
              coursesInProgress: response.assignments?.filter(a => a.status === 'in_progress').length || 0,
              coursesCompleted: response.assignments?.filter(a => a.status === 'completed').length || 0,
              totalPoints: response.performance?.xp || 0,
              currentStreak: response.performance?.streakDays || 0,
              bestStreak: response.performance?.streakDays || 0,
              accuracyRate: response.performance?.recentScore || 0,
            },
            upcoming: (response.assignments || [])
              .filter(a => a.status !== 'completed' && a.due_at)
              .map(a => ({
                id: a.id,
                title: a.title,
                type: a.course_id || 'course',
                dueDate: a.due_at || new Date().toISOString(),
                progress: a.progress_pct || 0,
              })),
            recent: (response.assignments || [])
              .filter(a => a.status === 'completed' && a.completed_at)
              .map(a => ({
                id: a.id,
                title: a.title,
                type: a.course_id || 'course',
                completedAt: a.completed_at || new Date().toISOString(),
                score: a.score || 0,
              })),
            achievements: [], // TODO: Fetch from student-achievements Edge Function if needed
          };
          setDashboard(dashboard);
        } else if (role === 'teacher') {
          // Teacher dashboard requires teacherId, not role
          if (!user?.id) {
            throw new Error("User not authenticated");
          }
          const data = await mcp.callGet<Dashboard>('lms.get-dashboard', { teacherId: user.id });
          setDashboard(data);
        } else if (role === 'parent') {
          // Parent dashboard requires parentId, not role
          if (!user?.id) {
            throw new Error("User not authenticated");
          }
          const data = await mcp.callGet<Dashboard>('lms.parent-dashboard', { parentId: user.id });
          setDashboard(data);
        } else {
          // school, admin - also use teacherId (same Edge Function)
          if (!user?.id) {
            throw new Error("User not authenticated");
          }
          const data = await mcp.callGet<Dashboard>('lms.get-dashboard', { teacherId: user.id });
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
