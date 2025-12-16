import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { GraduationCap, UsersRound, BookOpen, BarChart3, TrendingUp, Activity, Gamepad2, Clock } from "lucide-react";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { getApiMode } from "@/lib/api";
import type { SchoolDashboard } from "@/lib/types/dashboard";
import { toast } from "sonner";

const Schools = () => {
  const mcp = useMCP();
  const { user, loading: authLoading } = useAuth();
  const [dashboard, setDashboard] = useState<SchoolDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to load
    if (authLoading) return;
    
    // If user is not authenticated, don't try to fetch
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    const loadDashboard = async () => {
      try {
        const data = await mcp.getDashboard("school", user.id) as SchoolDashboard;
        setDashboard(data);
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [user?.id, authLoading, mcp]);

  if (loading) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <div className="inline-flex p-6 rounded-2xl bg-role-schools/10 mb-4 animate-pulse">
            <GraduationCap className="h-12 w-12 text-role-schools" />
          </div>
          <p className="text-xl font-medium">Loading school dashboard...</p>
        </div>
      </PageContainer>
    );
  }

  if (!dashboard) {
    return (
      <PageContainer>
        <p className="text-center text-muted-foreground">Failed to load dashboard</p>
      </PageContainer>
    );
  }

  const isLive = getApiMode() === "live";

  // Live mode: show simple stats
  if (isLive && "stats" in dashboard && typeof dashboard.stats === "object") {
    const stats = dashboard.stats as {
      sessions?: number;
      rounds?: number;
      attempts7d?: number;
      lastPlayedAt?: string | null;
      lastFinalScore?: number | null;
    };

    return (
      <PageContainer>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 rounded-2xl bg-role-schools/10">
              <GraduationCap className="h-8 w-8 text-role-schools" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">School Portal</h1>
              <p className="text-muted-foreground">School administration dashboard</p>
            </div>
          </div>

          {/* Stats Grid - Live Mode */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-role-schools/10 to-role-schools/5 border border-role-schools/20">
              <Activity className="h-8 w-8 text-role-schools mb-2" />
              <p className="text-2xl font-bold">{stats.sessions ?? 0}</p>
              <p className="text-sm text-muted-foreground">Sessions</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
              <Gamepad2 className="h-8 w-8 text-accent mb-2" />
              <p className="text-2xl font-bold">{stats.rounds ?? 0}</p>
              <p className="text-sm text-muted-foreground">Rounds</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20">
              <TrendingUp className="h-8 w-8 text-orange-500 mb-2" />
              <p className="text-2xl font-bold">{stats.attempts7d ?? 0}</p>
              <p className="text-sm text-muted-foreground">Attempts (7d)</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <BarChart3 className="h-8 w-8 text-primary mb-2" />
              <p className="text-2xl font-bold">{stats.lastFinalScore ?? "—"}</p>
              <p className="text-sm text-muted-foreground">Last Score</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
              <Clock className="h-8 w-8 text-green-500 mb-2" />
              <p className="text-sm font-medium">
                {stats.lastPlayedAt 
                  ? new Date(stats.lastPlayedAt).toLocaleDateString() 
                  : "Never"}
              </p>
              <p className="text-sm text-muted-foreground">Last Played</p>
            </div>
          </div>

          <div className="p-8 rounded-2xl border bg-card text-center">
            <p className="text-muted-foreground">Live mode - Showing basic statistics</p>
            <p className="text-sm text-muted-foreground mt-2">Full school features coming soon</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Mock mode: use full dashboard structure
  const schoolDashboard = dashboard as SchoolDashboard;

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-role-schools/10">
            <GraduationCap className="h-8 w-8 text-role-schools" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">School Portal</h1>
            <p className="text-muted-foreground">{schoolDashboard.displayName}</p>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-role-schools/10 to-role-schools/5 border border-role-schools/20">
            <UsersRound className="h-8 w-8 text-role-schools mb-2" />
            <p className="text-2xl font-bold">{schoolDashboard.stats.totalStudents}</p>
            <p className="text-sm text-muted-foreground">Students</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <GraduationCap className="h-8 w-8 text-primary mb-2" />
            <p className="text-2xl font-bold">{schoolDashboard.stats.totalTeachers}</p>
            <p className="text-sm text-muted-foreground">Teachers</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
            <BookOpen className="h-8 w-8 text-accent mb-2" />
            <p className="text-2xl font-bold">{schoolDashboard.stats.activeClasses}</p>
            <p className="text-sm text-muted-foreground">Active Classes</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
            <TrendingUp className="h-8 w-8 text-green-500 mb-2" />
            <p className="text-2xl font-bold">{schoolDashboard.stats.avgStudentProgress}%</p>
            <p className="text-sm text-muted-foreground">Avg Progress</p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Quick Access</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              className="p-6 rounded-2xl border bg-card hover:shadow-lg hover:scale-[1.02] transition-all text-left"
              data-cta-id="schools-quick-manage-classes"
              data-action="blocked"
              onClick={() => toast.message("Manage Classes is not implemented yet.")}
            >
              <UsersRound className="h-10 w-10 text-role-schools mb-4" />
              <h3 className="text-xl font-semibold mb-2">Manage Classes</h3>
              <p className="text-muted-foreground">View and organize all classes</p>
            </button>

            <button
              className="p-6 rounded-2xl border bg-card hover:shadow-lg hover:scale-[1.02] transition-all text-left"
              data-cta-id="schools-quick-course-catalog"
              data-action="blocked"
              onClick={() => toast.message("Course Catalog is not implemented yet.")}
            >
              <BookOpen className="h-10 w-10 text-role-schools mb-4" />
              <h3 className="text-xl font-semibold mb-2">Course Catalog</h3>
              <p className="text-muted-foreground">Browse available courses</p>
            </button>

            <button
              className="p-6 rounded-2xl border bg-card hover:shadow-lg hover:scale-[1.02] transition-all text-left"
              data-cta-id="schools-quick-analytics"
              data-action="blocked"
              onClick={() => toast.message("School analytics is not implemented yet.")}
            >
              <BarChart3 className="h-10 w-10 text-role-schools mb-4" />
              <h3 className="text-xl font-semibold mb-2">Analytics</h3>
              <p className="text-muted-foreground">View school-wide reports</p>
            </button>
          </div>
        </div>

        {/* Performance by Grade */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Performance by Grade</h2>
          <div className="space-y-4">
            {schoolDashboard.performance.byGrade.map((grade) => (
              <div
                key={grade.grade}
                className="flex items-center justify-between p-6 rounded-2xl border bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-role-schools/10">
                    <span className="text-2xl font-bold text-role-schools">
                      {grade.grade}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold">Grade {grade.grade}</h3>
                    <p className="text-sm text-muted-foreground">
                      {grade.students} students
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Progress</p>
                    <p className="text-xl font-bold">{grade.avgProgress}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Accuracy</p>
                    <p className="text-xl font-bold text-accent">{grade.avgAccuracy}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Courses */}
        <div>
          <h2 className="text-2xl font-bold mb-6">Most Popular Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {schoolDashboard.performance.topCourses.map((course) => (
              <div
                key={course.id}
                className="p-6 rounded-2xl border bg-card"
              >
                <BookOpen className="h-8 w-8 text-role-schools mb-4" />
                <h3 className="font-semibold mb-2">{course.title}</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {course.enrollments} students
                  </span>
                  <span className="font-bold text-accent">{course.avgScore}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default Schools;
