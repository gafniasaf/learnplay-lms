import { PageContainer } from "@/components/layout/PageContainer";
import { StudentLayout } from "@/components/student/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, Trophy } from "lucide-react";
import { getStudentAchievements } from "@/lib/student/mockSelectors";
import { useStudentRange } from "@/hooks/useStudentRange";
import { format, parseISO } from "date-fns";

export default function StudentAchievements() {
  const { window } = useStudentRange();
  const achievements = getStudentAchievements(window);

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
                      <h3 className="font-semibold mb-1">{achievement.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Earned {format(parseISO(achievement.earnedISO), 'MMM d, yyyy')}
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

