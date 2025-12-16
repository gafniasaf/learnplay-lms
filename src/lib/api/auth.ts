import type { Dashboard, DashboardRole } from "../types/dashboard";
import { callEdgeFunctionGet } from "./common";

/**
 * API: Get dashboard data for a role
 * @param role - User role (student, teacher, parent, school, admin)
 * @returns Dashboard data with stats and activities
 */
export async function getDashboard(role: DashboardRole): Promise<Dashboard> {
  const logger = (await import('@/lib/logger')).createLogger('API');

  logger.info('Getting dashboard', { component: 'getDashboard', role });

  // Use student-dashboard edge function for student role
  if (role === "student") {
    // Get studentId from authenticated user
    const { getAccessToken } = await import("../supabase");
    const { supabase: supabaseClient } = await import("@/integrations/supabase/client");
    const token = await getAccessToken();
    
    if (!token) {
      throw new Error("User not authenticated");
    }
    
    // Get user ID from Supabase auth (more reliable than JWT parsing)
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) {
      throw new Error("User not found");
    }
    
    const studentId = user.id;
    
    const response = await callEdgeFunctionGet<{
      assignments: any[];
      performance: { recentScore: number; streakDays: number; xp: number };
      recommendedCourses: any[];
    }>("student-dashboard", { studentId });

    logger.debug('Student dashboard response received', { component: 'getDashboard', action: 'student-dashboard' });

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

  // For teacher/school/admin roles, get-dashboard requires teacherId, not role
  // Get userId from authenticated user
  const { getAccessToken } = await import("../supabase");
  const { supabase: supabaseClient } = await import("@/integrations/supabase/client");
  const token = await getAccessToken();
  
  if (!token) {
    throw new Error("User not authenticated");
  }
  
  const { data: { user } } = await supabaseClient.auth.getUser(token);
  if (!user) {
    throw new Error("User not found");
  }
  
  // For parent role, use parent-dashboard endpoint
  if (role === "parent") {
    const response = await callEdgeFunctionGet<{
      parentId: string;
      children: any[];
      summary: { totalChildren: number; totalAlerts: number; averageStreak: number; totalXp: number };
      parentName?: string;
    }>("parent-dashboard", { parentId: user.id });

    logger.debug('Parent dashboard response received', { component: 'getDashboard', action: 'parent-dashboard' });

    return {
      role: "parent",
      userId: user.id,
      displayName: response.parentName || "",
      stats: {
        children: response.summary?.totalChildren || 0,
        totalCoursesActive: 0,
        totalCoursesCompleted: 0,
        avgAccuracy: 0,
        weeklyMinutes: 0,
        monthlyProgress: 0,
      },
      children: response.children?.map(c => ({
        id: c.studentId,
        name: c.studentName,
        grade: 0,
        coursesActive: 0,
        coursesCompleted: 0,
        currentStreak: c.metrics?.streakDays || 0,
        avgAccuracy: 0,
        weeklyMinutes: 0,
      })) || [],
      upcoming: [],
      recent: [],
      recommendations: [],
    };
  }
  
  // For teacher/school/admin roles, use get-dashboard with teacherId
  const data = await callEdgeFunctionGet<Dashboard>("get-dashboard", { teacherId: user.id });

  logger.debug('Dashboard data received', { component: 'getDashboard', role });

  return data;
}
