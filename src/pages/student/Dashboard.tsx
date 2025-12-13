import { useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { StudentLayout } from "@/components/student/StudentLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { X, AlertCircle } from "lucide-react";
import { useStudentRange } from "@/hooks/useStudentRange";
import { useDashboard } from "@/hooks/useDashboard";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDawnData } from "@/contexts/DawnDataContext";
import { SummaryCardsStudent } from "@/components/student/SummaryCardsStudent";
import { WeeklyGoalRing } from "@/components/student/WeeklyGoalRing";
import { NextUpCard } from "@/components/student/NextUpCard";
import { ContinueCard } from "@/components/student/ContinueCard";
import { RecentSessionsStudent } from "@/components/student/RecentSessionsStudent";
import { AchievementsGlance } from "@/components/student/AchievementsGlance";
import { SkillCards } from "@/components/student/SkillCards";
import { StudentAssignments } from "@/components/student/StudentAssignments";
import {
  getStudentKpiData,
  getAssignmentsDue,
  getRecentStudentSessions,
  getStudentGoals,
  getStudentAchievements,
  getContinuePoint,
  type StudentAssignment,
} from "@/lib/student/mockSelectors";
import type { UpcomingItem } from "@/lib/types/dashboard";

const formatSubjectLabel = (type?: string | null) => {
  if (!type) return "Course";
  return type
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const priorityFromProgress = (progress?: number | null): "high" | "medium" | "low" => {
  if (progress === undefined || progress === null) return "high";
  if (progress >= 75) return "low";
  if (progress >= 40) return "medium";
  return "high";
};

const mapUpcomingToAssignment = (item: UpcomingItem): StudentAssignment => {
  const dueISO = item.dueDate ? new Date(item.dueDate).toISOString() : new Date().toISOString();

  return {
    id: item.id || `upcoming-${Math.random().toString(36).slice(2)}`,
    title: item.title || "Upcoming Assignment",
    subject: formatSubjectLabel(item.type),
    dueISO,
    priority: priorityFromProgress(item.progress),
  };
};

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { learnerProfiles, authRequired } = useDawnData();
  const { range, setRange, window: rangeWindow } = useStudentRange();
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

  if (!studentId) {
    return (
      <PageContainer>
        <StudentLayout>
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
        </StudentLayout>
      </PageContainer>
    );
  }

  const assignmentsFromDashboard =
    dashboard?.upcoming?.map(mapUpcomingToAssignment)?.filter(Boolean) ?? [];

  const assignmentsDue = assignmentsFromDashboard.length > 0
    ? assignmentsFromDashboard
    : getAssignmentsDue(rangeWindow);

  const kpiData = getStudentKpiData(rangeWindow);
  const sessions = getRecentStudentSessions(rangeWindow);
  const goals = getStudentGoals();
  const achievements = dashboard && 'achievements' in dashboard && dashboard.achievements && dashboard.achievements.length > 0
    ? dashboard.achievements.map((achievement) => ({
        id: achievement.id,
        name: achievement.title,
        earnedISO: achievement.earnedAt,
        }))
      : getStudentAchievements(rangeWindow);
  const continuePoint = getContinuePoint();

  const nextUpAssignment = assignmentsDue.find((a) => a.priority === 'high') || assignmentsDue[0] || null;
  const hasDueToday = assignmentsDue.some((a) => {
    const dueDate = new Date(a.dueISO);
    const today = new Date();
    return dueDate.toDateString() === today.toDateString();
  });

  const summaryData = {
    todayMinutes: kpiData.activeMinutes,
    weekMinutes: range === 'day' ? kpiData.activeMinutes * 4 : range === 'week' ? 180 : 720,
    monthMinutes: range === 'month' ? 720 : 180 * 4,
    todayItems: kpiData.itemsCompleted,
    weekItems: range === 'day' ? kpiData.itemsCompleted * 4 : range === 'week' ? 58 : 245,
    monthItems: range === 'month' ? 245 : 58 * 4,
    todayAccuracyPct: kpiData.accuracyPct,
    streakDays: kpiData.streakDays,
    minutesSparkline: kpiData.sparkline,
    itemsSparkline: kpiData.sparkline.map((v) => Math.round(v * 0.5)),
    minutesDeltaVsLastWeek: kpiData.deltaVsLastWeek,
    itemsDeltaVsLastWeek: kpiData.deltaVsLastWeek - 3,
  };

  const _recommendations = [
    { id: 'r1', title: 'Practice multiplication tables for 10 minutes', courseId: 'math-multiplication', level: 2 },
    { id: 'r2', title: 'Review fractions concepts', courseId: 'math-fractions', level: 1 },
  ];

  const overallPercent = ((goals.actualMinutes / goals.goalMinutes + goals.actualItems / goals.goalItems) / 2) * 100;
  const onTrack = overallPercent >= 80;

  return (
    <PageContainer>
      <StudentLayout>
        <div className="space-y-6">
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
            <div className="flex items-center gap-3">
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                <Button
                  variant={range === 'day' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setRange('day')}
                  className="h-8 px-3"
                >
                  Day
                </Button>
                <Button
                  variant={range === 'week' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setRange('week')}
                  className="h-8 px-3"
                >
                  Week
                </Button>
                <Button
                  variant={range === 'month' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setRange('month')}
                  className="h-8 px-3"
                >
                  Month
                </Button>
              </div>
              <Badge 
                variant={onTrack ? "default" : "secondary"} 
                className="px-3 py-1"
                role="status"
                aria-live="polite"
              >
                {onTrack ? '✓ On Track' : 'Keep Going'}
              </Badge>
            </div>
          </div>

          {/* Row 1: KPI Cards */}
          <SummaryCardsStudent {...summaryData} />

          {/* Row 2: Goal Ring + Next Up */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeeklyGoalRing {...goals} />
            <NextUpCard assignment={nextUpAssignment} />
          </div>

          {/* Row 3: Knowledge Map Assignments (if any) */}
          <StudentAssignments studentId={studentId} />

          {/* Row 4: Continue + Skills Focus */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ContinueCard continuePoint={continuePoint} />
            <SkillCards studentId={studentId} />
          </div>

          {/* Row 5: Recent Sessions + Achievements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentSessionsStudent sessions={sessions.slice(0, 3)} />
            <AchievementsGlance achievements={achievements} />
          </div>
        </div>
      </StudentLayout>
    </PageContainer>
  );
}

