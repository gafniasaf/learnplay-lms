import { PageContainer } from "@/components/layout/PageContainer";
import { StudentLayout } from "@/components/student/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Target } from "lucide-react";
import { getStudentGoals } from "@/lib/student/mockSelectors";
import { useStudentGoals } from "@/hooks/useStudentGoals";
// useMockData removed - useStudentGoals handles mock mode internally
import { aggregateStudentGoalProgress } from "@/lib/student/goalsMappers";

export default function StudentGoals() {
  const mockMode = (import.meta as any).env?.VITE_USE_MOCK === 'true';
  const { data, isLoading, isError, error, refetch } = useStudentGoals();

  if (isLoading) {
    return (
      <PageContainer>
        <StudentLayout>
          <div className="py-12 text-center text-muted-foreground">Loading goals…</div>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : "Unable to load goals.";

    return (
      <PageContainer>
        <StudentLayout>
          <Alert variant="destructive" className="max-w-xl">
            <AlertTitle>Unable to load goals</AlertTitle>
            <AlertDescription>
              <p className="mb-4">{message}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (!mockMode && data && data.goals.length === 0) {
    return (
      <PageContainer>
        <StudentLayout>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">My Goals</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No goals have been assigned yet. Check back soon or ask your teacher for new learning targets.
              </p>
            </CardContent>
          </Card>
        </StudentLayout>
      </PageContainer>
    );
  }

  const liveProgress = !mockMode ? aggregateStudentGoalProgress(data) : null;
  const goals = liveProgress ?? getStudentGoals();
  const minutesPercent = Math.min((goals.actualMinutes / goals.goalMinutes) * 100, 100);
  const itemsPercent = Math.min((goals.actualItems / goals.goalItems) * 100, 100);
  const minutesRemaining = Math.max(goals.goalMinutes - goals.actualMinutes, 0);
  const itemsRemaining = Math.max(goals.goalItems - goals.actualItems, 0);

  return (
    <PageContainer>
      <StudentLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">My Goals</h2>
            <p className="text-sm text-muted-foreground">Track your weekly learning targets</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Weekly Goals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-medium">Active Minutes</span>
                  <span className="text-sm text-muted-foreground">
                    {goals.actualMinutes} / {goals.goalMinutes} min
                  </span>
                </div>
                <Progress value={minutesPercent} className="h-3" aria-label={`${minutesPercent.toFixed(0)}% of weekly minute goal`} />
                <p className="text-xs text-muted-foreground mt-1">
                  {minutesPercent >= 100 ? '🎉 Goal completed!' : `${minutesRemaining} min remaining`}
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-medium">Items Completed</span>
                  <span className="text-sm text-muted-foreground">
                    {goals.actualItems} / {goals.goalItems} items
                  </span>
                </div>
                <Progress value={itemsPercent} className="h-3" aria-label={`${itemsPercent.toFixed(0)}% of weekly items goal`} />
                <p className="text-xs text-muted-foreground mt-1">
                  {itemsPercent >= 100 ? '🎉 Goal completed!' : `${itemsRemaining} items remaining`}
                </p>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground text-center">
                  Goals are set by your teacher. Keep up the great work!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    </PageContainer>
  );
}

