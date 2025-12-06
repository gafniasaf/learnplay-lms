import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Baby, Gamepad2, Trophy, Flame, Star, Clock, Activity, Calendar, AlertCircle, ArrowRight } from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { getApiMode, listAssignments, type Assignment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const Kids = () => {
  const { dashboard, loading, error } = useDashboard("student");
  const isLive = getApiMode() === "live";
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Load assignments in live mode
  useEffect(() => {
    if (isLive) {
      const loadAssignments = async () => {
        try {
          setLoadingAssignments(true);
          const data = await listAssignments();
          setAssignments(data.assignments);
        } catch (err) {
          console.error("Failed to load assignments:", err);
        } finally {
          setLoadingAssignments(false);
        }
      };
      loadAssignments();
    }
  }, [isLive]);

  if (loading) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <div className="inline-flex p-6 rounded-2xl bg-role-kids/10 mb-4 animate-pulse">
            <Baby className="h-12 w-12 text-role-kids" />
          </div>
          <p className="text-xl font-medium">Loading your dashboard...</p>
        </div>
      </PageContainer>
    );
  }

  if (error || !dashboard) {
    return (
      <PageContainer>
        <p className="text-center text-muted-foreground">
          {error ? error.message : "Failed to load dashboard"}
        </p>
      </PageContainer>
    );
  }

  // Live mode: use minimal stats from edge function
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
          {/* Hero Section */}
          <div className="mb-12 text-center">
            <div className="inline-flex p-4 rounded-2xl bg-role-kids/10 mb-4">
              <Baby className="h-12 w-12 text-role-kids" />
            </div>
            <h1 className="text-4xl font-bold mb-2">Welcome back!</h1>
            <p className="text-xl text-muted-foreground">Ready to learn and play?</p>
          </div>

          {/* Stats Grid - Live Mode */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-role-kids/10 to-role-kids/5 border border-role-kids/20">
              <Activity className="h-8 w-8 text-role-kids mb-2" />
              <p className="text-2xl font-bold">{stats.sessions ?? 0}</p>
              <p className="text-sm text-muted-foreground">Sessions</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
              <Gamepad2 className="h-8 w-8 text-accent mb-2" />
              <p className="text-2xl font-bold">{stats.rounds ?? 0}</p>
              <p className="text-sm text-muted-foreground">Rounds</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20">
              <Flame className="h-8 w-8 text-orange-500 mb-2" />
              <p className="text-2xl font-bold">{stats.attempts7d ?? 0}</p>
              <p className="text-sm text-muted-foreground">Attempts (7d)</p>
            </div>
            
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
              <Trophy className="h-8 w-8 text-primary mb-2" />
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

          {/* Due Soon Panel - Live Mode Only */}
          {isLive && (
            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Due Soon</h2>
                {assignments.length > 0 && (
                  <Link to="/student/assignments">
                    <Button variant="outline" size="sm">
                      View All
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
              {loadingAssignments ? (
                <div className="p-8 rounded-2xl border bg-card text-center">
                  <p className="text-muted-foreground">Loading assignments...</p>
                </div>
              ) : assignments.length === 0 ? (
                <div className="p-8 rounded-2xl border bg-card text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No assignments due</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Your teacher hasn't assigned any courses yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {assignments.slice(0, 4).map((assignment) => {
                    const isPastDue = assignment.due_at && new Date(assignment.due_at) < new Date();
                    const isUpcoming = assignment.due_at && new Date(assignment.due_at) >= new Date();
                    
                    return (
                      <div
                        key={assignment.id}
                        className="p-6 rounded-2xl border bg-card hover:shadow-lg transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1">{assignment.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              Course: {assignment.course_id}
                            </p>
                          </div>
                          {isPastDue && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                              <AlertCircle className="h-3 w-3" />
                              Past due
                            </div>
                          )}
                          {isUpcoming && (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              <Clock className="h-3 w-3" />
                              Due soon
                            </div>
                          )}
                        </div>

                        {assignment.due_at && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                            <Calendar className="h-4 w-4" />
                            Due {format(new Date(assignment.due_at), "MMM d, yyyy")}
                          </div>
                        )}

                        <Link to={`/play/${assignment.course_id}/welcome?assignmentId=${assignment.id}`}>
                          <Button className="w-full">
                            <Gamepad2 className="h-4 w-4 mr-2" />
                            Start Course
                          </Button>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Start Playing</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Link
                to="/play/modals/welcome"
                className="group p-6 rounded-2xl border bg-card hover:shadow-lg hover:scale-[1.02] transition-all"
              >
                <div className="p-3 rounded-2xl bg-role-kids/10 group-hover:bg-role-kids/20 transition-colors inline-flex mb-4">
                  <Gamepad2 className="h-6 w-6 text-role-kids" />
                </div>
                <h3 className="text-lg font-semibold mb-2">English Modals</h3>
                <p className="text-sm text-muted-foreground">Practice modal verbs (can, could, may, might...)</p>
              </Link>
              
              <Link
                to="/play/verbs/welcome"
                className="group p-6 rounded-2xl border bg-card hover:shadow-lg hover:scale-[1.02] transition-all"
              >
                <div className="p-3 rounded-2xl bg-role-kids/10 group-hover:bg-role-kids/20 transition-colors inline-flex mb-4">
                  <Star className="h-6 w-6 text-role-kids" />
                </div>
                <h3 className="text-lg font-semibold mb-2">English Verbs</h3>
                <p className="text-sm text-muted-foreground">Master verb forms and tenses</p>
              </Link>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Mock mode: use full dashboard structure (backward compatible)
  const mockDashboard = dashboard as any;

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="mb-12 text-center">
          <div className="inline-flex p-4 rounded-2xl bg-role-kids/10 mb-4">
            <Baby className="h-12 w-12 text-role-kids" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Welcome back, {mockDashboard.displayName?.split(" ")[0] || "Student"}!</h1>
          <p className="text-xl text-muted-foreground">Ready to learn and play?</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-role-kids/10 to-role-kids/5 border border-role-kids/20">
            <Gamepad2 className="h-8 w-8 text-role-kids mb-2" />
            <p className="text-2xl font-bold">{mockDashboard.stats?.coursesInProgress ?? 0}</p>
            <p className="text-sm text-muted-foreground">Active Courses</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
            <Trophy className="h-8 w-8 text-accent mb-2" />
            <p className="text-2xl font-bold">{mockDashboard.stats?.totalPoints ?? 0}</p>
            <p className="text-sm text-muted-foreground">Total Points</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20">
            <Flame className="h-8 w-8 text-orange-500 mb-2" />
            <p className="text-2xl font-bold">{mockDashboard.stats?.currentStreak ?? 0}</p>
            <p className="text-sm text-muted-foreground">Day Streak</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <Star className="h-8 w-8 text-primary mb-2" />
            <p className="text-2xl font-bold">{mockDashboard.stats?.accuracyRate ?? 0}%</p>
            <p className="text-sm text-muted-foreground">Accuracy</p>
          </div>
        </div>

        {/* Continue Learning */}
        {mockDashboard.upcoming && mockDashboard.upcoming.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Continue Learning</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {mockDashboard.upcoming.map((course: any) => (
                <Link
                  key={course.id}
                  to={`/play/${course.id}/welcome`}
                  className="group p-6 rounded-2xl border bg-card hover:shadow-lg hover:scale-[1.02] transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-2xl bg-role-kids/10 group-hover:bg-role-kids/20 transition-colors">
                      <Gamepad2 className="h-6 w-6 text-role-kids" />
                    </div>
                    <div className="text-sm font-medium px-3 py-1 rounded-full bg-primary/10 text-primary">
                      Level {course.nextLevel}
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-semibold mb-2">{course.title}</h3>
                  
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{course.progress}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-role-kids transition-all"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 mr-1" />
                    Due {new Date(course.dueDate).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Grades */}
        {mockDashboard.recent && mockDashboard.recent.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Recent Completions</h2>
            <div className="space-y-4">
              {mockDashboard.recent.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-6 rounded-2xl border bg-card"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-accent/10">
                      <Trophy className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        Completed {new Date(item.completedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-2xl font-bold text-accent">{item.score}%</div>
                    <div className="text-sm text-muted-foreground">Level {item.level}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default Kids;
