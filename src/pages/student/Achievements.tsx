import { PageContainer } from "@/components/layout/PageContainer";
import { StudentLayout } from "@/components/student/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Award, Trophy } from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";

export default function StudentAchievements() {
  const { dashboard, loading, error } = useDashboard("student");

  if (loading) {
    return (
      <PageContainer>
        <StudentLayout>
          <div className="py-12 text-center text-muted-foreground">Loading achievements…</div>
        </StudentLayout>
      </PageContainer>
    );
  }

  if (error || !dashboard || dashboard.role !== "student") {
    const message = error?.message || "Student dashboard not available.";
    return (
      <PageContainer>
        <StudentLayout>
          <Alert variant="destructive" className="max-w-xl">
            <AlertTitle>Unable to load achievements</AlertTitle>
            <AlertDescription>
              <p className="mb-4">{message}</p>
              <Button variant="outline" size="sm" onClick={() => globalThis.location.reload()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </StudentLayout>
      </PageContainer>
    );
  }

  const achievements = dashboard.achievements ?? [];

  return (
    <PageContainer>
      <StudentLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Achievements</h2>
            <p className="text-sm text-muted-foreground">Your badges and milestones</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Earned Badges</CardTitle>
            </CardHeader>
            <CardContent>
              {achievements.length === 0 && (
                <Alert variant="destructive" className="mb-6">
                  <AlertTitle>Not implemented</AlertTitle>
                  <AlertDescription>
                    Achievements are empty because the backend isn’t providing them yet. Implement an achievements source
                    (e.g. Edge function <code>student-achievements</code>) and map it into <code>useDashboard("student")</code>.
                  </AlertDescription>
                </Alert>
              )}
              {achievements.length === 0 ? (
                <div className="text-center py-12">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Keep learning to earn badges!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {achievements.map((achievement) => (
                    <div
                      key={achievement.id}
                      className="flex flex-col items-center p-6 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 text-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                        <Award className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-1">{achievement.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        Earned {format(parseISO(achievement.earnedAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    </PageContainer>
  );
}

