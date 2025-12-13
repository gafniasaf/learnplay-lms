import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { EditableGoalsPanel } from "@/components/parent/EditableGoalsPanel";
import { AlertsPanel, type Alert as ParentAlert } from "@/components/parent/AlertsPanel";
import { WeeklyComparisonChart } from "@/components/parent/WeeklyComparisonChart";
import { PageContainer } from "@/components/layout/PageContainer";
import { ParentLayout } from "@/components/parent/ParentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, BookOpenCheck, Target, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useParentGoals } from "@/hooks/useParentGoals";
// useMockData removed - useParentGoals handles mock mode internally
import type {
  ParentGoalRecord,
  ParentGoalsResponse,
  ParentGoalsSummary,
} from "@/lib/api/parentGoals";

interface AggregatedGoals {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

const formatGoalStatus = (status: ParentGoalRecord["status"]) => {
  switch (status) {
    case "on_track":
      return "On Track";
    case "behind":
      return "Behind";
    case "completed":
      return "Completed";
    default:
      return "Unknown";
  }
};

const aggregateGoals = (goals: ParentGoalRecord[]): AggregatedGoals => {
  const goalMinutes = goals.reduce((total, goal) => total + (goal.targetMinutes ?? 0), 0);
  const actualMinutes = goals.reduce((total, goal) => total + (goal.progressMinutes ?? 0), 0);
  const goalItems = goals.length;
  const actualItems = goals.filter((goal) => goal.status === "completed").length;

  return {
    goalMinutes,
    actualMinutes,
    goalItems,
    actualItems,
  };
};

const buildWeeklyComparison = (
  goals: ParentGoalRecord[],
  summary: ParentGoalsSummary | null
) => {
  const aggregates = aggregateGoals(goals);
  const totalMinutesTarget = aggregates.goalMinutes || 1;
  const totalMinutesActual = aggregates.actualMinutes;
  const completedGoals = aggregates.actualItems;
  const totalGoals = aggregates.goalItems || 1;
  const averageProgress = summary?.averageProgress ?? 0;

  return {
    thisWeek: {
      minutes: totalMinutesActual,
      items: completedGoals,
      accuracy: averageProgress,
    },
    lastWeek: {
      minutes: totalMinutesTarget,
      items: totalGoals,
      accuracy: 100,
    },
  };
};

const deriveAlerts = (goals: ParentGoalRecord[]): ParentAlert[] => {
  const alerts: ParentAlert[] = goals
    .map<ParentAlert | null>((goal) => {
      if (goal.isOverdue) {
        return {
          id: `${goal.id}-overdue`,
          type: "inactivity",
          message: `${goal.studentName} missed the goal "${goal.title}". Consider revisiting this topic together.`,
          ctaLabel: "Review plan",
        };
      }

      if (goal.status === "behind") {
        return {
          id: `${goal.id}-behind`,
          type: "accuracy",
          message: `${goal.studentName} is behind on "${goal.title}" (${goal.progressPct}% complete). A quick check-in could help.`,
          ctaLabel: "Offer support",
        };
      }

      if (goal.status === "completed") {
        return {
          id: `${goal.id}-celebrate`,
          type: "streak",
          message: `${goal.studentName} completed "${goal.title}"—great work staying on track!`,
          ctaLabel: "Celebrate",
        };
      }

      if (goal.daysRemaining !== null && goal.daysRemaining <= 2) {
        return {
          id: `${goal.id}-due-soon`,
          type: "streak",
          message: `${goal.title} is due in ${goal.daysRemaining} days. A short practice session could close the gap.`,
          ctaLabel: "Plan session",
        };
      }

      if (goal.progressPct < 40) {
        return {
          id: `${goal.id}-motivate`,
          type: "frustration",
          message: `${goal.studentName} has completed ${goal.progressPct}% of "${goal.title}". Consider breaking this goal into smaller steps.`,
          ctaLabel: "Adjust goal",
        };
      }

      return null;
    })
    .filter((alert): alert is ParentAlert => Boolean(alert));

  return alerts.slice(0, 4);
};

// Mock responses removed: this page must not fabricate parent goals.

export default function Goals() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studentIdParam = searchParams.get("studentId") ?? undefined;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useParentGoals(
    { studentId: studentIdParam },
    {}
  );

  const response = useMemo(() => {
    if (!data) {
      return null;
    }

    const goals = data.goals ?? [];
    const summary = data.summary ?? {
      totalGoals: goals.length,
      onTrack: goals.filter((goal) => goal.status === "on_track").length,
      behind: goals.filter((goal) => goal.status === "behind").length,
      completed: goals.filter((goal) => goal.status === "completed").length,
      overdue: goals.filter((goal) => goal.isOverdue).length,
      averageProgress:
        goals.length > 0
          ? Math.round(
              goals.reduce((total, goal) => total + (goal.progressPct ?? 0), 0) / goals.length
            )
          : 0,
    } satisfies ParentGoalsSummary;

    return {
      goals,
      summary,
      emptyState: Boolean(data.emptyState),
      message: data.message,
    } satisfies ParentGoalsResponse;
  }, [data]);

  const aggregated = useMemo(() => aggregateGoals(response?.goals ?? []), [response?.goals]);

