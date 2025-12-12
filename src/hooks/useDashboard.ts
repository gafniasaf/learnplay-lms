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
    
    // If user is not authenticated, don't try to fetch - just set loading to false
    if (!user?.id) {
      setLoading(false);
      setDashboard(null);
      return;
    }

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Use MCP to fetch dashboard data
        // Map role to appropriate edge function with correct params
        if (role === 'student') {
          // At this point we know user.id is defined (checked above)
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
          // At this point we know user.id is defined (checked above)
          
          // Fetch all required data in parallel
          const [dashboardResponse, classesResponse, studentsResponse, assignmentsResponse] = await Promise.all([
            mcp.callGet<{
              role: string;
              stats: {
                sessions?: number;
                rounds?: number;
                attempts7d?: number;
                lastPlayedAt?: string | null;
                lastFinalScore?: number | null;
              };
            }>('lms.get-dashboard', { teacherId: String(user.id) }),
            mcp.listClasses().catch(() => ({ classes: [] })),
            mcp.listOrgStudents().catch(() => ({ students: [] })),
            mcp.listAssignmentsForTeacher().catch(() => ({ assignments: [], scope: 'teacher' as const })),
          ]);

          const classes = (classesResponse as { classes: Array<{ id: string; name: string; student_count?: number; class_members?: Array<{ user_id: string }> }> }).classes || [];
          const students = (studentsResponse as { students: Array<{ id: string; name: string; classIds?: string[] }> }).students || [];
          const assignments = (assignmentsResponse as { assignments: Array<{ id: string; title: string; course_id: string; due_at: string | null; created_at: string }> }).assignments || [];

          // Calculate stats
          const activeClasses = classes.length;
          const totalStudents = students.length;
          const assignmentsActive = assignments.filter(a => {
            if (!a.due_at) return true; // No due date = active
            const dueDate = new Date(a.due_at);
            return dueDate >= new Date(); // Not past due
          }).length;
          
          // Calculate average class progress (simplified - count students with assignments)
          const studentsWithAssignments = new Set(assignments.flatMap(a => 
            students.filter(s => s.classIds?.some(cid => classes.some(c => c.id === cid)))
          ));
          const avgClassProgress = activeClasses > 0 
            ? Math.round((studentsWithAssignments.size / Math.max(totalStudents, 1)) * 100)
            : 0;

          // Students needing help = students with overdue assignments or low progress
          const studentsNeedingHelp = students.filter(s => {
            const studentAssignments = assignments.filter(a => 
              s.classIds?.some(cid => classes.some(c => c.id === cid && c.class_members?.some(m => m.user_id === s.id)))
            );
            const overdue = studentAssignments.filter(a => {
              if (!a.due_at) return false;
              return new Date(a.due_at) < new Date();
            });
            return overdue.length > 0;
          }).length;

          // Courses assigned = unique course IDs from assignments
          const coursesAssigned = new Set(assignments.map(a => a.course_id)).size;

          // Transform assignments to upcoming/recent
          const now = new Date();
          const upcoming = assignments
            .filter(a => {
              if (!a.due_at) return false;
              const dueDate = new Date(a.due_at);
              return dueDate >= now;
            })
            .slice(0, 10)
            .map(a => ({
              id: a.id,
              title: a.title,
              type: a.course_id || 'course',
              dueDate: a.due_at || new Date().toISOString(),
              classId: classes.find(c => c.class_members?.some(m => assignments.some(ass => ass.id === a.id)))?.id,
              courseId: a.course_id,
            }));

          const recent = assignments
            .filter(a => {
              if (!a.due_at) return true; // No due date = consider recent
              const dueDate = new Date(a.due_at);
              return dueDate < now;
            })
            .slice(0, 10)
            .map(a => ({
              id: a.id,
              title: a.title,
              type: a.course_id || 'course',
              completedAt: a.due_at || a.created_at,
              classId: classes.find(c => c.class_members?.some(m => assignments.some(ass => ass.id === a.id)))?.id,
              courseId: a.course_id,
            }));

          // Transform classes to ClassInfo format
          const classesInfo = classes.map(c => ({
            id: c.id,
            name: c.name,
            grade: 0, // Grade not available in Class type
            studentCount: c.student_count || c.class_members?.length || 0,
            avgProgress: 0, // Would need to calculate from student progress
          }));

          // Transform Edge Function response to TeacherDashboard format
          const dashboard: Dashboard = {
            role: 'teacher',
            userId: user.id,
            displayName: user.email?.split('@')[0] || 'Teacher',
            stats: {
              activeClasses,
              totalStudents,
              assignmentsActive,
              avgClassProgress,
              studentsNeedingHelp,
              coursesAssigned,
            },
            upcoming,
            recent,
            alerts: [], // Alerts would need separate Edge Function
            classes: classesInfo,
          };
          setDashboard(dashboard);
        } else if (role === 'parent') {
          // Parent dashboard requires parentId, not role
          // At this point we know user.id is defined (checked above)
          const response = await mcp.callGet<{
            parentId: string;
            children: Array<{
              studentId: string;
              studentName: string;
              linkStatus: string;
              linkedAt: string;
              metrics: {
                streakDays: number;
                xpTotal: number;
                lastLoginAt?: string;
                recentActivityCount: number;
              };
              upcomingAssignments: {
                count: number;
                items: Array<{
                  id: string;
                  title: string;
                  courseId?: string;
                  dueAt?: string;
                  status?: string;
                  progressPct?: number;
                }>;
              };
              alerts: {
                overdueAssignments: number;
                goalsBehind: number;
                needsAttention: boolean;
              };
            }>;
            summary: {
              totalChildren: number;
              totalAlerts: number;
              averageStreak: number;
              totalXp: number;
            };
            parentName?: string;
          }>('lms.parent-dashboard', { parentId: String(user.id) });

          // Calculate stats from children data
          const allAssignments = (response.children || []).flatMap(child => child.upcomingAssignments?.items || []);
          const completedAssignments = allAssignments.filter(a => a.status === 'completed');
          const avgAccuracy = completedAssignments.length > 0
            ? Math.round(completedAssignments.reduce((sum, a) => sum + (a.progressPct || 0), 0) / completedAssignments.length)
            : 0;

          // Estimate weekly minutes from recent activity count (assume ~5 minutes per activity)
          const weeklyMinutes = (response.children || []).reduce((sum, child) => 
            sum + (child.metrics?.recentActivityCount || 0) * 5, 0);

          // Calculate monthly progress from assignment progress percentages
          const monthlyProgress = allAssignments.length > 0
            ? Math.round(allAssignments.reduce((sum, a) => sum + (a.progressPct || 0), 0) / allAssignments.length)
            : 0;

          // Transform Edge Function response to ParentDashboard format
          const dashboard: Dashboard = {
            role: 'parent',
            userId: user.id,
            displayName: response.parentName || user.email?.split('@')[0] || 'Parent',
            stats: {
              children: response.summary?.totalChildren || 0,
              totalCoursesActive: response.children?.reduce((sum, child) => 
                sum + (child.upcomingAssignments?.items?.filter(a => a.status === 'in_progress').length || 0), 0) || 0,
              totalCoursesCompleted: response.children?.reduce((sum, child) => 
                sum + (child.upcomingAssignments?.items?.filter(a => a.status === 'completed').length || 0), 0) || 0,
              avgAccuracy,
              weeklyMinutes,
              monthlyProgress,
            },
            children: (response.children || []).map(child => {
              const childAssignments = child.upcomingAssignments?.items || [];
              const childCompleted = childAssignments.filter(a => a.status === 'completed');
              const childAvgAccuracy = childCompleted.length > 0
                ? Math.round(childCompleted.reduce((sum, a) => sum + (a.progressPct || 0), 0) / childCompleted.length)
                : 0;
              const childWeeklyMinutes = (child.metrics?.recentActivityCount || 0) * 5; // Estimate
              
              return {
                id: child.studentId,
                name: child.studentName,
                grade: 0, // Grade not available in parent-dashboard response
                coursesActive: child.upcomingAssignments?.items?.filter(a => a.status === 'in_progress').length || 0,
                coursesCompleted: child.upcomingAssignments?.items?.filter(a => a.status === 'completed').length || 0,
                currentStreak: child.metrics?.streakDays || 0,
                avgAccuracy: childAvgAccuracy,
                weeklyMinutes: childWeeklyMinutes,
              };
            }),
            upcoming: (response.children || []).flatMap(child =>
              (child.upcomingAssignments?.items || [])
                .filter(a => a.status !== 'completed' && a.dueAt)
                .map(a => ({
                  childId: child.studentId,
                  childName: child.studentName,
                  id: a.id,
                  title: a.title,
                  type: a.courseId || 'course',
                  dueDate: a.dueAt || new Date().toISOString(),
                  progress: a.progressPct || 0,
                  status: (a.progressPct || 0) >= 75 ? 'on-track' : 
                          (a.progressPct || 0) >= 40 ? 'needs-attention' : 'at-risk' as const,
                }))
            ),
            recent: (response.children || []).flatMap(child =>
              (child.upcomingAssignments?.items || [])
                .filter(a => a.status === 'completed')
                .map(a => ({
                  childId: child.studentId,
                  childName: child.studentName,
                  id: a.id,
                  title: a.title,
                  type: a.courseId || 'course',
                  completedAt: new Date().toISOString(), // TODO: Use actual completion date if available
                  score: 0, // TODO: Fetch score if available
                }))
            ),
            recommendations: [], // TODO: Fetch from recommendations Edge Function if needed
          };
          setDashboard(dashboard);
        } else {
          // school, admin - also use teacherId (same Edge Function)
          // At this point we know user.id is defined (checked above)
          
          // Fetch all required data in parallel for admin dashboard
          const [dashboardResponse, classesResponse, studentsResponse, catalogResponse, healthResponse] = await Promise.all([
            mcp.callGet<{
              role: string;
              stats: {
                sessions?: number;
                rounds?: number;
                attempts7d?: number;
                lastPlayedAt?: string | null;
                lastFinalScore?: number | null;
              };
            }>('lms.get-dashboard', { teacherId: String(user.id) }),
            mcp.listClasses().catch(() => ({ classes: [] })),
            mcp.listOrgStudents().catch(() => ({ students: [] })),
            mcp.getCourseCatalog().catch(() => ({ courses: [] })),
            mcp.call('lms.health', {}).catch(() => ({ ok: false, data: null })),
          ]);

          const classes = (classesResponse as { classes: Array<{ id: string; name: string }> }).classes || [];
          const students = (studentsResponse as { students: Array<{ id: string; name: string }> }).students || [];
          const courses = (catalogResponse as { courses?: Array<{ id: string; title: string }> }).courses || [];
          const health = (healthResponse as { ok: boolean; data?: { api?: { status?: string }; database?: { status?: string }; storage?: { status?: string }; uptime?: number; avgResponseTime?: number; errorRate?: number } }).data;

          // Count users by role (approximate - students list gives us student count)
          const totalStudents = students.length;
          // Teachers would need separate fetch - estimate from classes (assume 1 teacher per class)
          const totalTeachers = classes.length;
          // Organizations would need separate fetch - default to 1 for now
          const totalSchools = 1;
          const activeClasses = classes.length;
          const coursesPublished = courses.length;

          // Calculate average system progress (simplified - use dashboard rounds/sessions)
          const avgSystemProgress = dashboardResponse.stats?.rounds && dashboardResponse.stats?.sessions
            ? Math.round((dashboardResponse.stats.rounds / Math.max(dashboardResponse.stats.sessions, 1)) * 100)
            : 0;

          // Transform system health
          const systemHealth = {
            apiStatus: health?.api?.status || 'operational',
            databaseStatus: health?.database?.status || 'operational',
            storageStatus: health?.storage?.status || 'operational',
            uptime: health?.uptime || 99.9,
            avgResponseTime: health?.avgResponseTime || 0,
            errorRate: health?.errorRate || 0,
          };

          // Transform Edge Function response to AdminDashboard format
          const dashboard: Dashboard = {
            role: 'admin',
            userId: user.id,
            displayName: user.email?.split('@')[0] || 'Admin',
            stats: {
              totalSchools,
              totalStudents,
              totalTeachers,
              activeClasses,
              coursesPublished,
              avgSystemProgress,
              activeLicenses: totalStudents + totalTeachers, // Estimate licenses from user count
              licenseUsage: totalStudents + totalTeachers > 0 
                ? Math.round(((totalStudents + totalTeachers) / Math.max(totalStudents + totalTeachers, 1)) * 100)
                : 0,
            },
            upcoming: [], // Admin events would need separate Edge Function
            recent: [], // Admin activities would need separate Edge Function
            systemHealth,
            performance: {
              topSchools: [], // Analytics would need separate Edge Function
              coursePerformance: courses.slice(0, 5).map(c => ({
                id: c.id,
                title: c.title,
                totalEnrollments: 0, // Would need enrollment data
                completionRate: 0,
                avgScore: 0,
                avgTimeSpent: 0,
              })),
              userGrowth: [], // User growth would need separate Edge Function
            },
            alerts: [], // Alerts would need separate Edge Function
          };
          setDashboard(dashboard);
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
