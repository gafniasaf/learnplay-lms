import type { Dashboard, DashboardRole } from "../types/dashboard";
import { shouldUseMockData, callEdgeFunctionGet } from "./common";

// Conditional import for mocks (tree-shaken in production)
const getMocks = () => import("../mocks");

/**
 * API: Get dashboard data for a role
 * @param role - User role (student, teacher, parent, school, admin)
 * @returns Dashboard data with stats and activities
 */
export async function getDashboard(role: DashboardRole): Promise<Dashboard> {
  if (shouldUseMockData()) {
    console.log("[API] Using mock data for getDashboard");
    const { fetchDashboard } = await getMocks();
    return fetchDashboard(role);
  }

  console.info("[getDashboard]", { role });

  // Use student-dashboard edge function for student role
  if (role === "student") {
    const response = await callEdgeFunctionGet<{
      assignments: any[];
      performance: { recentScore: number; streakDays: number; xp: number };
      recommendedCourses: any[];
    }>("student-dashboard");

    console.info("[getDashboard][student-dashboard][ok]", response);

    // Transform to Dashboard format
    return {
      role: "student",
      userId: "", // Filled by edge function context
      displayName: "", // TODO: Get from profile
      stats: {
        coursesInProgress: response.assignments?.filter((a) => a.status === "in_progress").length || 0,
        coursesCompleted: response.assignments?.filter((a) => a.status === "completed").length || 0,
        totalPoints: response.performance.xp,
        currentStreak: response.performance.streakDays,
        bestStreak: response.performance.streakDays,
        accuracyRate: response.performance.recentScore,
      },
      upcoming: response.assignments
        ?.filter((a) => a.status !== "completed" && a.due_at)
        .slice(0, 5)
        .map((a) => ({
          id: a.course_id,
          title: a.title,
          type: "course",
          dueDate: a.due_at,
          progress: a.progress_pct,
        })) || [],
      recent: response.assignments
        ?.filter((a) => a.status === "completed")
        .slice(0, 5)
        .map((a) => ({
          id: a.course_id,
          title: a.title,
          type: "course",
          completedAt: a.updated_at,
          score: a.score || 0,
        })) || [],
      achievements: [],
    };
  }

  // Use generic get-dashboard for other roles
  const data = await callEdgeFunctionGet<Dashboard>("get-dashboard", { role });

  console.info("[getDashboard][ok]", data);

  return data;
}
