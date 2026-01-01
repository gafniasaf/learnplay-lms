import { useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { StudentLayout } from "@/components/student/StudentLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { X, AlertCircle } from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDawnData } from "@/contexts/DawnDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentDashboard as StudentDashboardType } from "@/lib/types/dashboard";

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { learnerProfiles, authRequired } = useDawnData();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { dashboard, loading, error } = useDashboard("student");

  const studentId = useMemo(() => {
    const explicit = searchParams.get("studentId") ?? searchParams.get("learnerId");
    if (explicit) return explicit;
    if (learnerProfiles.length === 1) return learnerProfiles[0]!.id;
    return null;
  }, [searchParams, learnerProfiles]);

  if (authRequired) {
    return (
      <PageContainer>
        <StudentLayout>
          <Alert className="border-warning bg-warning/10">
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertDescription>
              You must be logged in to view the Student dashboard.
            </AlertDescription>
          </Alert>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <StudentLayout>
          <div className="space-y-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <StudentLayout>
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <h1 className="text-2xl font-semibold">Unable to load dashboard</h1>
            <p className="text-muted-foreground max-w-md">
              We couldn’t fetch your latest learning stats. Please try again.
            </p>
            <Button variant="outline" onClick={() => globalThis.location.reload()}>
              Retry
            </Button>
          </div>
        </StudentLayout>
      </PageContainer>
    );
  }

  const studentDashboard: StudentDashboardType | null =
    dashboard && dashboard.role === "student" ? (dashboard as StudentDashboardType) : null;

  const hasDueToday = (dashboard?.upcoming ?? []).some((a) => {
    const dueDate = new Date(a.dueDate);
    const today = new Date();
    return dueDate.toDateString() === today.toDateString();
  });

  return (
    <PageContainer>
      <StudentLayout>
        <div className="space-y-6">
          {/* Missing learner profile guidance (do not block rendering) */}
          {!studentId && (
            <div className="space-y-4">
              <Alert className="border-warning bg-warning/10">
                <AlertCircle className="h-4 w-4 text-warning" />
                <AlertDescription>
                  This dashboard needs a learner id. Add <code>?studentId=&lt;id&gt;</code> (or{" "}
                  <code>?learnerId=&lt;id&gt;</code>) to the URL, or create a learner profile.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button variant="default" onClick={() => navigate("/workspace/learner-profile/new")}>
                  Create Learner Profile
                </Button>
                <Button variant="outline" onClick={() => navigate("/admin/system-health")}>
                  Check System Health
                </Button>
              </div>
            </div>
          )}

          {/* Due Today Banner */}
          {hasDueToday && !bannerDismissed && (
            <Alert className="border-warning bg-warning/10">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertDescription className="flex items-center justify-between">
                <span>You have an assignment due today!</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setBannerDismissed(true)}
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight">My Learning</h1>
              <p className="text-muted-foreground">Track your progress and keep learning!</p>
            </div>
          </div>

          {/* Quick stats (only fields available in live payload) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Courses in progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{studentDashboard?.stats?.coursesInProgress ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Courses completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{studentDashboard?.stats?.coursesCompleted ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{studentDashboard?.stats?.accuracyRate ?? 0}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Streak</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{studentDashboard?.stats?.currentStreak ?? 0} days</div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Some legacy dashboard widgets (minutes/items trends, weekly goals, recent sessions, continue point, skill map)
              aren’t wired in live mode yet. This page shows the live fields that are currently available.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(dashboard?.upcoming ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming items returned.</p>
                ) : (
                  (dashboard?.upcoming ?? []).slice(0, 5).map((u) => (
                    <div key={u.id} className="text-sm flex items-center justify-between gap-3">
                      <span className="font-medium">{u.title}</span>
                      <span className="text-muted-foreground">{new Date(u.dueDate).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("/student/assignments")}>
                    View assignments
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(dashboard?.recent ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent items returned.</p>
                ) : (
                  (dashboard?.recent ?? []).slice(0, 5).map((r) => (
                    <div key={r.id} className="text-sm flex items-center justify-between gap-3">
                      <span className="font-medium">{r.title}</span>
                      <span className="text-muted-foreground">{new Date(r.completedAt).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </StudentLayout>
    </PageContainer>
  );
}