  const [editableGoals, setEditableGoals] = useState<AggregatedGoals>(aggregated);

  useEffect(() => {
    setEditableGoals(aggregated);
  }, [aggregated.goalMinutes, aggregated.goalItems, aggregated.actualMinutes, aggregated.actualItems]);

  const weeklyComparison = useMemo(
    () => buildWeeklyComparison(response?.goals ?? [], response?.summary ?? null),
    [response?.goals, response?.summary]
  );

  const derivedAlerts = useMemo(() => deriveAlerts(response?.goals ?? []), [response?.goals]);

  if (!studentIdParam) {
    return (
      <PageContainer>
        <ParentLayout>
          <Alert className="border-warning bg-warning/10">
            <AlertTitle>Student required</AlertTitle>
            <AlertDescription>
              This page needs a learner id. Add <code>?studentId=&lt;id&gt;</code> to the URL, or link a child first.
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/parent/link-child")}>
                  Link Child
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/parent/dashboard")}>
                  Back to Parent Dashboard
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  const handleGoalsUpdate = (updates: { goalMinutes: number; goalItems: number }) => {
    setEditableGoals((prev) => ({
      ...prev,
      goalMinutes: updates.goalMinutes,
      goalItems: updates.goalItems,
    }));

    toast({
      title: "Goals updated",
      description: `Weekly targets set to ${updates.goalMinutes} minutes across ${updates.goalItems} goals.`,
    });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <ParentLayout>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading goals…
            </CardContent>
          </Card>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <ParentLayout>
          <Alert variant="destructive">
            <AlertTitle>Unable to load goals</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Please try again shortly."}
              <Button className="mt-4" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (!response) {
    return (
      <PageContainer>
        <ParentLayout>
          <Alert variant="destructive">
            <AlertTitle>Unable to load goals</AlertTitle>
            <AlertDescription>
              No data was returned. Please try again.
              <Button className="mt-4" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </ParentLayout>
      </PageContainer>
    );
  }

  if (response.emptyState) {
    return (
      <PageContainer>
        <ParentLayout>
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-success opacity-60" />
              <h2 className="text-lg font-semibold">No active goals yet</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {response.message ?? "Once a teacher assigns goals, they will appear here."}
              </p>
            </CardContent>
          </Card>
        </ParentLayout>
      </PageContainer>
    );
  }

  const summary = response.summary ?? {
    totalGoals: 0,
    onTrack: 0,
    behind: 0,
    completed: 0,
    overdue: 0,
    averageProgress: 0,
  };

  return (
    <PageContainer>
      <ParentLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Goals & Alerts</h1>
            <p className="text-muted-foreground mt-2">
              Monitor weekly goals, celebrate wins, and spot areas that need support.
            </p>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm space-y-1">
                <p className="font-medium">Live learning goals</p>
                <p className="text-muted-foreground">
                  Goals reflect the latest data from Supabase. Adjust weekly targets to align with your family's routines—changes save locally for now.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Total goals</p>
                    <p className="text-2xl font-bold mt-1">{summary.totalGoals}</p>
                  </div>
                  <BookOpenCheck className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Average progress</p>
                    <p className="text-2xl font-bold mt-1">{summary.averageProgress}%</p>
                  </div>
                  <Target className="h-5 w-5 text-success" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">On track</p>
                    <p className="text-2xl font-bold mt-1">{summary.onTrack}</p>
                  </div>
                  <Badge variant="default">{summary.completed} completed</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Needs attention</p>
                    <p className="text-2xl font-bold mt-1">{summary.behind + summary.overdue}</p>
                  </div>
                  <Badge variant="destructive">{summary.overdue} overdue</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <WeeklyComparisonChart {...weeklyComparison} />

          <div className="grid gap-6 lg:grid-cols-2">
            <EditableGoalsPanel
              goalMinutes={editableGoals.goalMinutes}
              actualMinutes={aggregated.actualMinutes}
              goalItems={editableGoals.goalItems}
              actualItems={aggregated.actualItems}
              onGoalsUpdate={handleGoalsUpdate}
            />
            <AlertsPanel alerts={derivedAlerts} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Active Goals</CardTitle>
                <Badge variant="secondary">{summary.totalGoals}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Detailed view of each goal, due dates, and progress toward completion.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(response.goals ?? []).map((goal) => {
                  const dueLabel = goal.dueAt
                    ? formatDistanceToNow(parseISO(goal.dueAt), { addSuffix: true })
                    : "No due date";
                  const formattedDueDate = goal.dueAt ? format(parseISO(goal.dueAt), "PPP") : null;

                  return (
                    <div key={goal.id} className="border rounded-xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-lg">{goal.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {goal.studentName} · {goal.progressMinutes} / {goal.targetMinutes} min
                          </p>
                        </div>
                        <Badge variant={goal.status === "completed" ? "default" : goal.status === "on_track" ? "default" : "destructive"}>
                          {formatGoalStatus(goal.status)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Progress: {goal.progressPct}%</span>
                        <span>Due {dueLabel}{formattedDueDate ? ` (${formattedDueDate})` : ""}</span>
                        {goal.teacherNote && <span>Note: {goal.teacherNote}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </ParentLayout>
    </PageContainer>
  );
}
